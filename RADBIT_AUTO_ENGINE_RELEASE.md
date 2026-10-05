# Radbit Auto buyer engine and onboarding release

5 October 2026. Builds on the five improvements proposed after the BE FORWARD public-site review.

## Buyer journeys

- Browse published available stock with make/model/dealer/location text search, USD budget, minimum year, fuel, transmission and body filters, plus price/year sorting.
- Save up to three stock IDs on the current device and compare their confirmed specifications. Old IDs never restore private or unavailable records; clear the shortlist to remove outdated selections. Browser storage failure falls back to the current visit.
- Open /showroom/{agency}/vehicle/{stockId} for the photo gallery, specifications, description, asking price, WhatsApp enquiry and a public share link. The page explicitly explains that price inclusions/condition/availability must be confirmed.
- Send a prefilled vehicle enquiry with an optional USD budget. The backend transaction checks the stock is published, available and belongs to the selected agency before creating a lead. Dealer leads retain stock ID and title. Withdrawn, reserved or sold stock cannot accept a vehicle-specific enquiry.

## Dealer operations

- In Dealer → Stock, review the registered make/model/year/engine details and add confirmed mileage, fuel, transmission and body type before saving the showroom listing.
- Existing stock keeps its registered metadata as a fallback. The public endpoint uses an explicit projection; chassis/engine identifiers, customer IDs, supplier purchase data and acquisition costs are not returned.
- Quote issuance can record arrival/delivery route, included services, exclusions and price validity. Terms are saved with the issued quotation version and appear in the customer's summary and printable quotation. Past-validity prices cannot be accepted by a customer. Payment records and historic documents remain intact; validity does not suppress recording actual payments.
- Case → Next action lets an agency record an actionable instruction, who must act, a target date and completion state. Customers see the actual recorded instruction. The target is clearly distinguished from a confirmed shipping/delivery date. Membership, tenant, subscription-write and audit checks apply.

## Onboarding

- Public business setup now has a coherent light Radbit identity, business/contact sections, live agency preview and clear showroom-address guidance. Suggested address/prefix follow the business name until manually edited.
- Agencies choose local sales, imports or hybrid focus, stored with the validated agency configuration. Existing sourcing/clearing workflow choices and USD-only pricing remain intact.
- Email verification, trial terms and isolated workspace creation still use the production workflows; no fake inventory or demo users are created.
- The owner dashboard includes a first-use checklist based on actual stock/team/case records. It provides direct paths to stock/customer creation, publication, the public showroom and invitations.
- The platform administration page separates new-agency creation from existing-agency access/subscription management.

## Validation

Type checks and 28 unit tests passed. All 63 backend emulator function tests passed, including publication privacy, selected-stock tenancy/availability, quotation scope/version persistence, validity enforcement and case-action permissions. All seven targeted owner signup, buyer browsing and retail/acquisition/finance browser journeys passed without retries. Hosting and all eight affected functions were deployed successfully; live responsive public checks and anonymous-access rejection passed. Deployment evidence is recorded in PRODUCTION_READINESS.md. Browser fixtures are local/emulated; no synthetic production accounts, inventory, emails or payments were created.

## Remaining separate opportunities

An automated supplier inventory/API feed, cross-device shortlists, saved-search alerts, carrier tracking integrations and agency route-tariff automation were not part of the five-item implementation. Supplier purchases remain external; no BE FORWARD partnership or live supplier synchronisation is claimed.

