import { landedRange, usd, usdRange, PLANNING_SOURCES, type SupplierLandedEstimate } from '../lib/zimbabweImport';

export default function LandedCostEstimate({ estimate, priceCents }: { estimate: SupplierLandedEstimate; priceCents: number }) {
  const rows: [string, string][] = [
    ['Supplier vehicle price', usd(priceCents)],
    ...(estimate.body ? ([['Body type', estimate.body]] as [string, string][]) : []),
    ['Sea freight, insurance and port charges', usdRange(estimate.outsideCents[0], estimate.outsideCents[1])],
    [`Customs duty (${estimate.dutyPct}% of CIF)`, usd(estimate.dutyCents)],
    ...(estimate.surtaxApplied ? ([[`Surtax (${estimate.surtaxPct}%, vehicle ${estimate.vehicleAgeYears} years old)`, usd(estimate.surtaxCents)]] as [string, string][]) : []),
    ...(estimate.carbonTaxCents ? ([['Carbon tax', usd(estimate.carbonTaxCents)]] as [string, string][]) : []),
    [`VAT (${estimate.vatPct}%)`, usd(estimate.vatCents)],
    ['Inland delivery to Zimbabwe', usdRange(estimate.deliveryCents[0], estimate.deliveryCents[1])],
    ['Clearing, registration and dealer fee', usdRange(estimate.agencyFeeCents[0], estimate.agencyFeeCents[1])],
    ['Estimated landed total', landedRange(estimate)],
  ];
  return <section className="supplier-landed-cost" aria-label="Estimated landed cost in Zimbabwe">
    <p className="interface-eyebrow">Budget for Zimbabwe</p>
    <h3>Estimated landed cost</h3>
    <p className="catalogue-price">{landedRange(estimate)}</p>
    <p className="interface-note">Estimate, not a quote. Supplier price plus freight, estimated duties and VAT, plus delivery and dealer fees. Your dealer and clearing agent confirm every figure before you commit.</p>
    <dl className="stock-spec-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="interface-note">The breakdown shows the higher figure of the range. Vehicle price, freight and duties are the main moving parts.</p>
    {estimate.tooOld && <p className="interface-note" role="note">This vehicle is {estimate.vehicleAgeYears} years old. Import eligibility under the current age window must be confirmed with ZIMRA before you pay anything.</p>}
    {estimate.ageAssumed && <p className="interface-note">Model year is not confirmed in this listing, so the surtax age rule is applied conservatively.</p>}
    {estimate.categoryAssumed && (estimate.category === 'double_cab'
      ? <p className="interface-note">Cab type is not confirmed for this pickup, so double-cab rates (60% duty) are applied. A confirmed single cab is taxed at 40%.</p>
      : estimate.category === 'pickup_over_1400kg'
        ? <p className="interface-note">Cab and payload are not confirmed, so the higher pickup duty band is used. A confirmed double cab is taxed at 60%.</p>
        : <p className="interface-note">Body type is not confirmed in this listing, so passenger vehicle rates are used. A pickup or double cab is taxed differently.</p>)}
    <details className="landed-cost-method"><summary>How this is estimated</summary>
      <ul>
        <li>Uses the same duty, surtax, carbon tax and VAT rules as Radbit Auto import quotations, applied to CIF (supplier price + freight + insurance + port charges). Rates as at {estimate.asAt}.</li>
        <li>Body type comes from the supplier listing page where it is stated, and cab style from the listing title. Passenger vehicles are charged 40% duty, double cabs 60%.</li>
        <li>Freight, port, inland delivery, clearing and registration are planning ranges for budgeting, not quotes. They are based on published 2025-2026 guides:</li>
        {PLANNING_SOURCES.map((source) => <li key={source}>{source}</li>)}
        <li>Typical route: Japan to Durban (South Africa) or Beira (Mozambique) by RoRo, then road to Zimbabwe. Allow about 4-6 weeks at sea plus inland transport.</li>
        <li>Duties and VAT are set by ZIMRA and change over time. Your dealer and clearing agent confirm the current figures.</li>
      </ul>
    </details>
  </section>;
}
