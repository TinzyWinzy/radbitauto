# BE FORWARD lessons for Radbit Auto

Reviewed 5 October 2026. Scope: public homepage, stock list and Zimbabwe service page; no private supplier account or partner/API access was inspected. Recommendations below are product inferences, not proven conversion uplift.

Sources:
- https://www.beforward.jp/ — search by budget, make, body type and year; favourites, saved searches and notification features; public account navigation for invoices, payment proof and shipment tracking.
- https://www.beforward.jp/stocklist — reference numbers, year, mileage, engine, transmission, fuel and location; vehicle price distinguished from destination-specific CIF total.
- https://www.beforward.jp/beforward_zimbabwe — local agent contact/WhatsApp and service details; arrival ports Dar es Salaam, Durban and Maputo; clearing/delivery routes. FAQ distinguishes duties, VAT and local charges from supplier prices, with service-specific inclusions.

## Commercial thesis

The supplier helps dealers find and buy vehicles. Radbit should help the dealer qualify the buyer, explain the full local deal, manage its own/consigned inventory and customer imports, and measure commission or margin. The common journey is: buyer shares a supplier link in WhatsApp → dealer creates a lead and records the reference → dealer confirms availability and prepares a USD quote with inclusions → buyer receives a record link → dealer records payment evidence and progress → handover and realised margin. Customer documents and supplier purchase details must stay in the appropriate tenant/customer access scope.

## Recommended order

| Priority | Improvement | Existing foundation and actual gap | Agency benefit / validation |
| --- | --- | --- | --- |
| 1 | Vehicle-specific enquiries | Public catalogue currently links to the dealer's entire showroom. WhatsApp includes the stock reference, but showroom form is a general enquiry. Carry the selected stock ID into a prefilled, server-validated enquiry. | Less repeated clarification; measure qualified enquiries per listing and time to first response. |
| 1 | Richer stock search/details | Vehicle registration already has make/model/year. Public response/cards principally expose title, location, price and photos. Extend the validated vehicle schema/public projection for mileage, fuel, transmission and body type, then filters and individual detail/gallery routes. Never publish chassis, costs or customer data by default. | Buyers narrow down suitable cars; measure search-to-enquiry and no-result frequency. |
| 1 | Explain the local quote | Existing customer quotation/payment workflows and dealer acquisition cost ledger can be extended. Present supplier price, freight/insurance where applicable, duty/tax estimate, clearing, delivery, dealer fee and preparation as explicit included/excluded line items, with quote validity and route. Prevent duplicate costs where supplier city-delivery packages already include a service. | Fewer surprise costs and disputes; measure quote acceptance and margin completeness. Tax rules require separate current authoritative verification. |
| 2 | Next-action customer journey | Import stage/evidence and documents already exist. Surface who must act next, what document/payment is due, latest update and estimated date with provenance. Differentiate a dealer estimate from confirmed supplier/vessel evidence. | Less repetitive WhatsApp chasing; measure overdue actions and customer status enquiries. |
| 2 | Supplier-link intake | CaseSupplier and DealerAcquisitions already save supplier name, listing URL, stock/invoice references. Add a guided manual capture and review flow that can create a lead/customer import or dealer acquisition. | Faster accurate intake. Never auto-fetch arbitrary URLs from a privileged backend; safe host checks and permitted data access are prerequisites for any future automated connector. |
| 2 | Shortlist and comparison | Not established in the reviewed public UI. Start with device-local saved stock IDs, compare a few cars and WhatsApp-share public links; offer account save only when the buyer needs cross-device persistence. | Return visits without an early signup barrier. Handle sold/withdrawn cars and do not fabricate availability. |
| 3 | Saved searches/alerts | Requires consent, preference management, event handling and a real delivery channel. Build after sufficient published inventory. | Return qualified buyers; measure alert-to-enquiry, opt-outs and delivery failures. |
| 3 | Route/service profiles | Supplier page shows varied port/border/local services. Let each agency configure services and maintain its own dated route estimates and inclusions. | Consistent quoting for sourcing, clearing or both; retain USD-only release policy. |

## Boundaries and launch evidence

This review does not establish a BE FORWARD partnership, licensed inventory feed, public API, live supplier availability synchronisation or permission to copy supplier imagery. A supplier's CIF total is not automatically the final Zimbabwe landed price. Supplier purchases continue in the supplier's system. Public references can be recorded in Radbit; private account links and credentials must not be stored as public listing links.

Use actual listings and agency operations to measure results after launch. Do not fill the catalogue with pretend stock, fake testimonials or unsupported verified-dealer badges. Local stock, customer sourcing and dealer import-to-stock acquisition should retain distinct ownership, cost and document access.

## Install prompt change delivered

Replaced the global floating banner with a compact branded panel in normal document flow, below page content. It is eligible only on home, dealer showrooms and account settings; it never covers navigation or appears on login, invitations, setup or operational forms. “Not now” persists seven days where browser storage is available, with an in-session fallback. Only a user click opens the native browser installer. Installed mode/appinstalled hides the panel; Safari receives home-screen instructions, and rejected/failed installation is handled without a blocking dialog.

Verification script: web/scripts/verify-install-panel.mjs. Browser checks cover 320/390/1440px, no overflow/static positioning, no automatic native prompt, dismissal across reload, login suppression, accepted installation, failure recovery, appinstalled and Safari instructions. Native installation is simulated in these checks; OS-level installation is not claimed.

## Implementation update — 5 October 2026
The five buyer-engine priorities presented to the user have been implemented: stock specifications/filtering/detail galleries, selected-vehicle enquiries, quote scope/validity, recorded case next actions, and device-local shortlist/comparison. Business onboarding and first-use guidance were redesigned. See RADBIT_AUTO_ENGINE_RELEASE.md for operational steps and validation. Saved searches/alerts, automated supplier feeds and route tariffs remain separate future work.
