import { calculateImportQuotation } from './taxEngine.ts';
import type { TaxRateSet, VehicleCategory } from './types.ts';
import type { SupplierVehicle, SupplierDetailSpecs } from './beforwardParser.ts';

// Planning charges for a buyer budgeting an import, in USD cents. They are not supplier quotes.
// Each range is sourced from published 2025/2026 freight, clearing and registration guides;
// keep them aligned with the source list rendered by web/src/lib/zimbabweImport.ts (PLANNING_SOURCES).
const PLANNING_CHARGES = {
  freightCents: [100_000, 190_000] as const,      // Japan to Durban RoRo freight-only quotes: about USD 1,000-1,900 per vehicle
  portChargesCents: [15_000, 40_000] as const,    // terminal handling and storage at Durban or Beira: about USD 150-400
  localDeliveryCents: [120_000, 250_000] as const,// port to Zimbabwe road transport: Beira about USD 1,200-2,000, Durban about USD 1,500-2,500
  agencyFeeCents: [30_000, 75_000] as const,      // clearing agent USD 100-500 plus VID inspection and ZINARA registration about USD 100-150
  insuranceRate: 0.015,
  insuranceMinCents: 10_000,                      // marine insurance guides: about USD 100-300 per vehicle
};

export const PLANNING_NOTE = 'Freight, port, inland delivery, clearing and registration are planning ranges for budgeting, not quotes.';

export type SupplierLandedEstimate = {
  lowCents: number; highCents: number;
  taxesCents: number; dutyCents: number; surtaxCents: number; vatCents: number; carbonTaxCents: number;
  outsideCents: readonly [number, number]; deliveryCents: readonly [number, number];
  agencyFeeCents: readonly [number, number];
  dutyPct: number; vatPct: number; surtaxPct: number; surtaxApplied: boolean;
  vehicleAgeYears: number; ageAssumed: boolean; tooOld: boolean;
  category: VehicleCategory; categoryAssumed: boolean; body?: string; asAt: string;
};

const PASSENGER_BODIES = new Set(['hatchback', 'sedan', 'wagon', 'coupe', 'convertible', 'suv', 'van', 'mini van', 'minivan', 'minibus', 'mpv']);
const UNSUPPORTED_BODIES = new Set(['truck', 'bus', 'machinery', 'tractor', 'forklift', 'motorcycle']);
const normalise = (label?: string) => label?.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const cabFromTitle = (title: string): 'double' | 'single' | undefined =>
  /double\s*cab/i.test(title) ? 'double' : /(?:single|smart|king)\s*cab/i.test(title) ? 'single' : undefined;

// BE FORWARD states the body type as a breadcrumb on the detail page and the cab style in the
// listing title. Unknown-cab pickups assume the 60% double-cab band: under-taxing a double cab
// would leave a buyer short at the border, and the estimate says so.
export function classifyBody(title: string, detail?: SupplierDetailSpecs | null): { category: VehicleCategory; assumed: boolean; body?: string } {
  const label = normalise(detail?.body), pickupBody = label === 'pick up' || label === 'pickup';
  const cab = cabFromTitle(title);
  if (pickupBody) {
    if (cab === 'double') return { category: 'double_cab', assumed: false, body: detail!.body };
    if (cab === 'single') return { category: 'pickup_over_1400kg', assumed: true, body: detail!.body };
    if (detail?.doors === 4) return { category: 'double_cab', assumed: false, body: detail.body };
    return { category: 'double_cab', assumed: true, body: detail!.body };
  }
  if (label && PASSENGER_BODIES.has(label)) return { category: 'sedan_station_wagon', assumed: false, body: detail!.body };
  if (label && UNSUPPORTED_BODIES.has(label)) return { category: 'sedan_station_wagon', assumed: true, body: detail!.body };
  if (cab === 'double') return { category: 'double_cab', assumed: false };
  if (cab === 'single') return { category: 'pickup_over_1400kg', assumed: true };
  return { category: 'sedan_station_wagon', assumed: true };
}

export function supplierLandedEstimate(vehicle: SupplierVehicle, taxSet: TaxRateSet, refDate: string, detail?: SupplierDetailSpecs | null): SupplierLandedEstimate | null {
  const priceCents = vehicle.askingPriceCents;
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  const wanted = classifyBody(vehicle.title, detail);
  // A custom tax set may not carry every category; fall back to passenger rates rather than throw.
  const category = Object.hasOwn(taxSet.dutyRates, wanted.category) ? wanted.category
    : Object.hasOwn(taxSet.dutyRates, 'sedan_station_wagon') ? 'sedan_station_wagon' as const : null;
  if (!category) return null;
  const categoryAssumed = category !== wanted.category || wanted.assumed;
  const refYear = Number(refDate.slice(0, 4));
  const ageAssumed = vehicle.specs.year === undefined;
  const year = vehicle.specs.year ?? refYear - (taxSet.surtaxThresholdYears + 1);
  const insuranceCents = Math.max(PLANNING_CHARGES.insuranceMinCents, Math.round(priceCents * PLANNING_CHARGES.insuranceRate));
  const build = (side: 0 | 1) => calculateImportQuotation(
    { category, engineCc: vehicle.specs.engineCc, purchasePriceCents: priceCents, year },
    taxSet,
    refYear,
    {
      freightCents: PLANNING_CHARGES.freightCents[side],
      insuranceCents,
      borderFreightCents: 0,
      portChargesCents: PLANNING_CHARGES.portChargesCents[side],
      localDeliveryCents: PLANNING_CHARGES.localDeliveryCents[side],
      agencyFeeCents: PLANNING_CHARGES.agencyFeeCents[side],
    },
  );
  const low = build(0);
  const high = build(1);
  const age = high.applied.vehicleAgeYears;
  return {
    lowCents: low.totalDueCents,
    highCents: high.totalDueCents,
    taxesCents: high.taxTotalCents,
    dutyCents: high.customsDutyCents,
    surtaxCents: high.surtaxCents,
    vatCents: high.vatCents,
    carbonTaxCents: high.carbonTaxCents,
    outsideCents: [low.cifValueCents - low.valuationCents, high.cifValueCents - high.valuationCents],
    deliveryCents: PLANNING_CHARGES.localDeliveryCents,
    agencyFeeCents: PLANNING_CHARGES.agencyFeeCents,
    dutyPct: high.applied.dutyPct,
    vatPct: high.applied.vatPct,
    surtaxPct: high.applied.surtaxPct,
    surtaxApplied: high.surtaxCents > 0,
    vehicleAgeYears: age,
    ageAssumed,
    tooOld: age > 10,
    category,
    categoryAssumed,
    ...(wanted.body ? { body: wanted.body } : {}),
    asAt: refDate,
  };
}
