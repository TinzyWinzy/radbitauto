export type SupplierLandedEstimate = {
  lowCents: number;
  highCents: number;
  taxesCents: number;
  dutyCents: number;
  surtaxCents: number;
  vatCents: number;
  carbonTaxCents: number;
  outsideCents: [number, number];
  deliveryCents: [number, number];
  agencyFeeCents: number;
  dutyPct: number;
  vatPct: number;
  surtaxPct: number;
  surtaxApplied: boolean;
  vehicleAgeYears: number;
  ageAssumed: boolean;
  tooOld: boolean;
  category: string;
  categoryAssumed: boolean;
  asAt: string;
};

const format = (cents: number) => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const usd = (cents: number) => `USD ${format(cents)}`;

export const usdRange = (lowCents: number, highCents: number) => `USD ${format(lowCents)} - ${format(highCents)}`;

export const landedRange = (estimate: SupplierLandedEstimate) => `USD ${format(estimate.lowCents)} - ${format(estimate.highCents)}`;

export const landedEstimateLine = (estimate: SupplierLandedEstimate) => `${landedRange(estimate)} (estimate as at ${estimate.asAt}, not a quote)`;
