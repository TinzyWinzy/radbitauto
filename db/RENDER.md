# Deployment — Render + PostgREST Backend

Operative deploy guide for the backend. Platform: Render (free-tier starts workable; see costs).

## 1. Services

| Service | Render type | Stack | Purpose |
|---|---|---|---|
| `db` | PostgreSQL (managed) | Postgres 15+ | Single source of truth, RLS enforcement |
| `postgrest` | Web Service (Docker) | `postgrest/postgrest` official image | Auto-generates the REST API from the schema; every query passes RLS |
| `auth-api` | Web Service | Node/Express (+ `pg`, `bcrypt`, `jsonwebtoken`) | Login/signup/change-password; derives JWT claims; S3 pre-signed URLs |
| `app` | Static Site | Built PWA (Vite) | Frontend; can stay on Vercel per the PWA spec instead |

There is no Supabase here: auth, storage, and realtime have no Render-native equivalents and are provided by `auth-api` + R2 + polling.

## 2. Database

1. Create a Render **PostgreSQL** instance (staging first; production later).
2. Apply migrations in order — `db/migrations/0001_schema.sql` → `0002_seed_defaults.sql` → `0003_rls_policies.sql` → `0004_functions_rpc.sql` — via `psql <your-render-db-url>` or the Render shell.
   - `0001` creates DB roles `anon` and `authenticated` and grants them to the user you ran the migration as. That user must therefore be the PostgREST connection user (`PGRST_DB_URI`).
   - Migrations are not yet executed anywhere — this is their first run; fix any parse/plan errors here.
3. Do not run as a different user than the PostgREST connection user, or re-run the `grant anon, authenticated to <user>`.
4. Backups: enable Render daily automated backups on production.

## 3. PostgREST service

Docker web service → image `postgrest/postgrest`.

Environment:

| Key | Value |
|---|---|
| `PGRST_DB_URI` | from Render Postgres `Internal Database URL` |
| `PGRST_DB_SCHEMAS` | `public` |
| `PGRST_DB_ANON_ROLE` | `anon` |
| `PGRST_DB_ROLE_CLAIM_KEY` | `.role` |
| `PGRST_JWT_SECRET` | same secret as `auth-api` `JWT_SECRET` |
| `PGRST_SERVER_PORT` | 80 (or Render-provided port) |
| `PGRST_DB_MAX_ROWS` | 1000 (safety cap) |
| `PGRST_DB_EXTRA_SEARCH_PATH` | `public` |

Verify after deploy:

```
curl -H "Authorization: Bearer <token>" https://<postgrest>.onrender.com/rpc/global_search?p_query=EC-0001
```

A demo should return only the tenant's rows; an anonymous `curl` to `/companies` must return `[]`.

## 4. auth-api service (Node)

Node web service in `auth-api/`. Minimum env:

| Key | Value |
|---|---|
| `DATABASE_URL` | same internal Postgres URL |
| `JWT_SECRET` | ≥32-char random; must equal PostgREST `PGRST_JWT_SECRET` |
| `JWT_TTL` | `86400` (24 h, will be lowered) |
| `S3_ACCOUNT_ID` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 credentials |
| `S3_BUCKET` | `documents` (and `payment-proofs`) |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |

Endpoints implemented in `auth-api`:

- `POST /auth/login` — lookup `profiles` by email; bcrypt verify; derive claims from `staff`/`customers`; sign JWT `{ role: 'authenticated', sub, app_role, company_id, customer_id, exp }`.
- `POST /auth/register` — creates `profiles` row (verified email optional in MVP).
- `POST /auth/invite-staff` — admin token; insert `profiles` + `staff`; respond temp password.
- `POST /auth/change-password` — authenticated; bcrypt rehash.
- `GET|PUT /storage/sign?doc_id=` — same case-visibility rule as the `documents` RLS policy, then R2 signed URL (read or PUT).

Server-side access checks in `auth-api` must **mirror the RLS rules**, because `auth-api` runs as the DB owner (not through PostgREST) and must apply the same `company_id`/`customer_id` scoping before issuing signed URLs. Keep these SQL snippets in one module with the documented policy so they cannot drift.

## 5. R2 storage

- Buckets: `documents`, `payment-proofs` — both private.
- Path convention: `{company_id}/{case_id}/{doc_type}/{uuid}.{ext}`.
- `payment-proofs` accepts only images (`image/*`) and PDFs; enforce `Content-Type` on upload.
- No public bucket. No unauthenticated reads. Signed URLs expire (default 15 min, PUT for upload, GET for download).

## 6. Frontend sync (replaces realtime)

- Poll PostgREST every 20–30 s (visible tab) for `import_cases`, `tracking_updates`, `payments`, `quotations`, `notifications`.
- Dexie offline queue replays on reconnect; conflict rule `Server-Version-Wins`.
- Point `VITE_POSTGREST_URL` and `VITE_AUTH_API_URL` at the Render services.

## 7. Deployment sequence (staging)

1. Postgres up → `psql` migrations → smoke query (`select count(*) from stage_definitions` → 14).
2. PostgREST up → anon-safe check + authed RPC smoke test.
3. `auth-api` up → register a user, log in, hit `/rpc/...` with the token.
4. **RLS isolation test suite** — create tenant A (Eddy) and tenant B (Muchi); assert: B staff cannot read A rows; customer of A cannot read B or other A customers' payments; anonymous returns nothing; direct `UPDATE import_cases` refused; `record_payment` + double `confirm_payment` yields one credit.
5. Only then load tenant data. This sequence is the difference between "designed" and "deployed".

## 8. Costs (Render, approximate)

| Item | Free tier | Production |
|---|---|---|
| Postgres | 256 MB / 7-day expiry | ~$6–25/mo |
| postgrest + auth-api | 512 MB each, sleeps ~15 min | ~$7–14/mo each |
| R2 storage | 10 GB free, no egress fees | ~$0.015/GB-mo |

Staging fits free tier; production ≈ $25–55/mo before frontend hosting.

## 9. Known gaps (not yet built)

- `auth-api` code itself is not written (design only). SQL moves/deploys first, auth service last.
- No CI/CD pipeline files yet.
- No observability (logs to Render console only).
- VAT base (R-5) and duty/carbon figures (R-11) are unverified by a domain expert.