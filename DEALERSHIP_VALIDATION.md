# Zimbabwe dealership validation and product direction

Research date: 4 October 2026.

## Decision

Support both dealer-owned stock sales and imports arranged for named customers, within one independently branded tenant. Public evidence validates the existence of these business models, including dealers offering both. It does not establish their prevalence, transaction volumes, software budgets, willingness to pay, or the operational practices of our two prospective clients. Those require direct client validation.

Reposition the product as a dealership sales and import workspace with a customer portal. Preserve clearing-only operations and existing import histories. Do not market stock sales as implemented until its complete workflow exists.

## Evidence

| Source | What the public source supports | Confidence and limit |
|---|---|---|
| [Tokyo Motors](https://tokyomotors.com/) | Describes duty-paid vehicles in its Harare yard and direct imports for customers with specific requirements. Provides a WhatsApp contact. | Strong first-party evidence of an advertised hybrid business model; no inventory inspection or commercial interview performed. |
| [Shanteli Motors](https://www.shantelimotors.com/) | Advertises an inventory catalogue, WhatsApp enquiries and imports shipped on customers' behalf, plus clearing services. | First-party advertised services. Inventory records did not resolve in the text view; stock counts, licensing and performance claims were not independently verified. |
| [Indulge On Wheels Auto contact](https://indulgeonwheelsauto.co.zw/contact) | Requests vehicle preferences, budget, duty-paid/import preference, and viewing or sourcing enquiries through WhatsApp. | First-party search-indexed content; direct page fetch unavailable. Supports enquiry design, not proof of conversion or active stock. |
| [Tida Motors Pay & Drive](https://tidamotors.co.zw/pay-drive/) | Describes customers sharing BE FORWARD/SBT vehicle links, with the dealer arranging quotation, payment, shipping, clearance and delivery for a service fee. | First-party search-indexed content; direct page fetch unavailable. Supports an advertised customer-import workflow. |
| [BE FORWARD Zimbabwe](https://www.beforward.jp/beforward_zimbabwe) | Lists Zimbabwe offices with stock browsing, import consultation, duty consultation, clearing/delivery and WhatsApp contacts. Its Buy Now flow reserves supplier stock through BE FORWARD itself. | Direct supplier source. Does not grant our platform integration, purchasing, reservation or partnership rights. |

Do not copy public testimonials, customer counts, agent-status badges, deposit percentages or delivery promises into our product. They are dealer-specific advertising, not verified defaults. An indexed ZIMRA notice link returned a different document during research and was not used as regulatory evidence.

## Two workflows with different commercial records

| | Stock sale | Customer import |
|---|---|---|
| Vehicle owner before sale | Dealer, or separately identified consignment owner | Must record the actual purchasing/import arrangement |
| Customer starting point | A specific available vehicle, viewing or test drive | Budget, intended use, preferences or a supplier link |
| Primary flow | Enquiry → viewing → agreed price → reservation/deposit → confirmed settlement → handover → sold | Enquiry → shortlist → itemised quote → acceptance → agreed deposit/supplier payment → sourcing/shipping/clearance → settlement → delivery |
| Vehicle states | Acquiring/in transit, preparing, available, reserved, sold, withdrawn | Supplier candidate, availability checked, selected/purchased, import stages |
| Commercial result | Selling price less recorded acquisition, landing, preparation and direct selling costs | Earned service fee/commission less dealer-borne direct service costs |
| Customer portal | Vehicle, agreed price, payments, balance, viewing/handover and sale documents | Selected vehicle, quotation, supplier/payment responsibilities, progress, documents and balance |

An imported vehicle purchased for dealer inventory must become saleable stock after arrival. Its later retail sale must reference its acquisition history without running the retail buyer through already completed shipping stages or charging historic customs costs twice.

## Current system gap

Source review: web/src/lib/types.ts, firebase/functions/src/vehicles.ts and firebase/functions/src/operations.ts. The current company operationMode is sourcing/clearing/both; 'both' means sourcing plus clearing, not stock sales plus customer imports. Vehicles store purchase price and import attributes. Import cases are tied to a customer. The schema does not yet define stock availability/reservations, retail asking and agreed prices, sales ownership, lead preferences/follow-up, or complete actual-cost deal margin records.

Reuse tenant identity, authentication, invitations, customer records, vehicle identity, document validation, integer USD-cent handling, quotations, payment audit history, WhatsApp links and the import-stage system. Their existing availability does not make the new stock-sale workflow complete.

## Required product scope

1. **Business capabilities:** independently enable stock sales, customer imports and clearing. Existing tenants keep their current operations and case histories. Do not overload the current 'both' value.
2. **Lead records:** name/contact, stock/import interest, budget, preferences, linked stock unit or supplier candidate, assigned salesperson, next follow-up, last interaction and won/lost reason. Staff can record walk-ins, calls and WhatsApp conversations without customer registration.
3. **Inventory:** vehicle identity and photos, location, ownership type, acquisition history, availability, asking price, preparation costs, document checklist, days in stock, and whether the dealer chooses to publish the unit. Public descriptions must distinguish locally available, incoming and on-order vehicles.
4. **Stock-sale deal:** agreed price and approved discount, buyer, viewing/appointment, reservation expiry, payment evidence/confirmation, remaining balance, cancellation/refund history, sale/handover documents and delivery acknowledgement. Create inventory acquisition records without inventing a customer account.
5. **Reservation protection:** transactional enforcement of one active reservation/sale per stock unit; release expired/cancelled reservations; reject simultaneous duplicate sales; hide sold stock from available listings while keeping audit history. Deposits and handover requirements are configured policies, not assumed universal terms.
6. **Customer-import deal:** sourcing brief and shortlist, public supplier link/reference, last availability check, agreed service fee and responsibilities, itemised quotation, confirmation of who receives each payment, and the existing import workflow. A candidate supplier vehicle is not dealer-owned available stock and must not be advertised as such.
7. **Financial separation:** private acquisition/direct cost records, customer-facing agreed sale price or import quotation, confirmed agency receipts, separately recorded evidenced supplier payments, refunds and outstanding obligations. Never record a payment directly to a supplier as cash collected by the dealer. Never treat all customer import funds as dealer earnings.
8. **Dealer outcomes:** overdue lead follow-ups, viewing appointments, units available/reserved/sold, aged inventory, active customer imports, confirmed collections and balances. Show margin only when cost completeness is known, distinguishing estimates from completed-deal results. This is an operational margin view, not a full accounting profit statement.
9. **WhatsApp and public showroom:** dealer-branded shareable stock pages, stock enquiry and import-request actions, quotation links, follow-up/update drafts. A showroom enquiry enters the correct tenant's lead list. Public content excludes costs, margins, personal buyer details, supplier credentials and private documents. Supplier availability checks and purchases remain manual unless an authorised integration exists.
10. **Customer privacy:** many enquiries can concern one vehicle, but only the authorised buyer sees their deal/receipts. A later buyer must not see an earlier buyer's records. Preserve existing customer-case isolation and test historical resale/ownership changes.

## Implementation order

First build the shared lead record and dealer-owned inventory model, then the complete stock-sale quotation/reservation/payment/handover workflow. Add private actual-cost capture and stock-sale margin reporting alongside it. Next connect customer-import enquiries and dealer inventory acquisitions to the existing import engine, with explicit transaction purpose and recipient-aware payment records. Finally add the tenant showroom and WhatsApp lead links. Maintain mobile acceptance for every new flow.

Do not start with another dashboard redesign: useful totals depend on complete underlying operational records.

## Validation with the two prospective clients

Arrange a walkthrough of one recently completed stock sale and one customer import per dealer where applicable. Ask for anonymised records, not supplier credentials. We have not contacted dealerships or interviewed the prospects during this desk research.

For each transaction establish:

- Where did the enquiry originate, who followed up, and what caused the buyer to commit?
- Was the vehicle dealer-owned, consigned, in transit or sourced after customer instruction?
- Who was the importer/purchaser and who received each payment: supplier, dealer, transporter or clearing provider?
- How were price, fees, deposit, balance and actual costs recorded? Which costs or follow-ups were missed?
- What makes a reservation binding, when does it expire, and who may approve a discount, cancellation or release?
- Which documents and confirmations are required before handover? Who checks them?
- Does the owner need branches, commissions, consignment or instalment schedules in the initial release?
- Who will enter records daily, on what phone, and what would justify paying for this rather than continuing with current tools?

Run a proposed two-week pilot with representative real transactions and a baseline from the dealer's own recent records. Agree a concrete USD price with the owner; public websites do not validate pricing.

Measure lead capture/follow-up, quote-to-deposit conversion, stock age, reconciled balances, cost completeness, administrative time and daily staff usage. Check both workflows through customer handover. Suggested acceptance gates: no duplicate stock reservations/sales, no cross-customer disclosures, all sampled payment balances reconcile to actual evidence, and the owner can explain the recorded result for each sampled deal. Payment willingness and sustained use validate commercial value; website observations alone do not.

## Positioning

Customer-facing: buy available vehicles or ask your dealer to source one.

Dealer-facing: sell your stock, manage customer imports, follow up buyers and keep costs and balances visible in one branded workspace.

The first-party evidence supports building for hybrid dealers. Financial return, adoption and the exact first-release feature priorities remain client-validation questions.
