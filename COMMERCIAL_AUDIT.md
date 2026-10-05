# Commercial and user-flow audit

Date: 4 October 2026

## Verdict

This has a credible path to becoming a profitable specialist software business serving Zimbabwean vehicle sourcing agencies and clearing companies. Commercial viability remains unproven: the repository demonstrates product functionality, not willingness to pay, active adoption, retention or acquisition economics.

Sell an agency operating system with a customer portal: fewer update calls, complete clearance files, reliable balances and faster case handling. Customer reassurance helps sell the product, but agency operational value must justify recurring payment. Keep customer access included.

Evidence scope: specification and source review of routes, onboarding, customer linking, case creation, dashboards, quotations, payments, tracking and data hooks; limited public market research. No live UX session, production-data audit, security penetration test or executed test suite. Existing test files are not proof that checks pass. Prices and financial examples below are hypotheses, not validated market rates or forecasts.

## Buyers and differentiation

First target: owner-managed agencies with several staff, repeat monthly imports and enough live cases that WhatsApp follow-ups consume time. Very small operators may not save enough to justify a subscription; larger organisations may require accounting integrations and procurement assurances before buying.

Three users have different needs:

- Owner: outstanding collections, case profitability, stalled jobs, staff accountability.
- Operator: quick updates, missing-document checklist, accurate quotations, clear next action.
- Customer: trusted current status, balance, documents and contact details.

Competitors include existing behaviour (WhatsApp, spreadsheets and folders), shipment tracking tools, existing agent portals and wider logistics software. ClearBridge publicly offers shipment tracking and a portal; PrinSoft markets a Zimbabwean bonded-warehouse solution with an agent portal. These pages establish adjacent competition, not verified functionality or adoption.

Sources: [ClearBridge](https://clearbridgeglobal.co.zw/), [PrinSoft](https://www.prinsoft.co.zw/odoo-solutions/bonded-warehouse), [track-trace](https://www.track-trace.com/).

The defensible advantage would be locally appropriate workflows, low onboarding effort, documented regulatory maintenance and a reliable operational record. Branding and a timeline alone are readily copied. The initial tenant names in the repository do not establish paying customers or signed partnerships.

The specification's market-volume figures lack sufficient provenance for sizing a business. Build a bottom-up market estimate: verified eligible agencies × realistic reachable share × validated annual spend. Separate vehicle sourcing firms from clearing-only agents and avoid counting one company twice. ZIMRA publishes a registered-agent list, but its currency and vehicle specialisation need checking: [registered agents](https://www.zimra.co.zw/customs/forms?download=3856%3Alist-of-registered-clearing-agents).

## User-flow findings

| Priority | Current evidence | Commercial consequence | Recommended flow |
|---|---|---|---|
| High | Landing agency CTA uses a placeholder WhatsApp number; “See a live case” leads to login | Sales enquiries can go to the wrong destination; prospects cannot inspect value | Real sales contact, book-demo action and clearly labelled sample case |
| High | Company setup is restricted to platform administrators | Assisted onboarding can work initially, but limits scalable acquisition | Demo → paid pilot agreement → assisted setup → first live case; later add a controlled trial |
| High | Customer must register before staff can link their email | Agency depends on customer action before beginning operational records | Staff creates customer/case immediately; expiring invitation lets customer claim access later |
| High | New case requires an existing customer and registered vehicle with VIN and price | Cannot naturally capture an enquiry before sourcing a vehicle | Lead with budget/preferences → estimate → acceptance/deposit → attach sourced vehicle |
| High | Customer dashboard shows vehicle, stage, balance and update date, but not all seven specified answers | Customer still needs detail screens or messages for next action, location and payment history | Show latest location with timestamp, next action and who owns it; retain one-tap detail/contact |
| High | Tracking posts are manually entered | A stale portal can reduce trust rather than reassure | Show “last reported” time, stale-update warnings and operator follow-up tasks |
| High | Financial and workflow actions use callable functions; Firestore cache exists | Offline cache does not establish offline execution of callable mutations | Define supported offline actions explicitly; durable queue and conflict UX if offline stage changes are required |
| Medium | Dashboard statistics use a query capped at 100 cases and label its result “active” without a stage filter | Owner may make decisions from incomplete or mislabelled totals | Separate open/delivered/cancelled cases; paginate lists and compute full scoped aggregates |
| Medium | Staff dashboard uses global stage labels/progress while backend uses tenant-configured stages | Custom workflows can display misleading progress | Use tenant definitions consistently for labels, order, progress and next action |
| Medium | Customer creation and vehicle creation are separate prerequisites | First-case setup takes unnecessary navigation | One guided case setup with inline customer and vehicle creation |

Desired operational flow: enquiry → estimate → customer approval → payment recorded/verified → sourcing → shipment updates → clearance checklist → final reconciliation → collection confirmation → delivery proof → archive/repeat business.

Clearing-only work needs its own start point: an already-purchased or arriving vehicle should not have to simulate sourcing. Include exceptions such as delay, cancellation, rejected document, disputed charge and refund; a forward-only happy path is insufficient for paid operations.

## Financial product gaps

1. **Quotation calculation is a launch blocker.** `taxEngine.ts` uses max(invoice, Yellow Book value) as `cifValueCents`. Its input has no freight, insurance or port/border charge fields; `quotations.ts` passes no such costs. This contradicts SPEC.md's CIF definition and can materially misstate estimates. Establish the correct charge treatment against current authoritative guidance, then add itemised cost inputs and meaningful calculation tests.
2. **Customs valuation and actual purchase cost need separate fields.** A higher customs valuation may change the tax basis without changing the amount paid to the seller. The current total includes the selected valuation as if it were the purchase cost. Determine whether the agency invoices the whole landed vehicle cost or only clearance/services, and implement explicit quote types.
3. **No explicit agency fee or gross-margin model is exposed in the reviewed quotation API.** Add sourcing/clearance/service fees, expenses, payer responsibility and case margin. Otherwise the product tracks amounts without explaining agency earnings.
4. **Payment recording is not payment processing.** The reviewed API records and confirms payments manually; EcoCash/InnBucks names are methods, not evidence of gateways or platform fee income.
5. **Refund/reversal status labels are not complete workflows.** They appear in types/UI, but the reviewed API exposes record/confirm rather than a reversal/refund operation. Add audited adjustments and credits with appropriate permissions.
6. **Currency labels are insufficient.** Monetary records reviewed lack per-transaction currency and FX metadata, while tenant settings choose display currency. Changing a label cannot convert balances. Keep an explicit USD-only policy initially or implement currencies and conversions throughout.

ZIMRA describes pre-clearance before arrival and requests a wider evidence set including purchase payment proof, freight statements and importer identification. Therefore the fixed five-document checklist should not be marketed as a universally complete compliance determination. Use route/category/rebate-specific checklists and agent review. [ZIMRA pre-clearance notice](https://www.zimra.co.zw/public-notices?download=3506%3Apublic-notice-73-of-2023-reminder-on-pre-clearance-of-imported-private-motor-vehicles).

This audit does not validate the specification's tax rates, statutory references, exemptions or VAT formula. Current legal review and authoritative tariff verification remain required before presenting quotes as dependable. [ZIMRA private importations](https://www.zimra.co.zw/customs/private-importations), [ZIMRA eTariff](https://etariff.zimra.co.zw/).

## How the platform earns money

Recommended first model: agency subscription plus setup/migration fee. Keep customer users included; limit plans by monthly new cases and operational features rather than customer logins. Define case allowances, overages, archive access and support clearly.

Illustrative USD pricing experiments:

| Plan | Monthly price hypothesis | Intended segment |
|---|---:|---|
| Starter | $49 | Small agency; core portal and records |
| Growth | $129 | Multi-staff agency; tasks, reminders, reporting and branded customer experience |
| Pro | $249 | Larger agency; branches, management reporting and integrations once implemented |
| Setup/migration | $150–$500 once | Branding, record import and staff training; price to cover actual delivery work |

Do not promise unimplemented features in a paid plan. Initially sell one supported package around $79–$129/month with assisted onboarding; use pilot evidence to determine final tiers.

Alternatives and later expansion:

- Low-volume plan: roughly $5–$10 per newly opened case with a minimum monthly charge; validate whether case volume is auditable and predictable.
- Automation add-on: WhatsApp Business messaging and collection reminders, priced above provider costs and support effort. Deep-links alone are not automated outbound messaging.
- Enterprise: negotiated annual subscriptions for branches, integrations and service commitments.
- Disclosed referrals: transport, inspections or insurance partnerships only after actual referral agreements and customer consent. No assumed commission revenue today.
- Payment fees: possible only after a suitable provider integration and documented commercial/legal arrangements. Treat customer import funds separately from platform subscription receipts.

Avoid advertising and charging individual customers just to see their import. Both can undermine agency trust and customer uptake.

## How agencies earn or retain more money

- Quote conversion: capture enquiries early, follow up estimates and record acceptance/deposit.
- Revenue capture: itemise legitimate agency fees and expenses so they are not forgotten.
- Collections: aged balances, due dates and reminders reduce time spent chasing payment.
- Cost control: missing-document tasks and stalled-case alerts help avoid preventable delays and charges.
- Staff capacity: less repetitive customer messaging can allow more cases per operator.
- Repeat business: delivery confirmation followed by an authorised referral/review request.

Measure these outcomes. A portal does not automatically increase margin: staff must keep records current and customers must actually use them.

## Illustrative unit economics

These examples are arithmetic scenarios, not forecasts; all values USD.

| Scenario | Paying agencies | Average monthly revenue/agency | Monthly recurring revenue |
|---|---:|---:|---:|
| Validation | 10 | $79 | $790 |
| Small commercial base | 30 | $99 | $2,970 |
| Established niche business | 75 | $129 | $9,675 |

At $129 revenue per agency and assumed $35 direct monthly delivery costs, contribution is $94. With $3,000 monthly fixed costs, break-even is 32 agencies. Include support labour, hosting/storage, messaging, billing charges and customer success in actual costs; setup revenue should not conceal an unprofitable subscription.

At an assumed $250 acquisition cost, contribution payback is about 2.7 months. At assumed 3% monthly customer churn, a simple contribution/churn estimate gives approximately $3,133 lifetime contribution; this is particularly uncertain before observed retention and excludes discounting and expansion. Measure cohorts instead of treating this estimate as business value.

ROI test for an agency: 20 cases × 30 minutes saved = 10 hours/month. At an assumed $5/hour, time savings are only $50, insufficient alone to justify $129. Faster collections, extra handled cases or avoided losses must create measurable additional value. Cash collected sooner improves cash flow; it is not automatically additional revenue.

## Validation and delivery order

First 30 days: interview 10 agencies and several customers; document cases/month, update-message volume, actual admin hours, quote conversion and collection delays. Demonstrate the working product and seek 3 paid pilots. Eddy Customs and Muchy Motors are natural prospects if relationships exist, not assumed buyers.

Before live financial use: correct quotation inputs and purchase/tax valuation separation; validate regulatory configuration; provide invitations, complete payment corrections and accurate owner totals. Confirm tenant isolation, document access, backups and recovery through executed checks. Reconcile SPEC.md's obsolete Postgres/signed-URL descriptions with the Firebase implementation.

During a 30-day paid pilot: onboard at least 10 real cases per agency where volume permits; compare baseline and pilot admin time, customer update enquiries, payment reconciliation effort and document completeness. Record activation, weekly staff use and customer portal access.

Suggested decision gates, to agree before pilots: 3 agencies actually pay; at least 2 renew at the intended ongoing price; weekly operational use persists; onboarding and support costs leave positive contribution; at least one important operational outcome improves materially. A 25% drop in repetitive status enquiries is a reasonable experiment target, not an existing result.

If users praise the portal but will not pay, determine whether the payer receives too little operational value, setup takes too long, or data freshness fails. Revise the workflow and positioning before adding marketplaces, finance products or expensive integrations.

## Evidence map

- `SPEC.md`: intended market, state machine, CIF calculation and acceptance requirements.
- `web/src/pages/Landing.tsx`: positioning, placeholder sales number and login-based demo CTA.
- `web/src/App.tsx`, `Onboarding.tsx`, `NewCustomer.tsx`, `NewCase.tsx`: company/customer activation and case prerequisites.
- `web/src/pages/Dashboard.tsx`, `web/src/lib/hooks.ts`: dashboard metrics, presentation and query limits.
- `web/src/pages/CaseDetail.tsx`: quotations, payment recording, document and manual tracking UX.
- `web/src/lib/api.ts`: available financial/workflow operations.
- `firebase/functions/src/taxEngine.ts`, `quotations.ts`, `payments.ts`, `cases.ts`: calculation, transactional financial writes and transition guards.
- `web/src/lib/firebase.ts`: persistent cache; does not establish offline callable execution.

Recommendation: pursue a paid agency-software pilot after fixing financial trust and activation friction. The product has a plausible business; revenue and retention evidence must establish whether it is a good one.
