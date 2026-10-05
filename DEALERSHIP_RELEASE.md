# Dealership implementation — 4 October 2026

The existing import workflows remain intact. The dealership module adds tenant-scoped leads, locally available stock, reservations and retail sale records. All financial values use integer USD cents.

## Implemented workflows

- Record a walk-in or WhatsApp enquiry without creating a customer login. Track budget, stock/import interest, vehicle preferences, follow-up date and sales status.
- Register a vehicle and add it to owned or consigned stock. Record asking price, location, private acquisition/settlement cost and direct costs.
- Reserve one available stock vehicle for one active tenant customer. The server transaction prevents simultaneous reservations. Discounted prices require an owner membership.
- Confirm payments with evidence references; refunds reduce confirmed receipts. Cancellation requires refunding the full confirmed balance and returns the vehicle to available stock. Handover requires full payment.
- Preserve cancelled and delivered sale history and immutable financial action records. Payment request keys make a repeated request idempotent.
- Show owner-only estimated/complete-cost deal margins. These exclude business overheads and are not accounting net profit.
- Publish selected available local stock to `/showroom/{agency-slug}`. Public responses exclude costs, VINs, buyer identities and sale references. Reserved/sold listings disappear from public results.
- Capture public showroom enquiries directly into the corresponding tenant's lead list. Public submission has an hourly IP/tenant limit. WhatsApp enquiry links include the vehicle and showroom address.
- Convert an enquiry into a customer once, or link an existing customer; continue directly into a prefilled retail sale or customer import. Edit salesperson assignment and follow-up dates.
- Give linked buyers private purchase access through My vehicles. View terms, confirmed payments, balances, collection status and issued documents.
- Issue numbered, immutable sale agreements, balance statements, payment/refund receipts and handover records, with print/save PDF support. Snapshots include vehicle chassis identity and handover evidence.
- Upload vehicle photographs from a phone, choose a cover and remove listing photos. Image content, size, path and tenant ownership are validated.
- Track dealer-owned acquisitions through purchase, shipping, arrival, clearance and preparation. Transfer completed costs into stock without creating a customer or repeating import stages for the retail buyer.
- Distinguish agency receipts from supplier-direct payments and pass-through funds from service fee receipts. Owner reports separately record earned fees/commissions, dealer-borne expenses and audited corrections.
- Show sales, follow-ups, stock, reservations, acquisitions and complete-cost delivered deal margins on the agency overview. Owners can revise stock costs and available-stock prices with an audit reason.

## Operating choices and scope

- Vehicle photo uploads support JPEG, PNG and WebP up to 5 MB per image, with a maximum of eight images per listing. HTTPS image references remain available.
- Expired reservations block further payment; staff must refund/cancel them before rebooking. Automatic expiry/release is not implemented.
- Signing, physical handover, supplier purchasing, payment transfers and sending WhatsApp messages remain external actions. The system records verified references and acknowledgements; it does not perform these actions automatically.
- Stock cost completeness is confirmed by the owner. Recorded deal results exclude overheads and unrecorded expenses and are not full accounting net profit.

See DEALERSHIP_JOURNEYS.md for the connected workflows. Deployment and acceptance evidence are recorded below.

## Verification

Frontend and backend TypeScript checks and production builds passed. All 69 backend/security tests passed. All 25 relevant browser checks passed across acceptance runs without retries, covering the seven connected journeys, existing customer/invitation operations, import finance correction and responsive layouts. Printable sale documents, buyer mobile access and acquisition screenshots were reviewed.

The connected journeys were deployed on 4 October 2026 to https://studio-285787437-bc95b.web.app/: eleven new functions, nine updated functions, stock-photo storage rules and the PWA. Live landing/sign-in/support checks passed at 320, 390, 768 and 1440 pixels with no JavaScript errors or horizontal overflow. Protected case and purchase links redirect to sign-in. The PWA manifest/service worker and all 25 checked callable authentication fences passed. Evidence is saved in web/release-evidence/live-verification.json.

Authenticated workflows were verified in isolated emulators. No synthetic client accounts or stock were added to production. Actual client onboarding and reconciliation remain operational acceptance activities.
