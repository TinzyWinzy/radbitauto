# Firebase Migration Plan — Multi-Tenant Vehicle Import Portal

**Status:** ADOPTED (R-16). Build order §11 steps 1–4 implemented in `firebase/functions` (typecheck clean, 12/12 CIF golden-vector tests pass against ZIMRA official figures). Statutory verification: R-5 (VAT base = VDP + Customs Duty only, 15.5%), R-7 (no import-duty line; surtax 35% passenger >5yrs), R-8 (SI 54/2024 + SI 172/2024 age/eligibility rules) and R-11 (duty by vehicle type: 40/60/25/40/40) **RESOLVED from ZIMRA official sources**; carbon amounts use the ZIMRA published table and remain VERIFY at clearance. Emulator isolation suite **GREEN (25/25)**: 11 rules tests (tenant A/B isolation, RPC-only writes, tenant-scoped staff writes, config tax sets) + 14 function tests (createVehicle/createCase sequencing, ZIMRA golden persistence, R-12 stage gating + EAA gate, full enquiry→delivered pipeline paid-in-full, payment idempotency + no double credit + cross-tenant deny) under `firebase emulators:exec` against the portable JDK. This document remains the design reference; implementation artifacts: `firebase/firestore.rules`, `firebase/storage.rules`, `firebase/firestore.indexes.json`, `firebase/functions/src/*`. Not yet done: deploy target decision, PWA rewire, tenant A pilot.

**Core truth up front:** Firebase free tier (Spark) has no relational SQL. This plan re-models the system as Firestore documents + Security Rules + Cloud Functions. It is a **re-platform**, with the same 14-stage workflow, RBAC, CIF engine, and financial rules — expressed differently.

---

## 1. What carries over vs what is rebuilt

| Keeps | Rebuilt |
|---|---|
| Consolidated spec (workflow, guards, RBAC, documents) | SQL schema → Firestore collections |
| CIF duty / VAT / surtax / carbon **logic** | Postgres functions → TypeScript Cloud Functions |
| 14-stage machine + transition guards | `advance_import_stage` RPC → callable Cloud Function with Firestore transaction |
| Audit trail concept | `audit_log` collection (write-only via function) |
| 5-second-answer UX, WhatsApp deep-links, PWA | PWA now uses Firestore **built-in offline persistence** — Deletes our Dexie + polling design entirely (simplification) |
| Tenant branding / stage config | `companies/{id}/stages` subcollection + settings doc |

## 2. Excessive obligations Firestore imposes (the "no-free-lunch" list)

1. **No unique constraints** → per-company case numbering must come from a transactional counter doc (single authority).
2. **No `UPDATE ... WHERE status='pending'`** → confirm-payment atomicity needs a read-verify-write transaction (conflict retries handle races).
3. **Money is IEEE754 float by default** → use integer cents (`amountCents`), never raw decimals.
4. **No string `%substring%` search** → `global_search` becomes prefix/range queries + token arrays; heavy text search deferred to Algolia.
5. **No JOINs** → the dashboard's "case + vehicle + total balance" must be denormalized onto the `import_cases` doc (`balanceDueCents`) and maintained atomically by functions.
6. **Quota ceilings** (Section 9) are hard; they scale up with paid plans.

## 3. Data model mapping

All firestore ids are auto-generated unless noted. `money` fields are integer cents.

| PostgreSQL (current) | Firestore |
|---|---|
| `companies` + `company_settings` | `companies/{companyId}`, `company_settings/{companyId}` |
| `profiles` | `users/{uid}` (email, fullName, phone, isActive) |
| `staff` | `staff/{uid}` = { companyId, role: 'staff'\|'admin', isActive } |
| `customers` | `customers/{customerId}` = { companyId, userId, fullName, phone, isActive } |
| `vehicles` | `vehicles/{vehicleId}` = { companyId, vinChassisUpper, engineCc, make, model, year, sourceCountry, purchasePriceCents, yellowBookValueCents, eaaStatus, isCommercial, exemptionFlag, importLicenceRequired } |
| `import_cases` | `import_cases/{caseDocId}` = { caseNum 'EC-0001', companyId, customerId, vehicleId, currentStage, prevStage, statusNote, **balanceDueCents** (denorm), timestamps } |
| `import_stage_updates` | `import_cases/{caseDocId}/stage_updates/{id}` (subcollection) |
| `quotations` + `quotation_items` | `quotations/{quoteDocId}` = { companyId, caseId, version, valuationBasis, cifValueCents, customsDutyCents, importDutyCents, surtaxCents, vatCents, carbonTaxCents, totalDueCents, **totalPaidCents**, status, issuedAt } — line items flattened into arrays on the doc |
| `payments` | `payments/{paymentDocId}` — **doc id = `sha1(companyId|providerRef)`** for idempotent re-submission = { companyId, caseId, quotationId, amountCents, method, status, providerRef, proofUrl, createdAt } |
| `documents` | `import_cases/{caseDocId}/documents/{docId}` = { type, objectPath, fileName, mime, sizeBytes, verified, uploadedBy } |
| `tracking_updates` | `import_cases/{caseDocId}/tracking/{id}` |
| `notifications` | `users/{uid}/notifications/{id}` (per-user scope, cheap rules) |
| `enquiries` | `enquiries/{id}` = { companyId, customerId, caseId, message, direction, status, reply } |
| `tax_rates` + `customs_duty_bands` | `config/tax_rates/{setId}` = { scope, companyId?, effectiveFrom, vatPct, importDutyPct, surtaxThresholdYears, surtaxPct, dutyBands: [{minCc,maxCc,pct}], carbonTaxBands: [{minCc,maxCc,amountCents}] } |
| `stage_definitions` + `company_stages` | `stage_definitions/{key}` (global) + `companies/{companyId}/stages/{key}` = { position, enabled, customLabel } |
| `audit_log` | `audit_log/{entryId}` = { companyId, actorId, entityType, entityId, action, detail } |
| `case_sequences` | `companies/{companyId}/meta/counter` = { lastSeq } — incremented in a transaction |

### Composite indexes (must be declared)

- `import_cases`: `(companyId, currentStage)`, `(companyId, customerId)`, `(companyId, caseNum)`
- `quotations`: `(companyId, caseId, version)` (desc)
- `payments`: `(companyId, caseId, status)`
- `vehicles`: `(companyId, vinChassisUpper)`, `(companyId, year)`

## 4. Auth & tenant claims (replaces Supabase hook / Render auth-api)

**Firebase Auth** (email/password; phone later) is the identity system — free, zero code.

- Admin SDK (`functions.auth.user().onCreate`) runs on signup:
  1. Create `users/{uid}`.
  2. Look up `staff/{uid}` or `customers?userId==uid` (invite flow creates these docs first with `isActive`).
  3. Set **custom claims**: `{ app_role, company_id, customer_id }` — the Firestore equivalent of the JWT `request.jwt.claims`.
- `onCall` functions verify `context.auth.token.app_role` / `company_id` before any privileged action (mirrors our definer-RPC tenant checks).
- Registered-but-unlinked users carry no `company_id` → rules deny all tenant data (same as Render design).

## 5. Security Rules — the RLS equivalent

Firestore rules are server-enforced (not client filters), satisfying the SAD's "not merely an API-level filter". Representative skeleton:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function role()     { return request.auth.token.app_role; }
    function company()  { return request.auth.token.company_id; }
    function customerId(){ return request.auth.token.customer_id; }
    function isStaff()  { return isSignedIn() && role() in ['staff','admin']; }
    function isAdmin()  { return isSignedIn() && role() == 'admin'; }
    function sameCompany(cid) { return cid != null && cid == company(); }
    function ownsCase(caseId) {
      return get(/databases/$(database)/documents/import_cases/$(caseId)).data.customer_id == customerId()
          && get(/databases/$(database)/documents/import_cases/$(caseId)).data.company_id == company();
    }

    match /companies/{cid} {
      allow read:  if isSignedIn() && sameCompany(cid);
      allow update: if isAdmin() && sameCompany(cid);
    }
    match /companies/{cid}/stages/{key} {
      allow read:  if isSignedIn() && sameCompany(cid);
      allow write: if isAdmin() && sameCompany(cid);
    }
    match /customers/{id} {
      allow read: if isStaff() && sameCompany(resource.data.company_id)
                || (sameCompany(resource.data.company_id) && resource.data.userId == request.auth.uid);
      allow create: if isStaff() && sameCompany(request.resource.data.company_id);
      allow update, delete: if isStaff() && sameCompany(resource.data.company_id);
    }
    match /import_cases/{id} {
      allow read: if (isStaff() && sameCompany(resource.data.company_id))
                || (sameCompany(resource.data.company_id) && resource.data.customer_id == customerId());
      allow create: if isStaff() && sameCompany(request.resource.data.company_id);
      allow update, delete: if false;              // RPC-only (mirror: no direct UPDATE import_cases)
    }
    match /import_cases/{id}/stage_updates/{sid} {
      allow read: if isStaff() && sameCompany(resource.data.company_id) || ownsCase(id);   // resolve company via get
      allow write: if false;                        // written only by advanceImportStage
    }
    match /import_cases/{id}/documents/{docId} {
      allow read:  if isStaff() && sameCompany(resource.data.company_id) || ownsCase(id);
      allow create: if isStaff() && sameCompany(request.resource.data.company_id);
      allow update: if isStaff() && sameCompany(resource.data.company_id);
    }
    match /quotations/{qid} {
      allow read: if isStaff() && sameCompany(resource.data.company_id)
                || ownsCase(resource.data.caseId);
      allow write: if false;                        // only issueQuotation
    }
    match /payments/{pid} {
      allow read: if isStaff() && sameCompany(resource.data.company_id)
                || ownsCase(resource.data.caseId);
      allow write: if false;                        // only recordPayment/confirmPayment
    }
    match /users/{uid}/notifications/{nid} {
      allow read, update: if request.auth.uid == uid;
      allow create, delete: if false;
    }
    match /enquiries/{id} {
      allow read: if isStaff() && sameCompany(resource.data.company_id)
                || (resource.data.customer_id == customerId() && sameCompany(resource.data.company_id));
      allow create: if isSignedIn() && request.resource.data.customer_id == customerId()
                   && sameCompany(request.resource.data.company_id);
      allow update: if isStaff() && sameCompany(resource.data.company_id);
    }
    match /audit_log/{aid} {
      allow read: if isStaff() && sameCompany(resource.data.company_id);
      allow write: if false;
    }
  }
}
```

Key consequence: **no user role can mutate financial or workflow documents through the database**, exactly like the "RPC-only" hardening on Render. Integrity lives in Cloud Function transactions (Section 6).

### Storage rules (replaces R2 signed URLs)

```
match /documents/{companyId}/{caseId}/{docType}/{file} {
  allow read: if isStaff()
       && get(/databases/$(database)/documents/import_cases/$(caseId)).data.company_id == companyId
       && get(/databases/$(database)/documents/import_cases/$(caseId)).data.company_id == company();
  allow create: if isStaff() && sameCompany(companyId);
  allow update: if isStaff() && sameCompany(companyId);
}
match /payment-proofs/{companyId}/{caseId}/{method}/{file} {
  allow read, create: if isStaff() && sameCompany(companyId)
       && get(/databases/$(database)/documents/import_cases/$(caseId)).data.company_id == companyId;
}
```

No pre-signed-URL service needed — rules + the SDK's `getDownloadURL` handle it.

## 6. Business logic — Cloud Functions (replace SQL engine)

All privileged mutations are `functions.https.onCall`, signature-mirroring the PostgREST RPCs. They bypass rules via Admin SDK but **re-verify tenant & role from `context.auth.token` first** (the definer-function discipline).

| SQL function | Cloud Function | Integrity mechanism |
|---|---|---|
| `calculate_import_quotation(vehicle_id)` | `calculateImportQuotation({vehicleId})` | reads `config/tax_rates` (active, company-override-first like H4), `vehicles`; returns breakdown JSON (same math, TS) |
| `issue_quotation(case_id)` | `issueQuotation({caseId})` | **Transaction:** read vehicle+tax config → compute → read case.counter → write `quotations` vN + bump `case.quotationVersion` → recompute `import_cases.balanceDueCents` → audit + notification |
| `advance_import_stage(case_id, to_stage, note)` | `advanceImportStage({caseId,toStage,note})` | **Transaction:** read `companies/{id}/stages` ordering → verify `toStage == next enabled stage` (H3) → verify doc guards (invoice/BOL/EAA/clearance-set) → verify paid-in-full for readyForCollection → write case + stage_update + audit + notification |
| `record_payment(...)` | `recordPayment({...})` | deterministic doc id `sha1(companyId|providerRef)` → `set()` (merge) = idempotent (R-9); always status `pending` |
| `confirm_payment(payment_id)` | `confirmPayment({paymentId})` | **Transaction:** read payment → if not pending abort → set confirmed → `quotation.totalPaidCents += amount` → recompute `balanceDueCents` → audit + notify (H2 - race-safe via transaction retry) |
| `clearance_ready(case_id)` | `clearanceReady({caseId})` | read documents subcollection; return missing list |
| `global_search(query)` | subnet: PWA query, not a function | see Section 7 |
| case counter | `companies/{id}/meta/counter` in `createCase` transaction | race-safe sequential `caseNum` (replaces SQL sequence) |

**Guard table — unchanged from API_CONFIG §6.** The EAA-before-Shipped rule, purchase-invoice gate, and clearance-ready set carry over verbatim; only the hosting moves to TS.

## 7. Global search (replaces `%ilike%`)

Firestore has no substring search.

- **MVP:** range query on indexed fields — `import_cases.caseNum` prefix (e.g., `EC-10` range), `customers.lastNameLower` prefix, `vehicles.vinChassisUpper` exact/prefix. Staff UI exposes three search modes instead of one box.
- **Later:** Algolia/Typesense index fed by a `onDocumentCreated` function. Spec-stated "single box search" restored then.

## 8. Offline & "5-second answer" (replaces Dexie + polling)

- **Firestore offline persistence** (mobile Web PWA + Android WebView) replaces Dexie entirely: snapshot listeners sync deltas on reconnect; local writes queue automatically.
- `enabledPersistence()` on the PWA; `NetworkFirst` behavior for `quotations`/`payments` comes free from Firestore's cache semantics with listeners.
- **5-second answer benefit:** no polling loop, so the Firestore free-tier **read budget is mostly untouched** — a customer's dashboard reads are minimal and delta-only. This is a genuine tactical win over the Render polling design.
- Conflict rule is still **Server wins** (local mutations only via callable functions, which are serialized by transactions); out-of-sync local state re-syncs from server on next transaction.

## 9. Free-tier reality (Spark plan, verified)

| Resource | Free quota | Our usage driver |
|---|---|---|
| Firestore reads | 50k/day | dashboard snapshots (delta-only) — hundreds of users comfortably under |
| Firestore writes | 20k/day | staff actions + audit + notifications; fine for 2 tenants |
| Storage | 5 GB, 50k ops/day, 1 GB/day egress | document vault + PoP photos — fine; bump only if photos grow |
| Auth | 50k MAU (email); phone ≈10/day on Spark (paid for GA) | email/password for staff + simple customer logins |
| Cloud Functions | 2M invocations/mo | callable RPCs — generous for this workload |
| Hosting | 10 GB, 360 MB/mo transfer | PWA static shell — negligible |

**Ceiling note:** Spark caps apply per-day; sustained growth → Firebase Blaze (pay-as-you-go) or consolidation to paid storage. For MVP this is the cheapest, sleep-at-night path.

## 10. Risks of the Firebase path

| Risk | Mitigation |
|---|---|
| Financial math correctness in TS must match verified figures | Keep `calculateImportQuotation` as single source + unit tests against a golden CIF vector table (reuse spec R-5/R-11 pending verification) |
| Rules drift from function logic | One module exports both the rule-equivalent scope checks (`assertCanViewCase`) used by functions, plus the rules file is reviewed against it in CI |
| No SQL for ad-hoc reporting (balances, sums) | Pre-aggregate on `import_cases.balanceDueCents` + nightly `audit_log` rollup scheduled function |
| Vendor lock-in / data export | Firestore export to BigQuery/Avro weekly from day 1 |
| Unique-counter contention under high case-creation | Transaction on `meta/counter` serializes; volume is tiny at MVP arity |

## 11. Build order if you choose Firebase

1. Firestore collections + composite indexes + Security Rules + Storage rules (this is the "migration" — one `firestore.rules` + indexes file, no SQL).
2. `calculateImportQuotation` + `issueQuotation` (+ unit tests on the CIF golden vector).
3. `advanceImportStage` with guards; seed 14 stage definitions + tenant stage config.
4. Auth claims on signup + `recordPayment`/`confirmPayment`; audit + notifications.
5. PWA rewire: drop Dexie + polling, use Firestore listeners; staff pipeline + search modes.
6. RLS-isolation-equivalent test suite (tenant A staff can't read tenant B, direct write attempts rejected, double confirm yields one credit).
7. Load tenant A (Eddy) pilot; confirm carbon tax figures with clearing agent (ZIMRA published table is 2013 vintage) before Phase 2.

## 12. Verdict neutral table (if you decide now)

- **Firebase wins:** free start, no ops, built-in auth/storage/offline/analytics, fastest 5-second UX with delta sync, no 30-day DB expiry trap.
- **Render wins:** relational financial spine, portability of SQL, no vendor ceiling, unconstrained reporting.
- **Decision input missing:** none blocker — both satisfy RBAC + tenant isolation; Firebase needs the re-build cost (Sections 3–6), Render needs auth-api + paid Postgres eventually (db/RENDER.md).