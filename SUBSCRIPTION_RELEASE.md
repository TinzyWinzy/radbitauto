# Subscription release — 4 October 2026

## Commercial offer

Solo: USD 15/month, 2 active business team members including administrators/owner, 15 active vehicles/enquiries.
Dealer: USD 29/month, 5 active business team members including administrators/owner, 50 active vehicles/enquiries.
New self-service and platform-created agencies receive a 14-day Dealer trial. Customer portal accounts do not consume staff seats. Verified platform support views do not consume business seats. Growth is not offered.
All core stock, import, sales, documentation, customer portal and CSV/Excel workflows are shared across both plans. There is no automated payment collection, recurring debit, Paynow integration or automatic supplier integration.

## Enforcement

Backend plan policy is the source of truth. Managed subscriptions require a supported plan, trial/active status and a future accessUntil timestamp. Paused and expired subscriptions are read-only. Explicit security suspension sets company.isActive false and denies access.
Staff/business write callables check subscription state. Transactional business writes recheck the company within the transaction, so a concurrent subscription change invalidates/retries that transaction. Firestore direct tracking, document metadata, tenant settings, stage, enquiry and tenant tax writes, and Storage uploads are also gated. Reads, notifications acknowledgement, owner billing requests and record exports remain available on expiry. Membership deactivation remains available to administrators. Expired public showrooms retain contact details but suppress stock and online enquiries to avoid advertising stock that cannot be updated.
Capacity additions scan authoritative tenant records inside a transaction and update a shared company revision. This protects the last slot against concurrent additions without relying on client counters. Existing data is included. Cases without vehicles count individually; otherwise available/reserved stock, unfinished customer imports and acquisitions count once per vehicle. Sold/delivered/stocked history is excluded. Unallocated vehicle records do not count until opened as stock, an acquisition or an import case.
Capacity checks cover stock creation, acquisition creation, case creation, staff creation, invitation issuance/acceptance, and each committed stock spreadsheet row. Pending staff invitations do not reserve a seat; acceptance rechecks capacity. Import previews check current capacity, but multiple ready preview rows are not reservations; commit returns per-row capacity errors if the remaining allowance is exhausted.
Downgrades never delete records. A plan cannot activate with more active business members than its seat allowance; deactivate memberships first. An agency over its vehicle allowance may complete existing work but cannot add another distinct active vehicle/enquiry.
The usage check is deliberately bounded at 5,000 records per collection. Larger-volume tenants need review and a different counting/pagination strategy before being offered Growth. These limits are not an unlimited-volume promise.

## Billing operations

Owners open /app/billing to see the plan, expiry, usage, last invoice reference and requested plan, request Solo/Dealer, contact brandontinoz@gmail.com, and export business records.
Requests do not charge, renew or upgrade access. The platform operator verifies the payment externally, then uses Agency subscriptions in the platform console to select the agreed plan and status, access end date, invoice and verified payment references. Paid activation requires both references. The server derives the USD price rather than trusting browser-entered amounts. Access end dates are explicit, at most one year ahead; the operator must align them with the verified invoice period. Every change writes an immutable subscription event plus audit entry. Invoice/payment references are held in server-only agency_billing and subscription events, rather than the branding/company document readable by customers. Owners retrieve their invoice reference through the billing callable and export.
Existing legacy pilot/previously agreed subscriptions are identified explicitly and retain existing access without an automatic cutoff or charge. Review their usage and agree their migration/start date; use the platform controls to assign the supported plan and an explicit period. New registrations cannot create legacy pilots.
Subscriptions expire on their timestamp even if the reminder job is unavailable. There is no dependency on a scheduler flipping an expiry flag.

## Renewal reminders and measurement

A daily 08:00 Africa/Harare scheduled job emits owner-only in-app notices at the 7-day, 3-day and expired bands. Notification IDs are derived from the access period and threshold; retries do not duplicate them. These are in-app reminders, not email/WhatsApp sends.
The same job stores daily collection counts and stored file bytes/object counts for stock photos, case documents and payment proofs. It never copies file content into telemetry. Owners see the most recent storage measurement; operators can review agency usage and requested plans and record actual support/onboarding minutes against a ticket reference. The commercial report totals the last 30 days of support from at most 500 entries and labels that bound. These measurements are not Firebase cost estimates; actual infrastructure charges still come from Cloud Billing.
Storage retains existing per-file/type restrictions and the eight attached stock-photo limit. No total plan storage allowance has been sold or enforced; usage monitoring will inform a future allowance. Signed public images cannot be recalled merely by hiding a listing.

## Customer data exit

Owner-only paginated JSON export includes customers, business memberships, vehicles, cases, quotations, payments, leads, stock, private costs, retail sales/entries/documents, acquisitions, import results, audit history and subscription events, with case/acquisition child history. Each page validates tenant ownership. User authentication records, invitation secrets, other tenants and attachment binaries are excluded. Photo/download URL fields are omitted. The UI downloads only after every requested page succeeds; the export is sensitive customer/cost data.
This is an operational data export, not a point-in-time database backup: records can change while pagination runs. Recovery remains covered by the existing operations runbook and its stated limitations.

## Verification

Deployed to https://studio-285787437-bc95b.web.app on 4 October 2026: backend functions, Firestore and Storage rules, hosting, and the scheduled maintenance worker. The final private-billing update was deployed after the full release. Cloud Scheduler confirms the worker is ENABLED at every day 08:00, Africa/Harare.

Validation: 24 unit tests and all 88 backend/Firestore/Storage emulator tests passed with no failures or skips. Fourteen distinct selected browser journeys passed without retries, covering onboarding, imports, retail dealership flows, billing and platform operations. The two billing browser journeys passed again after the final private-reference change. TypeScript and production builds passed; owner billing screenshots were inspected at 390 and 1440 pixels. Authenticated checks used isolated emulators; no synthetic production accounts, billing activations or customer records were created.

Existing pilot agreements still require an agreed migration date. Payment verification and period activation remain manual. Daily storage measurements start with scheduled runs and are not verified infrastructure cost estimates. The existing runbook's full recovery rehearsal limitation remains applicable.

Post-deployment public verification passed at 320/390/768/1440 pixels: landing, login, help, protected billing redirect, invitation failure handling, catalogue field projection, PWA manifest/service worker and all 35 checked callable authentication boundaries. No JavaScript errors or horizontal overflow. Evidence: web/release-evidence/live-verification.json and live screenshots.
