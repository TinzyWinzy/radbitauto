import type { MoneyCents, TaxRateSet, VehicleCategory } from './types.ts';

export interface QuotationVehiclesView {
  category: VehicleCategory;
  engineCc?: number;
  purchasePriceCents: MoneyCents;
  yellowBookValueCents?: MoneyCents;
  year: number;
}

export interface QuotationResult {
  purchasePriceCents: MoneyCents;
  charges: QuotationCharges;
  taxTotalCents: MoneyCents;
  valuationBasis: 'invoice' | 'yellow_book';
  valuationCents: MoneyCents;
  cifValueCents: MoneyCents;
  customsDutyCents: MoneyCents;
  surtaxCents: MoneyCents;
  vatCents: MoneyCents;
  carbonTaxCents: MoneyCents;
  totalDueCents: MoneyCents;
  applied: {
    dutyPct: number;
    surtaxPct: number;
    vatPct: number;
    surtaxThresholdYears: number;
    vehicleAgeYears: number;
  };
}

export interface QuotationCharges {
  freightCents: MoneyCents;
  insuranceCents: MoneyCents;
  borderFreightCents: MoneyCents;
  portChargesCents: MoneyCents;
  localDeliveryCents: MoneyCents;
  agencyFeeCents: MoneyCents;
}

export function normalizeCharges(input: unknown = {}): QuotationCharges {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('quotation charges must be an object');
  }
  const fields = ['freightCents', 'insuranceCents', 'borderFreightCents', 'portChargesCents', 'localDeliveryCents', 'agencyFeeCents'] as const;
  const values = input as Record<string, unknown>;
  if (Object.keys(values).some((key) => !fields.includes(key as typeof fields[number]))) {
    throw new Error('unknown quotation charge');
  }
  const result = {} as QuotationCharges;
  for (const field of fields) {
    const value = values[field] ?? 0;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000) {
      throw new Error(`${field} must be a nonnegative safe integer of cents within the supported limit`);
    }
    result[field] = value;
  }
  return result;
}

function pct(baseCents: MoneyCents, pct: number): MoneyCents {
  return Math.round((baseCents * pct) / 100);
}

function dutyPctFor(category: VehicleCategory, taxSet: TaxRateSet): number {
  const rate = taxSet.dutyRates[category];
  if (rate === undefined) {
    throw new Error(`no duty rate configured for vehicle category: ${category}`);
  }
  return rate;
}

function carbonTaxFor(cc: number, taxSet: TaxRateSet): MoneyCents {
  let total = 0;
  for (const band of taxSet.carbonTaxBands) {
    if (cc >= band.fromCc && (band.toCc === undefined || band.toCc === null || cc <= band.toCc)) {
      total += band.amountCents;
    }
  }
  return total;
}

export function vehicleAgeYears(year: number, refYear: number): number {
  return refYear - year;
}

export function resolveActiveTaxRate(
  taxSets: TaxRateSet[],
  companyId: string | undefined,
  refDate: string,
): TaxRateSet {
  const active = taxSets
    .filter(
      (t) =>
        t.effectiveFrom <= refDate &&
        (t.effectiveTo === undefined || t.effectiveTo === null || t.effectiveTo >= refDate) &&
        ((t.scope === 'company' && t.companyId !== undefined && t.companyId === companyId) ||
          t.scope === 'all'),
    )
    .sort(
      (a, b) =>
        (b.scope === 'company' ? 1 : 0) - (a.scope === 'company' ? 1 : 0) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  if (active[0] === undefined) {
    throw new Error('no active tax rate set');
  }
  return active[0];
}

export function calculateImportQuotation(
  vehicle: QuotationVehiclesView,
  taxSet: TaxRateSet,
  refYear: number,
  chargeInput: Partial<QuotationCharges> = {},
): QuotationResult {
  const charges = normalizeCharges(chargeInput);
  for (const value of [vehicle.purchasePriceCents, vehicle.yellowBookValueCents ?? 0]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000) {
      throw new Error('vehicle values must be nonnegative safe integers of cents within the supported limit');
    }
  }
  const cc = vehicle.engineCc === undefined ? 0 : vehicle.engineCc;
  const valuationCents = Math.max(vehicle.purchasePriceCents, vehicle.yellowBookValueCents ?? 0);
  const valuationBasis =
    vehicle.yellowBookValueCents !== undefined &&
    vehicle.yellowBookValueCents !== null &&
    vehicle.yellowBookValueCents > vehicle.purchasePriceCents
      ? ('yellow_book' as const)
      : ('invoice' as const);

  const concreteDutyPct = dutyPctFor(vehicle.category, taxSet);
  const outsideZimbabweCents = charges.freightCents + charges.insuranceCents + charges.borderFreightCents + charges.portChargesCents;
  const cifValueCents = valuationCents + outsideZimbabweCents;
  const customsDutyCents = pct(cifValueCents, concreteDutyPct);
  const age = vehicleAgeYears(vehicle.year, refYear);
  const isPassengerType = vehicle.category === 'sedan_station_wagon';
  const surtaxCents =
    isPassengerType && age > taxSet.surtaxThresholdYears
      ? pct(cifValueCents, taxSet.surtaxPct)
      : 0;
  const vatCents = pct(cifValueCents + customsDutyCents, taxSet.vatPct);
  const carbonTaxCents = carbonTaxFor(cc, taxSet);
  const taxTotalCents = customsDutyCents + surtaxCents + vatCents + carbonTaxCents;
  // Customs valuation changes the tax basis, never the invoice paid to the supplier.
  const totalDueCents = vehicle.purchasePriceCents + outsideZimbabweCents + taxTotalCents + charges.localDeliveryCents + charges.agencyFeeCents;
  if (!Number.isSafeInteger(totalDueCents)) throw new Error('quotation exceeds supported monetary precision');

  return {
    purchasePriceCents: vehicle.purchasePriceCents,
    charges,
    taxTotalCents,
    valuationBasis,
    valuationCents,
    cifValueCents,
    customsDutyCents,
    surtaxCents,
    vatCents,
    carbonTaxCents,
    totalDueCents,
    applied: {
      dutyPct: concreteDutyPct,
      surtaxPct: taxSet.surtaxPct,
      vatPct: taxSet.vatPct,
      surtaxThresholdYears: taxSet.surtaxThresholdYears,
      vehicleAgeYears: age,
    },
  };
}
