# API Configuration — Multi-Tenant Vehicle Import Portal (Render + PostgREST)

Backend shape: **PostgreSQL (Render) + PostgREST + thin auth service + S3-compatible storage**. All security is enforced server-side by Row Level Security (database policies) and SECURITY DEFINER functions; PostgREST only exposes what the policies admit. Client-side role checks are UI-only.

## 1. Authentication & JWT claims

Auth is handled by a small service (`auth-api`, Node/Express) on Render. It owns passwords and signs JWTs with a secret shared with PostgREST.

| Endpoint | Role | Purpose |
|---|---|---|
| `POST /auth/login` | public | Verify `email`+`password` against `profiles.password_hash` (bcrypt); derives claims; returns `{ access_token, expires_in }` |
| `POST /auth/register` | public | Customer self-signup → creates `profiles` row (no tenant link) until staff attaches a `customers` row |
| `POST /auth/invite-staff` | admin (validated server-side) | Creates `profiles` + `staff` rows for a company, returns temp password |
| `POST /auth/change-password` | authenticated | Updates `profiles.password_hash` |
| `GET /storage/sign?doc_id=` | authenticated | Validates the caller's case visibility (same rules as RLS), returns short-lived pre-signed URL for the object key |

JWT claims issued by `auth-api` (all read by PostgREST/RLS):

| Claim | Meaning |
|---|---|
| `role` | `authenticated` — the PostgreSQL role PostgREST switches to; required by PostgREST |
| `sub` | `profiles.id` (uuid) |
| `app_role` | `admin` / `staff` / `customer` — derived from `staff.role` or `customers.user_id` link |
| `company_id` | the tenant the user belongs to (no user spans tenants in MVP) |
| `customer_id` | set only when `app_role = customer` (row-ownership anchor) |

A user with no `staff` and no `customers` link gets a token with only `sub` → all policies resolve claims to null → no tenant data (registered-but-unlinked).

## 2. PostgREST service configuration (Render web service, Docker)

| Env | Value |
|---|---|
| `PGRST_DB_URI` | Render Postgres URL (owner/`postgres` user — migration grants `anon`, `authenticated` to it) |
| `PGRST_DB_SCHEMAS` | `public` |
| `PGRST_DB_ANON_ROLE` | `anon` |
| `PGRST_DB_ROLE_CLAIM_KEY` | `.role` |
| `PGRST_JWT_SECRET` | same secret as `auth-api` (`JWT_SECRET`) |
| `PGRST_DB_PRE_REQUEST` | `public.pgrst_pre_request` (opt.) log fn |
| `PGRST_SERVER_PORT` | 5432 is the PostgREST default; set to 80 / Render-provided port |

Connection role switches to `anon` (no claims → no rows) or `authenticated` (claims drive RLS). `anon` need only the SELECT grant; RLS returns nothing for missing claims.

## 3. Policy helpers (claims → RLS)

| Function | Reads |
|---|---|
| `app_auth_uid()` | `request.jwt.claims ->> 'sub'` |
| `access_company_id()` | `request.jwt.claims ->> 'company_id'` |
| `access_role()` | `request.jwt.claims ->> 'app_role'` (defaults `anonymous`) |
| `access_customer_id()` | `request.jwt.claims ->> 'customer_id'` |

PostgREST places the decoded JWT in the `request.jwt.claims` setting (json). All policies reference these helpers — never hardcode claim names in queries.

## 4. Table access matrix

`R` SELECT, `I` INSERT, `U` UPDATE, `D` DELETE. Customers see only rows scoped to their `customer_id` + company.

| Table | Customer | Staff | Admin |
|---|---|---|---|
| companies | R (own) | R (own) | R, U |
| company_settings | R | R | R, U |
| profiles | R own, U own | R (company peers/customers) | R, U (peers) |
| staff | – | – | R, I, U, D |
| customers | R (self) | R, I, U, D (company) | R, I, U, D |
| vehicles | R (own cases) | R, I, U, D | R, I, U, D |
| import_cases | R (own cases) | R, I | R, I |
| stage_definitions | – | R | R |
| company_stages | – | R | R, I, U, D |
| import_stage_updates | R (own cases) | R | R |
| quotations | R (own cases) | R | R |
| quotation_items | R (own cases) | R | R |
| payments | R (own cases) | R | R |
| documents | R (own cases) | R, I, U | R, I, U |
| tracking_updates | R (own cases) | R, I, U | R, I, U |
| notifications | R, U (own) | R | R |
| enquiries | R, I (own) | R, U | R, U |
| tax_rates / duty_bands | – | R | R, I, U, D |
| audit_log | – | R (company) | R |

**Notes:**
- No direct `INSERT`/`UPDATE` on `quotations`, `quotation_items`, `payments`, `import_stage_updates`, or `import_cases`. All writes for these go through RPCs — financial amounts and stage history cannot be written or edited around the engine and audit trail.
- Payments are created only via `record_payment()` (always `pending`) and confirmed only via `confirm_payment()` (atomic single-statement flip; a concurrent second confirm is rejected).
- `vehicles`, `customers`, `documents`, `tracking_updates`, `enquiries` remain directly writable by staff under RLS.
- `tax_rates`/`customs_duty_bands` are DB config so statutory changes (SI updates) do not require redeploys.

## 5. RPC / function endpoints (PostgREST `rpc/...`)

| Function | Input | Returns | Roles | Notes |
|---|---|---|---|---|
| `calculate_import_quotation(vehicle_id)` | uuid | jsonb breakdown | staff, admin | Full CIF + duty + VAT + surtax + carbon; does not persist |
| `issue_quotation(case_id)` | uuid | quotation row | staff, admin | Computes, persists versioned quotation (R-10), notifies customer |
| `advance_import_stage(case_id, to_stage, note)` | uuid, text, text | import_stage_updates row | staff, admin | Enforces sequencing (next enabled tenant stage only) + document guards (Section 6); writes audit + notification |
| `record_payment(case_id, amount, method, provider_ref, proof_url, quotation_id)` | uuid, numeric, text, text?, text?, uuid? | payments row (pending) | staff, admin | Idempotent via `unique(company_id, provider_ref)` (R-9) |
| `confirm_payment(payment_id, note)` | uuid, text? | payments row (confirmed) | staff, admin | Atomic confirm (H2); rejected if not pending; updates `quotations.total_paid`, audit + notify |
| `clearance_ready(case_id)` | uuid | table(ready boolean, missing_docs text[]) | staff, admin | Checks 5 mandatory docs verified |
| `global_search(query)` | text | import_cases rows | staff, admin | Substring across case_id, customer name, VIN (GIN trigram indexed) |

All mutation RPCs are `SECURITY DEFINER SET search_path = public`, verify `staff` membership + tenant match explicitly (via `app_auth_uid()`), and are revoked from `anon`/`public` (only `authenticated` may execute). `case_sequences` is RLS-denied for all roles and only reached via the case-ref trigger.

## 6. Transition guards (in `advance_import_stage`)

Sequencing first: `p_to_stage` must equal the **next enabled stage** for the tenant (per `company_stages` ordering; disabled stages are skipped). Then document guards:

| To stage | Required present & verified |
|---|---|
| purchase_completed | `purchase_invoice` |
| export_processing | `export_certificate` |
| shipped | `bill_of_lading`; **+ `eaa_certificate` when `source_country = 'Japan'`** (R-3) |
| customs_clearance | export_certificate, bill_of_lading, road_manifest, condition_report, eaa_certificate |
| ready_for_collection | `sum(confirmed payments) >= latest issued quotation.total_due` |

## 7. Storage (S3-compatible — Cloudflare R2 recommended)

| Bucket | Visibility | Contents |
|---|---|---|
| `documents` | private | Vault: certificates, BOL, invoices |
| `payment-proofs` | private | Cash receipt / bank PoP photos (field capture) |

- **Object key:** `{company_id}/{case_id}/{doc_type}/{uuid}.{ext}` — company_id is the first path segment for simple scope checks.
- **Access:** files are never served directly. `GET /storage/sign` (auth-api) resolves `documents.id`, applies the same case-visibility rules as the `documents` RLS policy, then returns an expiring pre-signed URL (15 min). `storage.documents.uploaded_by`/`object_key` link rows.
- **Upload:** staff upload from the PWA by first creating the `documents` row, then PUT-uploading to the pre-signed upload URL issued by `/storage/sign` (same endpoint supports `PUT`).
- R2 tiering: private buckets cost \~$0.015/GB-mo; no egress fees (low-bandwidth friendly).

## 8. Sync & offline (no server-push realtime on Render)

- Render Postgres offers no Realtime. The PWA polls:
  - `import_cases`, `tracking_updates`, `payments`, `quotations`, `notifications` every 20–30 s while visible (backoff idle).
  - Polling rides the existing RLS — a customer's poll can only ever return their own rows.
- Dexie caches between polls (StaleWhileRevalidate-ish): dashboard listed as `stale-while-revalidate`; quotations/payments `network-first`; background-sync queue replays offline staff writes on reconnect (`Server-Version-Wins` conflict rule).
- Future: a WebSocket/SSE bridge service on Render if live push becomes necessary (Phase 4).

## 9. Client configuration (env)

| Variable | Value |
|---|---|
| `VITE_POSTGREST_URL` | https://<postgrest>.onrender.com |
| `VITE_AUTH_API_URL` | https://<auth-api>.onrender.com |
| `VITE_APP_TENANT_MODE` | tenant slug for pre-auth branding (preview deployments) |

Use `supabase-js`? No — use `@supabase/postgrest-js` (PostgREST client) or fetch, attaching `Authorization: Bearer <token>`. `auth-api` is the only consumer of `JWT_SECRET`/`S3_*` beside PostgREST.

## 10. Security guard rails

1. Tenant isolation is RLS, never filters in the client.
2. No cross-tenant read is possible even through a compromised app layer.
3. Mutation functions log to `audit_log` + notify; nothing mutates silently.
4. Payment duplication prevented by DB uniqueness on `provider_ref` (R-9).
5. Financial + workflow mutations are RPC-only; no direct DML on those tables.
6. All definer functions pin `search_path = public` (prevents search-path hijack).
7. Regulatory numbers live in `tax_rates`/`customs_duty_bands`, not in code (R-8).
8. Passwords never leave `auth-api`; bcrypt hashes only; `JWT_SECRET` never in the browser.

## 11. Pending verifications before go-live

- **R-5 (VERIFY):** VAT base = CIF + customs duty + surtax. Confirm with clearing agent; update `v_vat` in `calculate_import_quotation` if different.
- **R-11 (VERIFY):** placeholder duty bands (25–40% by cc) and carbon tax amounts are seed defaults — replace with current ZIMRA figures.
- **R-8 (VERIFY):** currency of SI 54/2024, SI 59/2026, SI 172/2024, Public Notice 84/2024.
- Migrations are **not yet executed**. Apply `db/migrations/0001..0004.sql` to a Render staging Postgres, then run the RLS isolation test suite before any tenant data (see `db/RENDER.md`).