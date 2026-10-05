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
