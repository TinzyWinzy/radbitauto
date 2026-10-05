# Multi-Tenant Vehicle Import Customer Portal — Consolidated Specification

**Status:** Consolidated working spec (MVP)
**Sources:** `PRD.txt`, `pwa.txt`, `sad.txt`
**Scope:** Single authoritative document. Where source documents contradict, this spec records the resolution and flags the decision in Section 17 (Conflict Resolution Register).

**Evidence labels used:**
- **CONSISTENT** — all source documents agree.
- **RESOLVED** — sources conflicted; a decision was made here.
- **VERIFY** — value is regulatory/market data that must be confirmed against the authoritative source before build.

---

## 1. Executive Summary

A centralized "System of Record" for the Zimbabwean vehicle import lifecycle, replacing fragmented WhatsApp threads and manual paperwork with a branded, mobile-first, multi-tenant customer portal. Tenants are sourcing businesses and clearing agents (Eddy Customs, Muchy Motors initially); their customers get a "My Imports" dashboard answering *where is my vehicle, how much do I owe, what stage is it at, how do I reach the agent* within 5 seconds of opening the app.

This is an operational "Professional Operating Platform" — not a marketing site.

## 2. Market Context

| Metric | Value | Evidence |
|---|---|---|
| Market dominance | Used imports >95% of acquisitions | CONSISTENT |
| Sourcing | South Africa (~US$61M), Japan (~US$50M), UK (~US$5.53M) | CONSISTENT |
| Import volume trend | ~US$2.5M/mo (2023) → ~US$6M/mo by Q1 2026 | CONSISTENT (VERIFY source provenance) |
| Total import bill reference | ~US$59.4M vehicle imports in Apr 2025 (7.6% of national bill) | PRD only; VERIFY |
| Transit corridors | Durban, Beira, Walvis Bay | CONSISTENT |
| Typical transit window | 24–34 days | CONSISTENT |

## 3. Consolidated Architecture

### 3.1 Two distinct layers (the core architectural decision)

**System of Record = PostgreSQL with Row Level Security (RLS).** Every query is scoped to the authenticated tenant's `company_id` at the database level. This is the security boundary — not the application layer. The SAD's RLS model is authoritative for the backend.

**Offline = Firestore built-in persistence on the PWA frontend.** Snapshot listeners sync deltas on reconnect; local writes are queued server-side. Dedicated local cache (Dexie) and polling are dropped (R-16). Tenant isolation is enforced by Firestore Security Rules (server-enforced, RLS-equivalent) — client filtering is defense-in-depth only.

### 3.2 Recommended stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vite + React (TypeScript) | State-heavy dashboard, fast HMR |
| Styling | Tailwind CSS | Mobile-first, professional automotive aesthetic |
| PWA | vite-plugin-pwa (Workbox) | Offline shell, app-like experience |
| Local cache / offline queue | Firestore built-in persistence | Delta sync replaces Dexie + polling (R-16) |
| Backend | Firebase: Firestore + Cloud Functions | Server-enforced rules; RPC-only financial/workflow writes |
| Auth | Firebase Auth + custom claims `app_role`/`company_id`/`customer_id` | Server validates claims per request |
| Storage | Firebase Storage + rules (company/case-scoped) | No signed-URL service needed; rules check case ownership |
| Realtime | Firestore snapshot listeners | Delta-only sync (5-second-answer) |
| Deploy | Firebase Hosting (PWA) + Cloud Functions + Firestore | Free tier fits MVP (R-16) |

> Decision note: `pwa.txt` specified server-side "Vercel Functions" as the API. Platform path: PostgreSQL + RLS was designed for Render (R-15), then **Firebase was adopted** (R-16): Firestore + Security Rules + Cloud Functions + Firebase Auth + Storage. Tenancy, 14-stage workflow, CIF guards, and RPC-only financial writes carry over; the SQL artifacts in `db/` are retained as reference only. Implementation lives in `firebase/`. Statutory figures remain VERIFY (R-5, R-8, R-11).

## 4. Multi-Tenancy & Security

- **Isolation model:** Shared database, shared schema, strict logical isolation via a `company_id` (tenant id) foreign key on every tenant table.
- **RLS policy:** one policy per table: `company_id = (auth claim company_id)`; owner/agency relationship must match. A Muchy Motor operative cannot query Eddy Customs data even if application code is compromised.
- **API layer:** server re-validates the JWT `company_id` claim against the resource before returning data.
- **Client-side role checks:** UI tailoring only; never a security barrier.
- **Storage:** file paths obfuscated, never public; access via temporary pre-signed URLs issued only after server-side `company_id` + role authorization.

### 4.1 Roles (RBAC)

| Role | Responsibilities | Permissions |
|---|---|---|
| Customer | Monitor import progress; manage payments & documents | View own cases, quotations, documents; submit enquiries; WhatsApp deep-links. View-only. |
| Staff | Operate the import lifecycle for customers | CRUD customers/cases/vehicles; upload documents; manual tracking updates; record cash/bank payments. No tenant config. |
| Administrator | Oversee operations, branding, configuration | All Staff permissions + manage staff accounts; enable/disable/rename/reorder workflow stages; company-wide settings; branding. |

## 5. Tenant Configuration

Per-tenant configuration object drives UI and logic:

| Group | Fields |
|---|---|
| Branding | Name, logo, primary/secondary colors, branch address |
| Logistics | Case ID prefix (EC-, MM-), default port of entry |
| Workflow | Which import stages are enabled/disabled/reordered |
| Payments | Instructions per method (EcoCash, InnBucks, Bank) |
| Contact | WhatsApp number for deep-linking |

## 6. Data Model

| Table | Primary Key | Key Fields |
|---|---|---|
| companies | id | name, logo_url, case_prefix, contact_whatsapp, primary_color |
| company_settings | company_id | branding, stage ordering, currency, default_port |
| users | id | email, role (Admin/Staff/Customer), company_id |
| customers | id | full_name, phone_number, whatsapp_ref, company_id |
| staff | id | user_id, company_id, role |
| vehicles | id | vin_chassis (indexed), engine_no, make, model, variant, year, source_country, purchase_price, eaa_status |
| import_cases | id | case_id (prefix+seq, unique per company), customer_id, vehicle_id, current_stage, company_id |
| import_stage_updates | id | case_id, stage_name, status, staff_id, timestamp, note |
| quotations | id | case_id, cif_value, total_duty, total_surtax, total_vat, status, valuation_basis |
| quotation_items | id | quotation_id, item, amount (freight/insurance/port/storage) |
| payments | id | case_id, amount, method (EcoCash/InnBucks/Bank), status (Pending/Confirmed), proof_url |
| documents | id | case_id, type (BOL/EAA/Manifest/Invoice/ConditionReport), s3_url, uploaded_at |
| tracking_updates | id | case_id, location, coordinates_manual, timestamp, staff_id |
| notifications | id | user_id, case_id, type, payload, created_at |
| enquiries | id | case_id, customer_id, message, whatsapp_ref, status |

**Index requirements:** compound index on `(company_id, id)` for every tenant table; `vehicles.vin_chassis` indexed; `import_cases.case_id` unique per company.

## 7. Import Workflow — 14-Stage State Machine

The system treats the lifecycle as a formal state machine. Administrators may enable/disable/rename/reorder stages per tenant. Transition guards prevent "milestone jumping".

| # | Stage | Transition Guard |
|---|---|---|
| 1 | Enquiry | — |
| 2 | Quotation | Case has a quotation |
| 3 | Payment Confirmed | ≥1 confirmed payment (PoP) recorded |
| 4 | Vehicle Sourced | — |
| 5 | Purchase Completed | Purchase Invoice uploaded |
| 6 | Export Processing | Export Certificate uploaded; for Japan-sourced: EAA Certificate of Conformity |
| 7 | Shipped | Bill of Lading metadata present; EAA required for Japan-sourced (see R-3 note) |
| 8 | In Transit | — |
| 9 | Arrived | — |
| 10 | Customs Clearance | Case is "Clearance Ready" (all mandatory documents) |
| 11 | Duties/Charges | Duty calculation run |
| 12 | Registration/Compliance | — |
| 13 | Ready for Collection | Outstanding balance settled to 0 |
| 14 | Delivered | — |

Every status/payment change is logged to `import_stage_updates` with staff user id + timestamp (audit trail).

## 8. Regulatory Engine (Zimbabwe)

### 8.1 Age restrictions (SI 54 of 2024, SI 59 of 2026)

- **Prohibited:** passenger cars, passenger vans (10+ seats), and double-cab trucks older than 10 years from manufacture date.
- **Exempt:** heavy commercial vehicles (haulage trucks, tractors, specialized mining/construction equipment) — no age cap.

### 8.2 Special exemptions (SI 172 of 2024)

| Exemption | Conditions | System handling |
|---|---|---|
| Deceased estates | Inherited vehicles | Exemption flag + supporting doc |
| Returning residents | 2+ years abroad (or 6 months government assignment) AND 6+ months vehicle ownership | Proof documents; immigrant's rebate |
| Antique/Classic | 25+ years old | Import Licence from Ministry of Industry & Commerce required; flag five criteria: era-representative design, originality, well-maintained condition, rarity, historical significance |

### 8.3 Mandatory inspection (PVoC)

Hard gate: the **EAA Certificate of Conformity** (East Africa Automobile Services PVoC) is mandatory for Japan-sourced imports. A case may not reach the **Shipped** stage without it. "Clearance Ready" at Stage 10 additionally requires the full document set (Section 10).

> R-3 resolution: PRD stated the EAA gate at "Customs Clearance"; pwa/sad enforce at "Shipped" (Export Processing for Japan). The stricter, earlier gate is adopted because it prevents shipment of a non-conformant vehicle. VERIFY the exact enforcement stage with an agent before build.

## 9. CIF Duty Calculation Engine

### 9.1 Valuation basis

- **Base:** purchase invoice price.
- **Anti-under-valuation:** if the Japanese Yellow Book Value exceeds the purchase invoice price, the Yellow Book Value is used as the base. (Adopts PRD's max-of rule, which *prevents* under-valuation penalties, over pwa's "fallback if contested" phrasing — R-4.)
- **CIF =** Purchase Price + Shipping to Port + Insurance + Port/Storage Charges + Freight to Zimbabwe border.

### 9.2 Tax components

| Component | Rate | Basis / condition |
|---|---|---|
| Customs Duty | 25–60% | By vehicle type (see 9.2a); on CIF base |
| Surtax | 35% | Passenger-type vehicles (sedans/station wagons) >5 years old; pickups/double cabs exempt |
| VAT | 15.5% | **VDP + Customs Duty** (surtax excluded; see R-5). Standard rate since 1 Jan 2026 (Finance Act No. 7 of 2025) |
| Carbon Tax | Flat, capacity-based | Engine capacity range fee; ZIMRA published table ($6/$11/$15/$30) — VERIFY currency |

> R-5 (RESOLVED, ZIMRA official, 12 Sep 2026): No separate "Import Duty" line exists. VDP = CIF + other charges. VTP = **VDP + Customs Duty only**. VAT = VTP × rate. Surtax is **not** part of the VAT base. The PRD/pwa formulations (CIF+CD+Import Duty or CIF+CD+Surtax) both double-count; the engine now uses the ZIMRA formula.

### 9.2a Duty schedule by vehicle type (ZIMRA official, VERIFIED)

| Category | Duty % |
|---|---|
| Sedan / station wagon | 40% |
| Pick-up ≤800 kg payload | 25% |
| Pick-up 800–1400 kg payload | 40% |
| Pick-up 1400 kg – <5t GVM | 40% |
| Double cab | 60% |

Config-driven (map keyed by `vehicle.category`), not hard-coded; edges change with statutory updates. Full schedule beyond these categories requires the current Tariff Handbook (SI) — VERIFY at clearance.

### 9.3 Vehicle category → duty tier

Duty is levied **by vehicle type** (ZIMRA official), not engine size. The category field (`sedan_station_wagon`, `pickup_up_to_800kg`, `pickup_801_to_1400kg`, `pickup_over_1400kg`, `double_cab`) drives the rate and must be tenant-visible; it is a config table (`dutyRates` on the tax-rate set), not hard-coded, because rates change with statutory updates. Engine cc is still captured (drives carbon tax). VERIFY the full Tariff Handbook schedule at implementation time.

## 10. Document Vault

**Mandatory categories:** Export Certificate, Bill of Lading (BOL), Road Manifest (agent-provided), Condition Report (mechanical/exterior), EAA Certificate of Conformity.

- A case is **Clearance Ready** only when all five are uploaded and verified.
- Storage: encrypted object storage; paths obfuscated; access only via expiring pre-signed URLs after server-side `company_id` + role authorization.
- Field capture: PWA camera access to photograph cash receipts / bank Proof of Payment (PoP) in the field (shadow-cash economy requirement).

## 11. Communication & WhatsApp Layer

- **Event-driven notifications:** on any `import_cases.status` change → in-app alert + WhatsApp deep-link generation + audit log entry.
- **WhatsApp deep-linking:** pre-filled button on high-friction screens (Quotation, Payment, status updates):
  `Hello, I need an update on Case [TENANT_PREFIX]-[CASE_ID]`
  (Confirmed example: "Update on EC-1042").
- Integration works *with* WhatsApp dominance without ceding the audit trail to it.

## 12. PWA, Offline & Sync Strategy

- **Caching (Workbox):**
  - `StaleWhileRevalidate` for dashboard and vehicle lists.
  - `NetworkFirst` for quotations and payment records (integrity).
  - Offline shell so the dashboard structure loads instantly regardless of network (data-light, low-bandwidth corridors like Beitbridge).
- **Background sync:** staff at border posts update status offline; auto-reconcile on reconnect.
- **Conflict resolution:** versioned state; on conflict, **Server-Version-Wins**; client prompts the user to merge or overwrite when local writes are behind the server's version counter.
- **Web App Manifest:** Android home-screen install, bypassing app stores.

## 13. Interface Modules

### 13.1 Customer dashboard ("My Imports")

- Mobile-first card list: vehicle make/model, status pill (🚢 In Transit, 🛂 In Clearance, ✅ Ready for Collection), progress indicator, "View Import".
- Import detail: 14-stage vertical timeline, financial position (Total Due vs Paid), document download access, context-aware WhatsApp deep-link.
- **5-second answer rule:** Status / Financial position / Next milestone / Document availability / Contact (see Section 15).

### 13.2 Staff & Admin pipeline

- Kanban or list view filtered by stage (e.g., "Vehicles Awaiting EAA", "Shipped").
- Audit trail on every status/payment change (`import_stage_updates`).
- **Global search (staff-only):** across `vin_chassis`, customer name, and `case_id`.

## 14. Implementation Roadmap

| Phase | Focus | Key Deliverables |
|---|---|---|
| 1 | Core operations | Auth + multi-tenant config; Import Case & vehicle profiles; 14-stage state machine with guards; customer dashboard shell |
| 2 | Finance & documents | CIF engine (Yellow Book logic); VAT/surtax/carbon tax config; Document Vault + pre-signed URLs; WhatsApp deep-links |
| 3 | Experience | Tracking updates; full offline shell + background sync; field photo capture for PoP; event-driven notifications |
| 4 | Integrations | ZIMRA ASYCUDA fiscalisation; WhatsApp Business API; EcoCash/InnBucks payment gateways; automated shipping tracking APIs |

Vercel staging uses env vars (e.g., `VITE_APP_TENANT_MODE`) to drive tenant-specific preview deployments.

## 15. MVP Success & Acceptance Criteria

A customer must answer all of the following within 5 seconds of opening the app (SAD's superset of 7 is the acceptance list):

1. What vehicle am I importing?
2. How much have I paid?
3. How much do I still owe?
4. Where is my vehicle currently located?
5. What is the next milestone?
6. Are my documents available for download?
7. How do I contact my agent?

Acceptance additionally requires: no cross-tenant data leakage (RLS test suite), audit trail completeness, offline status updates reconcile without data loss.

## 16. Risks & Open Questions

| Risk / question | Handling |
|---|---|
| VAT base formula unconfirmed (R-5) | Confirm with clearing agent before building the engine configuration |
| EAA gate placement (R-3) | VERIFY; current decision = before Shipped for Japan sourcing |
| Duty band edges (25–40%) | Config table, not hard-coded; refresh with statutory updates |
| Regulatory volatility | New SIs arrive frequently (SI 54/2024, SI 59/2026, SI 172/2024, Public Notice 84/2024); keep rules in DB not code |
| Fiscalisation / ASYCUDA | Phase 4, asynchronous design, no blocking dependency |
| Multi-currency & cash payments | Payments are recorded manually with PoP photos as the audit evidence in MVP |

## 17. Conflict Resolution Register

| # | Conflict | Sources | Resolution | Status |
|---|---|---|---|---|
| R-1 | Backend architecture | pwa: Dexie as app DB, Vercel Functions API; sad: PostgreSQL + RLS + S3 | Postgres + RLS = system of record; Dexie = offline cache/queue; recommended managed Postgres; serverless functions reserved for integrations | RESOLVED (decision) |
| R-2 | Stage count | pwa: "13-stage timeline"; PRD/sad: 14 stages | **14 stages** (Enquiry → Delivered) everywhere | RESOLVED |
| R-3 | EAA gate position | PRD: before Customs Clearance; pwa/sad: before Shipped | Enforce at Export Processing/Shipped for Japan sourcing; Clearance Ready = full doc set | RESOLVED + VERIFY |
| R-4 | Yellow Book rule | PRD: use if exceeds invoice; pwa: fallback if contested | Valuation base = max(invoice, Yellow Book) | RESOLVED (anti-under-valuation) |
| R-5 | VAT base | PRD: CIF+CD+Import Duty; pwa: CIF+CD+Surtax | **ZIMRA official: VTP = VDP + Customs Duty only; VAT = VTP × 15.5%** (Finance Act No. 7 of 2025, effective 1 Jan 2026). No separate Import Duty line; surtax excluded from VAT base. Engine corrected | RESOLVED (ZIMRA official) |
| R-6 | Success criteria | PRD: 4 questions; sad: 7 questions | Adopt SAD's 7 (superset) | RESOLVED |
| R-7 | Surtax duplication | sad/sad-level mentions of surtax vs import duty | No separate Import Duty line on private motor vehicles (ZIMRA); surtax 35% on passenger types >5yrs only (pickups/double cabs exempt) | RESOLVED (ZIMRA official) |
| R-8 | SI references | PRD/SAD also cite SI 59 of 2026, Public Notice 84 of 2024 (SAD only) | **Age/eligibility rules** (not currency): SI 54/2024 bans imports ≥10 years old; SI 172/2024 exempts deceased estates, immigrants (SI 257/2003 & SI 154/2001), diplomats and antique/classic ≥25yrs (Import Licence required). Duty payable in USD | RESOLVED (Public Notice 84 of 2024) |
| R-9 | Payment integrity | none (new) | Unique `(company_id, provider_ref)` prevents double-recording a PoP; confirmation only via `confirm_payment()` | RESOLVED (DB constraint) |
| R-10 | Quotation history | none (new) | Quotations versioned per case `(company_id, case_id, version)`; `issue_quotation()` computes from engine and persists | RESOLVED (DB constraint) |
| R-11 | Duty bands & carbon tax seeds | duty bands 25–40% and carbon amounts were descriptive only | **Duty by vehicle type** (ZIMRA official): sedan/station wagon 40%, double cab 60%, pick-ups 25–40% by payload. Surtax 35% passenger >5yrs (exempt for pickups/double cabs). Carbon = ZIMRA published $6/$11/$15/$30 (2013 vintage; VERIFY currency). Seed + tests updated | RESOLVED (ZIMRA examples); carbon VERIFY |
| R-12 | Stage sequencing | SAD required no milestone jumping; v1 enforced only document guards | `advance_import_stage` now advances only to the **next enabled tenant stage** (per `company_stages` ordering); disabled stages skipped | RESOLVED |
| R-13 | Financial write path | v1 allowed direct staff INSERT/UPDATE on quotations/payments (engine bypass) | All writes on `quotations`, `quotation_items`, `payments`, `import_stage_updates`, `import_cases` are RPC-only; `confirm_payment` is atomic (no double-credit) | RESOLVED |
| R-14 | Tax-rate resolution | v1 picked active `tax_rates` by `id` (nondeterministic with company overrides) | Deterministic: company-scoped set wins, else global; tie-break by `effective_from desc` | RESOLVED |
| R-15 | Backend platform | originally designed against Supabase (auth.users, auth.jwt(), token hook, Storage, Realtime) | Render backend: `profiles` is the self-contained user table (bcrypt), claims read from PostgREST `request.jwt.claims`, `auth-api` signs JWTs, R2 pre-signed URLs, polling replaces realtime | SUPERSEDED (R-16) |
| R-16 | Backend platform (final) | R-15 (Render/PostgREST) vs Firebase free tier | **Firebase adopted** (decision): Firestore + Security Rules (server-enforced tenant isolation, RLS-equivalent) + Cloud Functions (RPC-only financial/workflow writes) + Firebase Auth (custom claims app_role/company_id/customer_id) + Storage rules. Money as integer cents; payment idempotency via deterministic doc id `sha1(company_id\|provider_ref)`; quotation versioning via `import_cases.quotationVersion` counter (transactional); offline = Firestore persistence (replaces Dexie/polling). Postgres artifacts (`db/migrations`, `db/API_CONFIG.md`, `db/RENDER.md`) retained as reference only. Build in `firebase/`. Statutory figures: R-5/R-7/R-8/R-11 RESOLVED (ZIMRA official); carbon amounts VERIFY at clearance | RESOLVED |

**Schema deltas vs Section 6 data model:** `vehicles.engine_cc` + `vehicles.category` added (drives duty rate by type + carbon tax); `tax_rates` + duty schedule as `dutyRates` map (config-table driven, not code); `case_sequences` used for `[PREFIX]-NNNN` generation; `payments` add `provider_ref` + `proof_url` for field PoP photos; quotation/vehicle financial fields in integer cents.

**Build guards:** (1) rules live in DB config, not code; (2) every model read/write path is covered by an RLS test; (3) no feature ships without the 5-second-answer being demonstrable on a mid-range Android over 3G.