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
  agencyFeeCents: [number, number];
  dutyPct: number;
  vatPct: number;
  surtaxPct: number;
  surtaxApplied: boolean;
  vehicleAgeYears: number;
  ageAssumed: boolean;
  tooOld: boolean;
  category: string;
  categoryAssumed: boolean;
  body?: string;
  asAt: string;
};

// Sourced planning ranges behind the estimate. Keep aligned with PLANNING_CHARGES in
// firebase/functions/src/supplierEstimate.ts (USD cents: freight 1000-1900, port 150-400,
// delivery 1200-2500, clearing/registration 300-750, insurance 1.5% with a 100 floor).
export const PLANNING_SOURCES: string[] = [
  'Sea freight, Japan to Durban by RoRo: about USD 1,000-1,900 per vehicle from 2026 freight guides (shared container about USD 1,700, sole-use 20ft about USD 2,400); 30-42 day transit.',
  'Marine insurance: about USD 100-300 per vehicle. Port handling and storage at Durban or Beira: about USD 150-400.',
  'Road transport from the port to Zimbabwe: Durban to Harare about USD 1,500-2,500, Beira to Harare about USD 1,200-2,000, varying with vehicle size.',
  'Clearing agent: about USD 100-500 per import. VID inspection about USD 20-25 plus ZINARA registration and number plates about USD 50-80.',
];

const format = (cents: number) => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const usd = (cents: number) => `USD ${format(cents)}`;

export const usdRange = (lowCents: number, highCents: number) => `USD ${format(lowCents)} - ${format(highCents)}`;

export const landedRange = (estimate: SupplierLandedEstimate) => `USD ${format(estimate.lowCents)} - ${format(estimate.highCents)}`;

export const landedEstimateLine = (estimate: SupplierLandedEstimate) => `${landedRange(estimate)} (estimate as at ${estimate.asAt}, not a quote)`;
