import { landedRange, usd, usdRange, type SupplierLandedEstimate } from '../lib/zimbabweImport';

export default function LandedCostEstimate({ estimate, priceCents }: { estimate: SupplierLandedEstimate; priceCents: number }) {
  const rows: [string, string][] = [
    ['Supplier vehicle price', usd(priceCents)],
    ['Sea freight, insurance and port charges', usdRange(estimate.outsideCents[0], estimate.outsideCents[1])],
    [`Customs duty (${estimate.dutyPct}% of CIF)`, usd(estimate.dutyCents)],
    ...(estimate.surtaxApplied ? ([[`Surtax (${estimate.surtaxPct}%, vehicle ${estimate.vehicleAgeYears} years old)`, usd(estimate.surtaxCents)]] as [string, string][]) : []),
    ...(estimate.carbonTaxCents ? ([['Carbon tax', usd(estimate.carbonTaxCents)]] as [string, string][]) : []),
    [`VAT (${estimate.vatPct}%)`, usd(estimate.vatCents)],
    ['Inland delivery and dealer fee', usdRange(estimate.deliveryCents[0], estimate.deliveryCents[1] + estimate.agencyFeeCents)],
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
    {estimate.categoryAssumed && <p className="interface-note">Body type is not confirmed in this listing, so passenger vehicle rates are used. A pickup or double cab is taxed differently.</p>}
    <details className="landed-cost-method"><summary>How this is estimated</summary>
      <ul>
        <li>Uses the same duty, surtax, carbon tax and VAT rules as Radbit Auto import quotations, applied to CIF (supplier price + freight + insurance + port charges). Rates as at {estimate.asAt}.</li>
        <li>Freight, port, inland delivery and dealer fee are planning ranges for budgeting, not quotes.</li>
        <li>Typical route: Japan to Durban (South Africa) or Beira (Mozambique) by RoRo, then road to Zimbabwe. Allow about 4-6 weeks at sea plus inland transport.</li>
        <li>Duties and VAT are set by ZIMRA and change over time. Your dealer and clearing agent confirm the current figures.</li>
      </ul>
    </details>
  </section>;
}
