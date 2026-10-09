# Production operations

Project: studio-285787437-bc95b, us-central1. Portal: https://studio-285787437-bc95b.web.app. Incident/support owner: brandontinoz@gmail.com.

## Access and billing

Agencies self-register after email verification. Invitations use private hashed tokens, matching verified email addresses and seven-day expiry. Never manually move an account into another agency without checking its existing membership and case ownership.

Platform operators use the existing platform administrator provisioning script with authorized Google application credentials. Keep privileged credentials outside source control. A platform administrator can configure pilot/active/suspended access and a manually invoiced USD monthly price in the onboarding administration screen. Suspending an agency denies its staff/customer operations through backend and security checks. No recurring card debit or automated WhatsApp integration is configured.

## Monitoring

The project has backend error email alerts, a public HTTPS uptime check and project-scoped USD 25 monthly budget alerts at 50%, 80% and 100%. Budget alerts are thresholds, not spending caps. Use Google Cloud Monitoring and Billing to confirm delivery/channel status and review costs. The reproducible configuration is firebase/scripts/configure-monitoring.ps1.

For an incident, record its time, affected case/workspace and action. Inspect Cloud Functions logs and the audit trail. Do not retry payment creation with a fresh idempotency key until its existing result is understood. Financial corrections retain the original entry and recalculate balances. Restore service first, then reconcile each affected quotation/payment and document the resolution.

## Recovery and retention

Firestore deletion protection is enabled, with seven-day point-in-time recovery and daily backups retained for 28 days. Uploaded objects have 28-day soft-delete protection. Active financial/case/audit records are not automatically purged. Recovery storage incurs charges. Before honoring deletion requests, determine legal/business retention requirements with the agency; do not delete financial history casually.

A production restore rehearsal into a separate database was rejected by automatic approval review because it would copy private client data and incur costs. Obtain explicit approval for the destination and cost before rehearsing with production data. Synthetic emulator recovery can be rehearsed without accessing client records. Backups being configured is not proof of a successful production restore.

For a production incident requiring restore, preserve the current database, identify the backup/PITR time and approved destination, restore into that destination, check record counts and representative tenant/quotation/payment ownership, then plan a controlled cutover. Never overwrite the active database during investigation. Object recovery uses the bucket's soft-deleted-object recovery controls within its retention window.

## Release

From firebase, run backend unit/type checks, emulator rules/function tests, browser tests and production build. Emulators must use demo-vehicle-import. Deploy only after the tests pass:

    firebase deploy --only firestore,storage,functions,hosting --project studio-285787437-bc95b

Check composite indexes are ready, the public landing/login/help/deep-link routes load, security headers and the PWA manifest are present, and unauthenticated callables reject requests. Perform desktop/mobile screenshot review. Client-specific acceptance uses representative imports and actual reconciled balances; automated tests use synthetic records.

For a hosting regression, use Firebase Hosting release history to roll back to the last verified version. Database and function changes require reviewed compatible source/rules rollback; never assume a hosting rollback undoes financial data or function deployments. Keep the release source and deployment logs together.

## Operating limits

Tax calculations are estimates, pending agency clearing-practitioner validation. BE FORWARD access is a public-link and reference workflow, without a partnership/API claim. WhatsApp messages are manually sent by staff. Quotes and receipts print through the browser. Network access is required for private records; Firestore uses memory caching, and old private-image caches are removed. Maximum instances are set to ten per second-generation function, not ten across the entire project.


## Subscription launch (4 October 2026)

New agencies start a 30-day Dealer trial (USD 29/month thereafter by manual arrangement; 5 business team members, 50 active vehicles/enquiries). Solo is USD 15/month (2 business team members, 15 active vehicles/enquiries). Customers are free. Core journeys are shared. Completed history is retained. See [SUBSCRIPTION_RELEASE.md](SUBSCRIPTION_RELEASE.md) for precise counting, enforcement, legacy migration, export and measurement boundaries.

Owners use **Plan & billing** in the workspace. A plan request does not change access. The platform operator reviews agency usage, verifies payment externally and records the invoice/payment references, plan and access end date in **Agency subscriptions**. Paid activation requires both references. For an agreed subscription lapse use paused/read-only, rather than security suspension. Existing pilot agencies require an agreed migration/start date; no silent price change or automatic cutoff is applied.

In-app renewal reminders run daily at 08:00 Africa/Harare. Check the `subscriptionMaintenance` scheduled job and Cloud Functions errors after deployment. Usage snapshots measure current live file bytes/objects and collection counts; Cloud Billing remains authoritative for charges. Record actual onboarding/support minutes against a ticket reference, then review the agency commercial report to understand support effort.

Owner JSON export remains available on expiry. It includes customer/cost information and must be stored privately; file attachments are excluded, and records can change during export. The export is not a restore-tested backup.

## Subscription maintenance incident (8 October 2026)

Cloud Logging confirms HTTP 500 and `Invalid response from metadata service: incorrect Metadata-Flavor header. Expected 'Google', got no header` on revision `subscriptionmaintenance-00001-dab` on 5–6 October. The same error persists on `subscriptionmaintenance-00002-kic` on 7–8 October. The likely failure is the first Storage listing during daily usage measurement: the global Gaxios 7 override forces a Headers-based response into Storage's GCP metadata 6 client, which reads response headers as object properties. A valid metadata header is therefore treated as missing. Remove the cross-major override and install from the updated lockfile; do not disable metadata validation or add broad retries. `storageMetadata.test.ts` exercises the Storage authentication dependency against a local metadata server with a valid header.

After verified deployment, run only the subscriptionMaintenance scheduler job once and check its HTTP outcome, reminder deduplication and daily usage snapshots. Existing reminders may already have been committed before the Storage failure; deterministic notification IDs prevent duplicate reminders. Daily usage snapshots may be overwritten for the same UTC day. Do not delete or rewrite audit, billing, payment, quotation or subscription-event history. Maintenance does not charge money or activate plans. Never replay payment/refund/activation calls to recover this job; reconcile any separate ambiguous financial action using its original request key and existing audit records first. Missing historical measurements cannot be reconstructed accurately by rerunning today's job.

Dealership stock photos are optimized in the browser before upload: JPEG/PNG/WebP input up to 20 MB, longest edge at most 1920 pixels, re-encoded to WebP where supported and under 2 MB. Re-encoding removes embedded camera metadata. Storage and the attachment callable retain their type/size checks. This applies only to vehicle marketing photos; financial evidence and private documents retain their original upload flow. Existing stored images are unchanged.

Deployment verification: Functions and Hosting deployed successfully on 8 October 2026. Maintenance revision `subscriptionmaintenance-00003-jid` is ACTIVE. One manual scheduler invocation at 11:01 Africa/Johannesburg returned HTTP 200; today's usage snapshots were verified for all five active agencies (no additional companies page). Public landing/login/help/dealership deep link and manifest returned HTTP 200 with security headers. The deployed dealership bundle contains compression, and an unauthenticated attachDealerStockPhoto call returned HTTP 401. No financial actions were replayed.

Release checks: 29 backend unit tests and 90 emulator tests passed. The broad browser run passed 47 cases and exposed five stale/timing-sensitive test assertions; corrected dealership, landing and platform cases passed targeted reruns. Email verification regression passed, with the throttling assertion passing on retry (remaining timing sensitivity). Backend type/build and production frontend build/prerender passed. Generated release screenshots remain in the workspace after automatic review rejected their cleanup; no screenshots were discarded.

Register vehicle photo follow-up (8 October 2026): registration now accepts up to eight optional vehicle photos, compresses them before storage, and attaches them to the saved vehicle with an audit entry. Attachment retries reuse the same object path and do not recreate the vehicle or duplicate photo/audit entries. Registered photos carry into direct dealer stock and prepared-acquisition transfers. Storage creates remain tenant-scoped, subscription-gated and immutable; photo signature/type/size checks run server-side. Synthetic emulator checks, including the new attachment tenant/deduplication/expiry test, passed. A browser test verified interrupted attachment recovery with one vehicle creation and photo carryover into stock.

Deployment verification (9 October 2026): `firebase deploy --only firestore,storage,functions,hosting --project studio-285787437-bc95b` completed. firebase-tools 15.16.0 refused to resolve a hosting target without a site name, so `firebase.json` now declares `"site": "studio-285787437-bc95b"` (the project's only site); the runbook command above is unchanged. Predeploy guard, functions typecheck/build and the web build/prerender/copy-hosting step all passed; hosting uploaded 64 files (25 new). Two function updates returned transient HTTP 429 quota errors (`subscriptionOverview`, `verifySupplierLead`) and succeeded on the CLI's own retry. `firestore.rules` and `firestore.indexes.json` were unchanged and `firestore.rules` was not re-uploaded; `storage.rules` was released, and it now accepts a stock-photo create when the vehicle **or** the dealer-stock record owns the identifier. No new composite index is required: supplier stock is read from the single `supplier_catalogues/beforward` snapshot document.

Live checks: `/`, `/imports`, `/help`, manifest and service worker returned HTTP 200 with the configured CSP, HSTS and `X-Frame-Options`, and the custom domain `https://auto.radbitstudios.co.zw/imports` serves the same new bundle (`index-pI2VoLYH.js`). `publicVehicleCatalogue`, `publicSupplierCatalogue` and `publicImportDealers` returned HTTP 200; `bulkImportRecords` and `convertDealerLead` returned HTTP 401 for anonymous callers. `enquireSupplierVehicle` is deliberately public with an IP/hour throttle, so an empty payload returned `invalid-argument` (HTTP 400) rather than an auth rejection and **no enquiry was submitted**. Read-only live verification returned 124 listings, two eligible agencies and 20 gallery photographs for CE457744 with no 390px overflow (`web/scripts/verify-supplier-live.mjs`, `submittedEnquiries: 0`). Rollback: hosting release history for a hosting regression; function and rules changes need a reviewed compatible source rollback, as above.


SEO canonical and real 404 release (9 October 2026): hosting-only deploy. Every published URL now points at the preferred host `https://auto.radbitstudios.co.zw`: canonical/`og:url`/`og:image`/`twitter:image` and JSON-LD in `web/index.html`, the `SITE` constant in `web/src/components/Seo.tsx` (drives `/imports` and `/showroom/{slug}`), the `AutoDealer` JSON-LD URL in `Showroom.tsx`, `robots.txt` `Sitemap:`, both `<loc>` entries in `sitemap.xml` and the `llms.txt` links. Soft-404s are removed: the catch-all `** -> /index.html` rewrite was replaced by explicit SPA globs (`/login`, `/onboarding`, `/pending`, `/agency/setup`, `/imports`, `/imports/**`, `/showroom/**`, `/invite/**`, `/app`, `/app/**`, `/__/**`), so unmatched paths now fall through to a static noindex `404.html`. `favicon.ico` was added (32x32 PNG wrapped as ICO) because removing the catch-all would otherwise have turned `/favicon.ico` into a 404; `index.html` and `404.html` reference it after the SVG/PNG icons.

Live verification on the custom domain: `/vehicles`, `/pricing`, `/nonexistent`, `/abc/def` return **404** with the `404.html` body (`noindex, follow`, title `Page not found | Radbit Auto`) and the full CSP/HSTS/`X-Frame-Options`/`X-Content-Type-Options` header set on the 404 response; `/`, `/imports`, `/login`, `/app`, `/app/billing`, `/onboarding`, `/pending`, `/agency/setup`, `/invite/x1` return **200**; `/help` 301s to `/help/` (relative Location, same host) then **200**; `/favicon.ico` returns **200** as `image/x-icon`. Served HTML carries the custom-domain canonical/OG tags and `WebSite` JSON-LD `url`; `robots.txt` and `sitemap.xml` list only `auto.radbitstudios.co.zw`. `/imports/{unknown-id}` stays **200** by design (a real route with a client-side "no longer in the selection" state), not a soft 404. `https://studio-285787437-bc95b.web.app/nonexistent` also returns 404, and both hosts emit the same custom-domain canonical, so the preferred host is unambiguous. No business functions, rules or indexes were touched.
