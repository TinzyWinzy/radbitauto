import { calculateImportQuotation } from './taxEngine.ts';
import type { TaxRateSet, VehicleCategory } from './types.ts';
import type { SupplierVehicle } from './beforwardParser.ts';

// Planning charges for a buyer budgeting an import, in USD cents. They are not supplier quotes.
// Freight, port, inland delivery and dealer fees are always confirmed separately by the dealer.
const PLANNING_CHARGES = {
  freightCents: [90_000, 160_000] as const,
  portChargesCents: [15_000, 35_000] as const,
  localDeliveryCents: [70_000, 160_000] as const,
  agencyFeeCents: 40_000,
  insuranceRate: 0.015,
  insuranceMinCents: 5_000,
};

export const PLANNING_NOTE = 'Freight, port, inland delivery and dealer fee are planning ranges for budgeting, not quotes.';

export type SupplierLandedEstimate = {
  lowCents: number; highCents: number;
  taxesCents: number; dutyCents: number; surtaxCents: number; vatCents: number; carbonTaxCents: number;
  outsideCents: readonly [number, number]; deliveryCents: readonly [number, number]; agencyFeeCents: number;
  dutyPct: number; vatPct: number; surtaxPct: number; surtaxApplied: boolean;
  vehicleAgeYears: number; ageAssumed: boolean; tooOld: boolean;
  category: VehicleCategory; categoryAssumed: boolean; asAt: string;
};

const CATEGORY: VehicleCategory = 'sedan_station_wagon';

export function supplierLandedEstimate(vehicle: SupplierVehicle, taxSet: TaxRateSet, refDate: string): SupplierLandedEstimate | null {
  const priceCents = vehicle.askingPriceCents;
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  const refYear = Number(refDate.slice(0, 4));
  const ageAssumed = vehicle.specs.year === undefined;
  const year = vehicle.specs.year ?? refYear - (taxSet.surtaxThresholdYears + 1);
  const insuranceCents = Math.max(PLANNING_CHARGES.insuranceMinCents, Math.round(priceCents * PLANNING_CHARGES.insuranceRate));
  const build = (side: 0 | 1) => calculateImportQuotation(
    { category: CATEGORY, engineCc: vehicle.specs.engineCc, purchasePriceCents: priceCents, year },
    taxSet,
    refYear,
    {
      freightCents: PLANNING_CHARGES.freightCents[side],
      insuranceCents,
      borderFreightCents: 0,
      portChargesCents: PLANNING_CHARGES.portChargesCents[side],
      localDeliveryCents: PLANNING_CHARGES.localDeliveryCents[side],
      agencyFeeCents: side ? PLANNING_CHARGES.agencyFeeCents : 0,
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
    category: CATEGORY,
    categoryAssumed: true,
    asAt: refDate,
  };
}
