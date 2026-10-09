# Client release record

Release: 4 October 2026. Live portal: https://studio-285787437-bc95b.web.app
Support and configured alerts: brandontinoz@gmail.com.

## Delivered

- General landing, verified agency self-registration, password recovery and isolated branded workspaces for sourcing, clearing or both.
- USD-only quotations/payment records. New agencies start with pilot access and no automatic charge. Platform administrators configure manual subscription invoices/prices and suspend/reactivate agency access.
- Operational customers before authentication; unsourced enquiries, later vehicle attachment and Japanese frame/chassis identifiers.
- Seven-day private invitations for verified staff/customers, preserving existing customer case history.
- Staff-only supplier references and validated public BE FORWARD listings. Purchasing remains in the existing supplier account.
- Itemised quotations separating actual invoice and customs valuation, versioned calculation snapshots, customer acceptance and printable quotations/PDFs.
- Audited pending/confirmed payments, idempotency and duplicate-reference protection, overpayment guards, carried-forward collections, printable receipts, owner-only full reversals and completed external refund records.
- Agency-wide reports for counts, collections, outstanding balances and quoted fees, with 25-case pagination. Collections/fees are distinguished from profit.
- Private uploaded documents, storage-validation triggers, stage gates, tracking and enquiry workflows.
- Manually sent WhatsApp case updates with protected portal return links.
- Installable PWA, route chunks, readable secondary actions, five-item staff mobile navigation and support/privacy information. Private records require connectivity and use memory caching; legacy cache cleanup is best effort if older tabs block it.
- Legacy email-only administrator elevation replaced with server-backed membership checks. Existing verified platform owner migrated and audited; sign in again to refresh claims.

## Production configuration

Hosting, Firestore rules/indexes, Storage rules and application functions are deployed to studio-285787437-bc95b. All second-generation functions and the first-generation account-creation trigger were confirmed ACTIVE on Node.js 22. Required indexes were checked READY. Hosting authentication domains are authorized. The missing default storage bucket was created; Eventarc received bucket metadata permission and document-validation triggers deployed successfully.

Firestore deletion protection, seven-day PITR and daily backups with 28-day retention are configured. Uploaded objects have 28-day soft-delete protection. Backend error and public uptime alerts target the support email. Project-only USD 25 monthly budget alerts have 50%, 80% and 100% thresholds; these are not spending caps.

## Verification

- 22 unit tests passed. Frontend/backend type checks and production builds passed.
- Full emulator run: 57 backend/security tests passed. The final backend run passed all 37 function tests, including legacy administrator rejection, subscription suspension/reactivation and refunds after price revision.
- Full browser run: 23 tests passed first attempt; finance passed on retry after an emulator error. A separate no-retry run passed finance and both staff/customer invitation journeys (three tests), including pre-existing customer case history. This three-test run also passed after the final legacy-browser-cache cleanup.
- Synthetic emulator export/import recovery passed, preserving tenant identity and integer USD cents.
- Final deployed desktop/mobile checks passed: landing, sign-in, support, protected case return links, no JavaScript errors or horizontal overflow, PWA manifest/service-worker headers and authentication rejection on six production callables.
- Report, quotation-print and live public desktop/mobile screenshots were inspected. Evidence: web/release-evidence.
- Local emulators used host Node 24. Production Node 22 deployment and live callable initialization/authentication checks passed; authenticated production client acceptance remains a separate business validation.

## Operating boundaries

### Mobile responsiveness and aesthetics release — 4 October 2026

Deployed refinements include compact phone/tablet dashboard totals, adaptable case cards, readable current-stage-centred journey rails, consistent form gutters, 16px phone inputs, 44px workspace button targets, stronger secondary-text contrast, wrapped team controls, complete account values, safe-area content spacing, and landscape support. The PWA theme/launch colour matches the light interface and its install previews now use actual rendered public pages.

Acceptance evidence: the broad browser suite passed 37 tests immediately and finance on retry during active frontend edits. Subsequent no-retry checks passed finance plus responsive acceptance (15), updated customer/journey acceptance (19), final responsive acceptance including unsplit currency totals and tap-target checks (14), and phone agency registration plus staff/customer invitations (4). The final responsive run included new staff, customer, vehicle and case forms, team/branding, reports, settings, both role dashboards, case details, platform controls, and 844×390 landscape, at 320/390/768/1440px widths. Phone agency setup and invitation screenshots were inspected alongside dashboard, case, public and tablet screens. Evidence images are saved in web/release-evidence.

The production build and hosting deployment passed. Live checks passed at 320px, 390px, 768px and 1440px with no JavaScript errors or horizontal overflow, correct PWA theme/orientation and preserved authentication rejection on seven callables. These are browser viewport and emulator acceptance checks; no physical-device certification is claimed.

### Dealership workflow extension — 4 October 2026

The dealer module adds lead capture and follow-up, owned/consigned local stock, transaction-locked reservations, confirmed USD payment/refund records and paid-in-full handover. Available stock can be published to a tenant showroom with WhatsApp links and public enquiries. Private costs are returned only to owner memberships; the showroom uses an explicit safe projection. A stock vehicle cannot simultaneously be allocated to a customer import. All 64 final backend/security tests and the complete retail browser journey passed. Desktop/mobile screenshots and production builds passed.

The subsequent connected-journeys release implements stock photo uploads, retail customer self-service/documents and dealer inventory acquisition workflows. See DEALERSHIP_JOURNEYS.md and DEALERSHIP_RELEASE.md for the current scope and operating choices.

### Approved interface release — 4 October 2026

The approved wireframes are implemented and deployed: agency marketing, sign-in/account creation, email verification before agency setup, separate agency and customer dashboards, and the first-customer checklist. Agency Overview uses tenant-scoped server aggregates for active cases, USD outstanding balances and quotation/payment/document actions; customer cards show the next configured stage and current quotation/confirmed payment totals. No sample agencies or fabricated metrics appear on the public landing page.

Validation: 38 backend function tests and all 25 browser journeys passed. Frontend and backend type checks and production builds passed. Both added Firestore indexes reached READY; dashboardOverview deployed on production Node 22. Live desktop/mobile landing, sign-in, support, protected case redirects, PWA files and seven callable authentication fences passed with no browser errors or horizontal overflow. Dashboard desktop/mobile screenshots were reviewed and saved in web/release-evidence; live checks are recorded in web/release-evidence/live-verification.json. Authenticated workflows were exercised against isolated local emulators; this release did not add synthetic accounts to production.

The portal is available for agency onboarding and pilot operations. Customs figures remain estimates; agencies must validate rates/classification with their clearing practitioner before relying on them. BE FORWARD purchasing, WhatsApp sending, payment transfers and subscription invoicing remain manual. No official supplier partnership/API or automatic debit is claimed.

Use CLIENT_ONBOARDING.md for both agencies and OPERATIONS_RUNBOOK.md for support/recovery. Client acceptance uses representative real imports and reconciled actual balances; synthetic tests cannot establish that acceptance.

Automatic approval review rejected a production-data restore rehearsal because it would copy private client data into a new database and incur costs. Synthetic recovery passed. A production-data rehearsal remains unperformed and requires explicit approval.



### Connected dealership journeys release — 4 October 2026

Implemented and deployed all seven journeys described in DEALERSHIP_JOURNEYS.md: showroom enquiries and conversion, stock sales/customer imports, private retail buyer access, immutable printable sales documents, phone photo uploads, dealer-owned import acquisitions into stock, and financial distinctions/owner results with dashboard summaries. USD remains the sole currency. Tenant and role checks protect buyer records, acquisition costs and owner reports.

Validation: 69 backend/security tests and all 25 relevant browser checks passed across acceptance runs without retries; TypeScript and production builds passed. Eleven new and nine updated functions, storage upload rules and hosting deployed successfully. Live checks passed at 320/390/768/1440 pixels, including case/purchase sign-in redirects, PWA files and 25 callable authentication fences. Authenticated acceptance used isolated emulators without synthetic production data. See DEALERSHIP_RELEASE.md and web/release-evidence/live-verification.json.

Supplier purchasing, WhatsApp sending, actual payment transfers and signing/physical handover remain external actions supported by recorded references. Owner results exclude overheads and unrecorded costs; they are not full accounting net profit. Use CLIENT_ONBOARDING.md for client rollout.

### Google sign-in repair — 4 October 2026

Reproduced the live failure: the hosting Content Security Policy blocked https://apis.google.com/js/api.js, causing Firebase auth/internal-error before Google account selection. Added the specific https://apis.google.com origin to script-src while preserving the existing restrictions, and deployed hosting successfully. Production build and TypeScript passed.

The new web/scripts/verify-google-auth.mjs regression check verified that the live login button reaches accounts.google.com without CSP errors or OAuth configuration errors. Evidence: web/release-evidence/google-auth-verification.json. Verification stopped at Google account selection; no credentials were entered or production account created. Completing sign-in with the user's own account remains the final user-side confirmation.

### Buyer and dealer marketing release — 4 October 2026

Deployed the public home page for car buyers and prospective dealership clients. Published available vehicles from active dealers feed the shared catalogue; buyers search by model/location/dealer, filter a maximum USD budget and open the owning dealer's showroom. Existing showroom enquiries and WhatsApp links handle conversion. The page also explains sourcing/customer access and offers a separate agency signup and pilot contact path. Genuine empty/error states replace sample listings. Metadata describes both audiences.

Verification: 70 backend/security tests passed, including safe public projection and exclusion of private/sold/inactive stock. Four marketing browser journeys passed without retries, including filters, dealer attribution, signup, outage recovery and signed-in routing. Layouts at 320/390/768/1440 pixels and screenshots were reviewed. Production builds/type checks passed. publicVehicleCatalogue and hosting deployed successfully. Live catalogue projection, responsive pages, protected redirects, PWA files and 25 callable authentication fences passed; Google account-selection handoff also passed. No fabricated inventory or synthetic production accounts were added. Evidence is in web/release-evidence.

Discovery is initially a bounded selection of up to 100 published records. Dealers become visible by publishing available stock; sourcing-only businesses can share their direct showroom link. Client operating instructions are in CLIENT_ONBOARDING.md.

### Invitation management release — 4 October 2026

Deployed /app/invitations, reached from Team's Invite staff or customers action and buyer purchase details. Reports retains the invitation form through the shared manager. Owners create staff/customer links, review email/role/status/expiry history, revoke pending invitations, copy links and open WhatsApp/email drafts. No messages are automatically sent. Revocation removes the current sharing controls and is audited.

Public invitationInfo returns only agency name, access role, status and expiry. Recipient identity remains private. The acceptance page previews the agency/role, prevents signup from revoked/expired/unavailable links and retains verified-email and exact recipient checks. Accepted records remain immutable history; existing memberships are managed from Team. Lists are bounded to 200 records, and raw tokens are not recoverable from history.

Validation: all 71 backend/security tests passed, including owner scoping, safe preview, idempotent revocation and revoked acceptance rejection. Three staff/customer/revocation browser journeys passed without retries; mobile/desktop screenshots were inspected. TypeScript and production builds passed. invitationInfo, listInvitations, revokeInvitation, acceptInvitation and hosting deployed successfully. Live invalid-token invitation handling passed at 320/390/768/1440 pixels, along with PWA checks, catalogue projection and 27 callable authentication fences. Authenticated testing used isolated emulators without synthetic production accounts. See web/release-evidence/live-verification.json and CLIENT_ONBOARDING.md.

### Customer and stock CSV/Excel import release — 4 October 2026

Deployed /app/import-data, available to owners from Team → Import customers or stock. CSV supports comma/semicolon/tab; .xlsx supports multiple worksheets. Header/data-range controls, suggested column mapping, per-column samples, row validation/normalised summaries, explicit import confirmation and downloadable result CSV handle different table layouts without requiring one template. Formula/error cells require plain values; legacy .xls files require conversion to .xlsx.

The owner-only bulkImportRecords callable validates 1–100 rows, independently of browser mappings. Preview performs no writes. Commit creates each stock vehicle/stock/cost record atomically and audits created records. Stock starts unpublished; no payments, sales, cases, logins or messages are imported. Deterministic tenant-scoped VIN/customer identity and existing name/phone comparison prevent duplicate repeat uploads without overwriting operational data. Invalid/duplicate rows are skipped, and successful rows survive errors in other rows.

Unknown acquisition/settlement and direct costs remain null, require explicit values for completeness, and show blank owner inputs rather than zero. Margins are unavailable for unknown costs. Consigned stock records the owner's settlement cost separately and does not invent a dealer purchase. Files are processed locally, and only mapped fields are submitted. Bounded files/worksheets and a five-minute server timeout support controlled onboarding batches. Excel parsing is loaded on demand and excluded from global PWA precaching.

Verification: all 74 backend/security tests passed, including preview non-mutation, phone normalisation, owner boundaries, duplicates, atomic stock, null costs, consignment and batch limits. CSV stock and multi-sheet Excel customer browser journeys passed without retries, including invalid rows, repeated uploads and blank costs in stock controls. Screenshots were reviewed. Final production builds/type checks passed. bulkImportRecords and hosting deployed successfully. Live public pages, invitation failure handling, catalogue projection, PWA files and all 28 checked callable authentication fences passed at 320/390/768/1440 pixels. No synthetic production records were added. CLIENT_ONBOARDING.md documents limits and operation.

This release imports customers and available stock. Leads, customer import cases, dealer acquisition histories and opening financial balances remain separate future import workflows.

### Subscription enforcement release — 4 October 2026

Deployed server-authoritative Solo ($15/month, 2 business seats, 15 active vehicles/enquiries) and Dealer ($29/month, 5 seats, 50 active vehicles/enquiries), new-agency 14-day Dealer trials, transactional capacity enforcement across stock/import/acquisition/team/invitation/spreadsheet creation, and callable/Firestore/Storage write restrictions on expiry. Customer portal accounts are free. Expired agencies retain read access and owner record export; security suspension denies access. Existing legacy agreements retain access pending an agreed migration.

Owner Plan & billing supports usage, renewal requests and private paginated JSON record exports. Platform controls require invoice and verified-payment references for paid activation; references are stored privately, with immutable subscription events. Daily 08:00 Africa/Harare maintenance is deployed and its Cloud Scheduler job is ENABLED, providing deduplicated in-app renewal notices and storage/record measurements. Platform support minutes are logged separately. Collection/activation remain manual; measurements do not represent actual Cloud Billing charges. No automatic debit, email/WhatsApp reminders or total storage entitlement was introduced.

Verification: 24 unit tests and 88 backend/Firestore/Storage tests passed without failures/skips. Fourteen distinct selected browser journeys passed without retries; the two billing journeys passed again after the final privacy fix. TypeScript/build checks passed. Final production functions/rules/hosting deployed successfully. Live public checks passed at 320/390/768/1440 pixels, including billing authentication redirect, PWA, catalogue projection and 35 callable authentication fences; no JavaScript errors or horizontal overflow. Authenticated checks used isolated emulators; no synthetic production accounts or paid activations were created. See SUBSCRIPTION_RELEASE.md and web/release-evidence/live-verification.json. Existing recovery rehearsal limitations still apply.


### Landing-page design release — 4 October 2026

Deployed a scoped automotive landing identity with an original local SVG illustration, responsive editorial hero, compact buyer journey, stock filters/cards, contrasting dealer section, and Solo/Dealer pricing cards. Existing enquiry, signup, login and subscription behavior is preserved. The illustration is decorative marketing artwork, not a stock listing. No external image request or new dependency was introduced. Styling is scoped to the public landing page.

Validation: production typecheck/build passed. All four existing landing browser journeys passed without retries, including filters, catalogue recovery/empty states, dealer signup and signed-in redirects. Screenshots inspected across 320/390/768/1440 pixels; corrected dealer secondary-button contrast before deployment. Live checks passed for artwork decoding, pricing, navigation, billing authentication redirect, catalogue projection, PWA files and 35 callable authentication boundaries, with reduced motion enabled, no JavaScript errors and no horizontal overflow. Evidence: web/release-evidence/live-verification.json, live-hero-mobile.png, live-dealers-desktop.png and responsive full-page screenshots.


Photographic hero update: replaced the SVG hero with an original image generated using the built-in image tool. Responsive 600/1000/1440-pixel WebP assets are 63/145/240 KB; the full-resolution source is retained in web/design-assets and excluded from hosting. The car remains fully visible in a stable 4:3 frame; a bounded top overlay keeps the caption readable. Production build and hosting deployment passed. Live decoding, mobile/desktop screenshots, no-overflow and browse/dealer-signup navigation checks passed at 320/390/768/1440 pixels. See web/design-assets/vehicle-journey-generation.md for the generation prompt and web/release-evidence/photo-hero-verification.json for evidence.


### Email verification recovery — 4 October 2026

The reported missing verification message was confirmed by the user to be in Spam. Production default Firebase email delivery remains enabled. Sender display name is now Radbit Studios and reply-to is brandontinoz@gmail.com; configuration readback confirmed the standard subject/body, hosted action handler and delivery method remain intact. Firebase rejected a custom subject change; no custom sender domain/SMTP or guaranteed inbox placement is claimed.

Deployed automatic verification requests on owner setup and unverified pending invitations, correctly scoped continuation links, in-flight duplicate protection and 60-second resend cooldown, clear spam/delay/request-error guidance, return-to-tab state/token refresh and account-switch recovery. Seven owner/signup/email/invitation browser journeys passed without retries on isolated emulators; production typecheck/build and hosting deployment passed. No synthetic production users or test emails were created/sent. Server verified-email checks remain intact. Recommended branding and domain/email cutover work are recorded in RADBIT_BRAND_AND_EMAIL.md; product-name choice and DNS cutover remain pending.


### Radbit Auto branding and custom-domain preparation — 4 October 2026

The user selected Radbit Auto at auto.radbitstudios.co.zw. Deployed public/login/setup wordmarks, browser and installed-PWA name, Stock. Sales. Imports. tagline, Radbit Studios attribution, matching forest/ivory icons and actual mobile/desktop installation screenshots. Agency-specific branding remains in its own workspace. Production typecheck/build and hosting deployment passed.

Created the custom-domain resource on the existing Firebase Hosting site and added the exact approved hostname to Firebase Authentication authorised domains, preserving previous domains. Provider response is stored in RADBIT_AUTO_DOMAIN_STATUS.json. Domain is currently HOST_UNHOSTED / OWNERSHIP_MISSING with CERT_VALIDATING. Cloudflare is authoritative (blair/yadiel nameservers); its browser session is at sign-in, and no Cloudflare DNS records were changed. Exact CNAME and certificate TXT requirements and post-DNS verification steps are in RADBIT_BRAND_AND_EMAIL.md. The working Firebase URL remains the shareable URL until DNS, ownership and HTTPS are verified. No custom sender email domain has been configured.

Post-deployment checks passed at 320/390/768/1440 pixels: Radbit Auto title/wordmark, responsive photograph, browse and dealer signup navigation, manifest name, branded icons and install preview resources, login name and Radbit Studios help attribution. No JavaScript errors or horizontal overflow. Evidence: web/release-evidence/photo-hero-verification.json and corresponding screenshots.

### Custom-domain DNS applied
Both approved CNAME and certificate TXT records are saved in Cloudflare and independently confirmed against its authoritative nameserver. Firebase validation remains pending; an HTTPS probe fails certificate negotiation. Do not announce the custom URL as ready until valid TLS and public/login/PWA checks pass. The existing Firebase URL remains available.

### Nonintrusive PWA installation — 5 October 2026
Replaced the floating installation overlay with a compact branded panel in normal page flow on home, dealer showrooms and account settings. It is hidden on authentication/onboarding/invitation and operational form routes. Dismissal persists seven days where storage is available; native prompt is user initiated; installed/Safari/error states are handled. Local browser verification passes at 320/390/1440px and includes persistent dismissal, login suppression, install action, failure recovery, appinstalled and Safari instructions. Native install events are simulated; real OS installation was not performed. Research and prioritised engine improvements: RADBIT_AUTO_BEFORWARD_RESEARCH.md.

### Buyer engine and professional onboarding — 5 October 2026
Deployed Hosting and eight affected callable functions successfully: publishDealerStock, dealerShowroom, publicVehicleCatalogue, enquireDealerShowroom, issueQuotation, acceptQuotation, registerAgency and new setCaseNextAction. Vehicle specification filters, detail galleries, vehicle-specific enquiries, device-local shortlist/comparison, versioned quote inclusions/exclusions/validity and audited customer next actions are live. Business setup now has branded sections, a live preview, business-focus selection and first-use guidance based on actual records. Operational details: RADBIT_AUTO_ENGINE_RELEASE.md.

Validation: frontend/backend typechecks and production builds passed; 28 unit tests and 63 backend emulator tests passed. Seven targeted browser journeys passed without retries: two agency signup/setup checks, buyer catalogue/detail/shortlist/enquiry, and four retail/acquisition/finance regressions. These use isolated emulator data or local browser fixtures. Printable quotation and mobile vehicle detail screenshots were inspected.

Post-deployment public checks passed at 320/390/768/1440px: landing photograph, browse/signup navigation, login branding, help attribution, manifest/install assets, no horizontal overflow or JavaScript errors. Evidence: web/release-evidence/photo-hero-verification.json. Live catalogue returned HTTP 200 with no published stock; privacy projection and selected-stock checks were exercised with emulator stock. The new protected next-action callable rejected anonymous access. Evidence: web/release-evidence/engine-live-verification.json. No synthetic production users, inventory, emails or payments were created. Dealers must add and publish their actual stock/photos/specifications; missing specifications display Ask dealer.

### Search canonical host and real 404 responses � 9 October 2026
Hosting-only deployment making `https://auto.radbitstudios.co.zw` the single published URL: canonical/`og:url`/`og:image`/`twitter:image`, JSON-LD, `robots.txt` `Sitemap`, `sitemap.xml` and `llms.txt` all reference it. Unknown paths return HTTP 404 with a static noindex page instead of HTTP 200 soft-404s, because the catch-all SPA rewrite was narrowed to the real route globs; `favicon.ico` was added so the removed fallback does not break favicon requests.

Verification on production: unknown paths 404 with security headers intact, all real routes 200, `/help` 301s to `/help/` on the same host, favicon 200 `image/x-icon`, and served HTML carries the custom-domain canonical on both the custom domain and `web.app`. No API, rules, index or function changes.

### Shell payload reduction and import-catalogue prerender � 9 October 2026
Second audit of auto.radbitstudios.co.zw: security headers, canonical/OG, robots, sitemap, cache headers, sourcemaps and real 404s were all confirmed fixed. Three audit claims were measured false � brotli compression is served whenever the client advertises it, Google sign-in is implemented, and the app already lazy-loads 21 route chunks � while one was true in substance: the entry chunk forced every visitor to download Firestore and Storage.

Fix delivered: Firestore/Storage moved to `lib/firebaseData.ts` (imported only by authenticated routes), the offline banner no longer imports `lib/hooks`, `Dashboard`/`AppLayout` became lazy, and vendor chunks split into `firebase-core`/`firebase-data`. Initial shell JavaScript dropped from 1,026.30 KB raw / 274.21 KB gzip to 430.45 KB raw / 117.74 KB gzip. `/imports` is now prerendered with the correct title, canonical and 124 priced supplier cards, and `trailingSlash: false` serves `/imports` and `/help` at 200 on exactly the URLs the sitemap publishes; their trailing-slash forms 301 to the canonical form. Unknown routes still return 404 with the full security header suite.

Verification: typecheck clean, hosting build and prerender green, 18 browser journeys passed without retries (public landing/catalogue/supplier enquiry, platform admin, agency signup, customer portal, dealership lead-to-import), and live checks confirmed the three-chunk shell preload, 110,642 B brotli shell transfer, correct `/imports` and `/help` metadata, and intact headers. No function, rule or index changes. Known non-code gaps recorded as business items: no dealer listings yet, Gmail support address, one supplier odometer reading of 7 km.
