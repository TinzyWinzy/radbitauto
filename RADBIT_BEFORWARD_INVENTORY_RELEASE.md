# BE FORWARD inventory and dealer import flow

The user authorised republication of BE FORWARD inventory photographs on 9 October 2026. This is recorded user authorisation, not a claim of a supplier API or partnership.

Radbit now lets buyers browse a captured supplier selection, open vehicle details and photo galleries, choose a participating import dealer and submit an enquiry without leaving Radbit. The homepage opens the import selection, with local dealer stock available separately. Supplier prices exclude additional import costs.

## Inventory

- Initial snapshot: 124 actual public listings from Toyota, Nissan, Honda, Mazda and Suzuki, captured on 9 October 2026. The selection is not BE FORWARD's complete inventory.
- `supplierCatalogueMaintenance` refreshes five public make pages every six hours. Snapshot publication is atomic; fetch/parser failures retain the previous snapshot. Entries older than 48 hours are hidden.
- `publicSupplierCatalogue` returns the current snapshot or the bundled initial snapshot when no stored snapshot exists. It never falls back to the seed when an existing snapshot expires.
- `publicSupplierVehicle` fetches a stored, validated supplier listing URL and caches up to 20 vehicle-specific gallery images for six hours. It falls back to the captured primary image when a gallery fetch fails. Photographs are served from BE FORWARD's image CDN; Radbit does not own a mirror of the files.
- Platform administrators can call `refreshSupplierCatalogue` for a manual refresh. There is no public trigger that can overwrite inventory.
- No account cookies, private supplier records or credentials are scraped. No arbitrary caller URL is fetched.

## Enquiries and dealer workflow

`publicImportDealers` lists active agencies with writable subscriptions and sourcing/both operation modes, including agencies with no local stock. Clearing-only agencies are excluded. Pagination covers the full directory. Dealer identity and service capability are self-configured; listing here does not imply a verified partnership.

`enquireSupplierVehicle` revalidates the supplier selection and chosen dealer, creates a tenant-owned lead with a server-derived vehicle snapshot, and sets supplier verification to pending. An enquiry does not reserve a vehicle. Ten enquiries per IP per hour are allowed across the supplier flow. A client request ID makes retries safe for the same enquiry.

The dealer sees the selected photograph, reference, price and supplier link in the existing leads workspace. `verifySupplierLead` records an available/unavailable result, evidence, checker and time with an audit entry. Only the owning agency can record that result.

Continuing the lead as a customer import carries the supplier lead ID into case creation. The server requires an available confirmation within the last 24 hours and prevents duplicate case creation for that lead. Supplier reference, public URL and vehicle snapshot are copied into the import case, and the selected vehicle is shown in customer case details. Dealers still register the confirmed vehicle/chassis and attach it before issuing the existing tax-based quotation; supplier selection does not invent a VIN or confirm a purchase.

## WhatsApp handoff and continuity

**Status: IMPLEMENTED 9 October 2026, behind the handoff work.** The enquiry no longer ends at a confirmation sentence.

The enquiry is the record; the WhatsApp thread is the conversation. One shared reference joins them, because the buyer has no account and the dealer sends messages manually.

- `enquireSupplierVehicle` returns `received`, a lead `ref`, and the chosen dealer's `name`, `slug` and `whatsapp`, so the success state can open a conversation instead of ending. `publicImportDealers` is unchanged; `whatsapp` is the same number the public showroom already publishes, so this is not new private data.
- `ref` is the first eight characters of the lead document ID, uppercased, matching `leadRef()` used by both functions and web. The supplier lead ID is already derived from the enquiry key, so a retry returns the same reference and a distinct enquiry cannot collide.
- After submitting, the buyer gets **Continue on WhatsApp** (`wa.me/{dealer}` prefilled with the reference, supplier reference, vehicle title, budget, notes and a link back to this vehicle), **Download request (PDF)**, **Copy request** and **Share this car** (`wa.me/?text=` with no recipient, for forwarding to a friend or another dealer).
- Download and copy render one document from `enquiryRequestText()`: buyer, vehicle, supplier reference and price, and a numbered ask — confirm availability, quote the full import cost, confirm inclusions/exclusions and validity. The PDF uses the existing `print-overlay` / `window.print()` pattern, so no PDF dependency was added. The WhatsApp message uses the identical text, so paste, PDF and message cannot drift apart.
- The form request ID is kept in `sessionStorage` per vehicle and the completed handoff in `sessionStorage` per vehicle, so a reload or a return from WhatsApp restores the actions instead of starting a duplicate enquiry. `localStorage` keeps the last `{ref, vehicle, dealer}` on the device, so `/imports` resurfaces an open enquiry with a return link and a follow-up message without an account or a server lookup.
- The dealer's lead card shows the same reference and a **Reply on WhatsApp** action prefilled with the reference and vehicle. Sending remains manual, consistent with the deliberate operating choice above.
- Continuity becomes a record at conversion: Continue enquiry creates the customer and case, and the existing invitation link is shared in the same WhatsApp thread. From that point the buyer reaches `/app/cases/{id}`.

Fixed while wiring this up: `createCase` rejected `supplierLeadId` when it was `null`, which is what the callable transport produces for an absent optional field. Every import case created through Lead → Continue enquiry failed with `Invalid supplier enquiry`. The guard now treats `null` as absent (`cases.ts`), and dealership lead conversion is covered by `dealership.spec.ts`.

Deliberately not built: WhatsApp Business API automation (a paid integration, listed as out of scope in `sad.txt`) and an anonymous public enquiry-status page (requires token design and would expose lead contact data).

## Validation

- Functions TypeScript checking and web production build.
- Parser tests: supplier price versus destination total, missing prices, reserved entries, image-host restrictions, deduplication, expiry, real captured selection and gallery reference restrictions.
- Firestore emulator tests: enquiry retries, server-derived vehicle data, tenant isolation, pending verification rejection, verified case creation, duplicate prevention, dealer eligibility and forged references.
- Browser tests: homepage discovery, vehicle selection, photo loading, dealer choice, submitted enquiry context, retry/expired/no-dealer states and 390/768/1440px screenshots.

## Deployment

Deploy the new supplier callable functions and scheduled maintenance, updated `createCase`, and hosting. The supplier collections use Admin SDK access only; existing production rules default-deny direct client access. Do not deploy emulator-only rules. Monitor scheduled job failures and supplier markup changes; stale stock is deliberately hidden rather than represented as current.

Deployed successfully on 9 October 2026 to `studio-285787437-bc95b`, including the scheduled maintenance function. Firebase discovery required `FUNCTIONS_DISCOVERY_TIMEOUT=60` on this host. The custom domain `https://auto.radbitstudios.co.zw/imports` returned HTTP 200 with the new application bundle.

Live read-only verification returned 124 listings, two eligible agencies (Riverside Dealership and Sally’s Dealership), and 20 gallery photographs for reference CE457744. Chromium verified the live page, loaded photograph, dealer chooser and 390px layout. No production enquiry was submitted. Evidence: `web/release-evidence/supplier-live-desktop.png` and `supplier-live-mobile.png`; repeatable check: `web/scripts/verify-supplier-live.mjs`.

The final check also passed on the custom domain after constraining the gallery grid and making the 20-photo thumbnail strip scroll horizontally. Mobile body overflow was absent.

A second deployment on 9 October 2026 shipped the WhatsApp handoff and continuity layer on top of this release: `enquireSupplierVehicle` now returns the enquiry reference plus the dealer name, slug and WhatsApp number; the buyer's success state offers Continue on WhatsApp, Download request (PDF), Copy request and Share this car; `/imports` resurfaces the open enquiry with its reference and a follow-up message; and the dealer lead card shows the same reference with a prefilled Reply on WhatsApp. It also shipped the `createCase` supplier-lead null guard (import cases created from a converted lead previously failed with `Invalid supplier enquiry`) and a shared closed-transaction retry used by `bulkImportRecords`. Live read-only verification again returned 124 listings and the same bundle from both the default and custom domains; no enquiry was submitted. Evidence and the deploy record: `OPERATIONS_RUNBOOK.md`.

