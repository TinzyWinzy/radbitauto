# Dealer quotations, follow-ups and private enquiry tracking

Implemented 15 October 2026.

Dealership → Leads → **Manage quotation, follow-up & tracking** opens the enquiry workspace.

## Dealer quotations

- Itemised USD vehicle price, shipping, insurance, duties/taxes, clearing, delivery and dealer fee. Integer-cent validation and server-calculated totals.
- Route, inclusions, exclusions, validity through the end of the selected day in Zimbabwe, and a recorded tax-assessment source are required. Duties are explicitly labelled estimated or confirmed; this proposal form does not calculate customs tax.
- Supplier enquiries require availability confirmation within the preceding 24 hours before a proposal can be issued.
- Revisions create immutable versions. Current quotations are shown to the customer; older versions are retained for dealers and labelled superseded. Both have printable/PDF output containing customer-facing amounts only.
- Owners can review expected total costs and contribution before issuing, or update the private cost review afterwards. These records live separately from the lead and quotation snapshot. Staff/customer responses exclude them. Contribution excludes overheads and unrecorded costs.
- An enquiry proposal is retained as a reference copy when creating an import case. It does not populate balances or replace the existing calculated case quotation, acceptance and payment workflow.

## Follow-ups

- Each open lead has a suggested next step: verify supplier availability, prepare a quotation, renew an expired quotation, or contact the customer.
- Dealers can set the action, responsible party, active salesperson, due date and completion state, plus an explicit customer-facing update/status.
- Overdue and due-today reminders appear in the dealership workspace. Dates use Zimbabwe time; reminders refresh on window focus and every minute while the workspace is open.
- These are in-app reminders. Email, push and automatic WhatsApp sending are not part of this release.

## Private customer tracking

- Public supplier/showroom enquiries can receive a tracking link immediately. Dealers can create/replace or revoke links for existing enquiries.
- Tokens contain 32 random bytes. Only their SHA-256 digest is stored on the server. The browser URL carries the token in its fragment rather than a server path/query.
- Access expires after 30 days. Replacement invalidates the previous link; revocation invalidates the current link. Inactive/suspended agencies cannot expose enquiry data.
- The explicit public response includes dealer contact, enquiry reference, vehicle title/reference, current quotation and deliberate customer-facing updates. It excludes buyer identity/contact details, private negotiation notes, salesperson actions, expected costs and margins.
- Once an import case starts, tracking explains that the customer must use their portal invitation for the case. It does not expose the case identifier or grant account access.
- Tracking is bearer-link access: anyone holding the private link can view that enquiry's public projection. The dealer interface explains this before sharing. Tracking pages use noindex/nofollow, no-referrer and no-store headers.

## Access and storage

New callable functions: `dealerEnquiryDetails`, `issueEnquiryQuotation`, `saveEnquiryPrivateCosts`, `updateEnquiryAction`, `manageEnquiryTracking`, `publicEnquiryTracking`.

New Admin-SDK-only collections: `dealer_lead_quotes`, `dealer_lead_costs`, `dealer_enquiry_access`. Existing rules deny direct client access; no permissive rule was added. Quotations, private cost changes, tracking management and action changes write audit events without storing raw tracking tokens.

## Verification

Frontend and backend TypeScript checks passed. Three quotation/reminder unit tests passed. Eight supplier/enquiry Firestore-emulator regression tests passed; the focused four-test lifecycle run also passed after the final follow-up synchronization change. Both browser journeys passed in targeted runs without retries: dealer quote/private margin/overdue reminders/print/customer projection/revocation, and automatic public-enquiry tracking-link continuity across reload. Customer tracking was checked at 390px with no horizontal overflow. All authenticated test identities and enquiry writes were confined to local emulators.

## Production deployment

Deployed successfully on 15 October 2026 to studio-285787437-bc95b: all six new enquiry callables, updated dealershipWorkspace/saveDealerLead/enquireSupplierVehicle/enquireDealerShowroom/createCase and Firebase Hosting. Live custom-domain verification passed for /enquiry, noindex/no-referrer/no-store headers, the protected dealer route and 390px layout. All five private enquiry endpoints returned HTTP 401 to anonymous requests; a random invalid tracking token returned HTTP 404 without enquiry data. No production customer, lead, cost or quotation records were created during live verification.
