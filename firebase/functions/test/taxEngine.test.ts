import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TaxRateSet } from '../src/types.ts';
import {
  calculateImportQuotation,
  resolveActiveTaxRate,
  vehicleAgeYears,
  normalizeCharges,
} from '../src/taxEngine.ts';

const SEED_TAX: TaxRateSet = {
  scope: 'all',
  effectiveFrom: '2024-01-01',
  vatPct: 15.5,
  surtaxThresholdYears: 5,
  surtaxPct: 35,
  dutyRates: {
    sedan_station_wagon: 40,
    pickup_up_to_800kg: 25,
    pickup_801_to_1400kg: 40,
    pickup_over_1400kg: 40,
    double_cab: 60,
  },
  carbonTaxBands: [
    { fromCc: 0, toCc: 1500, amountCents: 600 },
    { fromCc: 1501, toCc: 2000, amountCents: 1100 },
    { fromCc: 2001, toCc: 3000, amountCents: 1500 },
    { fromCc: 3001, toCc: undefined, amountCents: 3000 },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('vehicleAgeYears', () => {
  it('computes age from reference year minus model year', () => {
    assert.equal(vehicleAgeYears(2015, 2026), 11);
    assert.equal(vehicleAgeYears(2022, 2026), 4);
  });
});

describe('calculateImportQuotation (ZIMRA golden vectors, cents, VAT 15.5%)', () => {
  const REF_YEAR = 2026;

  it('matches ZIMRA 2001 sedan 1800cc example (VDP 5900, duty 40%, surtax 35%, carbon)', () => {
    const result = calculateImportQuotation(
      {
        category: 'sedan_station_wagon',
        engineCc: 1800,
        purchasePriceCents: 590000,
        year: 2001,
      },
      SEED_TAX,
      REF_YEAR,
    );
    assert.equal(result.valuationBasis, 'invoice');
    assert.equal(result.valuationCents, 590000);
    assert.equal(result.customsDutyCents, 236000);
    assert.equal(result.surtaxCents, 206500);
    assert.equal(result.vatCents, 128030);
    assert.equal(result.carbonTaxCents, 1100);
    assert.equal(result.totalDueCents, 1161630);
    assert.deepEqual(result.applied, {
      dutyPct: 40,
      surtaxPct: 35,
      vatPct: 15.5,
      surtaxThresholdYears: 5,
      vehicleAgeYears: 25,
    });
  });

  it('uses yellow book value when higher than invoice (R-4 maximum rule)', () => {
    const result = calculateImportQuotation(
      {
        category: 'sedan_station_wagon',
        engineCc: 1200,
        purchasePriceCents: 500000,
        yellowBookValueCents: 600000,
        year: 2020,
      },
      SEED_TAX,
      REF_YEAR,
    );
    assert.equal(result.valuationBasis, 'yellow_book');
    assert.equal(result.valuationCents, 600000);
    assert.equal(result.customsDutyCents, 240000);
    assert.equal(result.surtaxCents, 210000);
    assert.equal(result.vatCents, 130200);
    assert.equal(result.carbonTaxCents, 600);
    assert.equal(result.totalDueCents, 1080800);
  });

  it('applies no surtax when vehicle age is within threshold (pickup 25%)', () => {
    const result = calculateImportQuotation(
      {
        category: 'pickup_up_to_800kg',
        engineCc: undefined,
        purchasePriceCents: 400000,
        year: 2022,
      },
      SEED_TAX,
      REF_YEAR,
    );
    assert.equal(result.surtaxCents, 0);
    assert.equal(result.customsDutyCents, 100000);
    assert.equal(result.vatCents, 77500);
    assert.equal(result.carbonTaxCents, 600);
    assert.equal(result.totalDueCents, 578100);
  });

  it('VAT base is valuation + customs duty only (surtax excluded, ZIMRA VTP rule)', () => {
    const result = calculateImportQuotation(
      {
        category: 'sedan_station_wagon',
        engineCc: 1800,
        purchasePriceCents: 1000000,
        year: 2020,
      },
      SEED_TAX,
      REF_YEAR,
    );
    assert.equal(result.customsDutyCents, 400000);
    assert.equal(result.surtaxCents, 350000);
    assert.equal(result.vatCents, 217000);
    assert.notEqual(result.vatCents, 271250);
  });

  it('double cabs are rated at 60% (ZIMRA)', () => {
    const result = calculateImportQuotation(
      {
        category: 'double_cab',
        engineCc: 2500,
        purchasePriceCents: 850000,
        year: 2007,
      },
      SEED_TAX,
      REF_YEAR,
    );
    assert.equal(result.customsDutyCents, 510000);
    assert.equal(result.surtaxCents, 0);
  });

  it('throws when the tax set has no duty rate for the vehicle category', () => {
    assert.throws(
      () =>
        calculateImportQuotation(
          { category: 'sedan_station_wagon', purchasePriceCents: 100000, year: 2022 },
          { ...SEED_TAX, dutyRates: { double_cab: 60 } },
          REF_YEAR,
        ),
      /no duty rate configured for vehicle category/,
    );
  });
});

describe('quotation charge accounting', () => {
  const vehicle = { category: 'sedan_station_wagon' as const, purchasePriceCents: 500000, yellowBookValueCents: 600000, year: 2022, engineCc: 1500 };
  it('taxes border costs while charging the actual invoice and separating local delivery and agency fees', () => {
    const result = calculateImportQuotation(vehicle, SEED_TAX, 2026, { freightCents: 100000, insuranceCents: 10000, borderFreightCents: 50000, portChargesCents: 20000, localDeliveryCents: 30000, agencyFeeCents: 25000 });
    assert.equal(result.valuationCents, 600000);
    assert.equal(result.cifValueCents, 780000);
    assert.equal(result.customsDutyCents, 312000);
    assert.equal(result.vatCents, 169260);
    assert.equal(result.taxTotalCents, 481860);
    assert.equal(result.totalDueCents, 1216860);
    assert.equal(result.purchasePriceCents, 500000);
  });
  it('local delivery and agency fees do not change the customs calculation', () => {
    const base = calculateImportQuotation(vehicle, SEED_TAX, 2026);
    const changed = calculateImportQuotation(vehicle, SEED_TAX, 2026, { localDeliveryCents: 10000, agencyFeeCents: 20000 });
    assert.equal(changed.taxTotalCents, base.taxTotalCents);
    assert.equal(changed.totalDueCents, base.totalDueCents + 30000);
  });
  it('rejects negative, fractional, nonnumeric, excessive and unknown charges', () => {
    for (const input of [{ freightCents: -1 }, { freightCents: 0.5 }, { freightCents: '100' }, { freightCents: Number.MAX_SAFE_INTEGER }, { typo: 1 }, [], null]) {
      assert.throws(() => normalizeCharges(input));
    }
  });
});

describe('resolveActiveTaxRate', () => {
  const companyOverride: TaxRateSet = {
    ...SEED_TAX,
    scope: 'company',
    companyId: 'c1',
    vatPct: 12,
    createdAt: '2024-06-01T00:00:00.000Z',
  };

  it('prefers company override over global set', () => {
    const resolved = resolveActiveTaxRate([SEED_TAX, companyOverride], 'c1', '2025-01-01');
    assert.equal(resolved.vatPct, 12);
  });

  it('falls back to global set for a company without override', () => {
    const resolved = resolveActiveTaxRate([SEED_TAX, companyOverride], 'c2', '2025-01-01');
    assert.equal(resolved.vatPct, 15.5);
  });

  it('filters out sets outside their effective window', () => {
    const expired: TaxRateSet = { ...SEED_TAX, effectiveTo: '2023-12-31' };
    assert.throws(() => resolveActiveTaxRate([expired], 'c1', '2025-01-01'), /no active tax rate set/);
  });

  it('rejects when no tax set is active', () => {
    assert.throws(() => resolveActiveTaxRate([], 'c1', '2025-01-01'), /no active tax rate set/);
  });

  it('picks the latest effectiveFrom among competing global sets', () => {
    const older: TaxRateSet = {
      ...SEED_TAX,
      effectiveFrom: '2023-01-01',
      vatPct: 15,
      createdAt: '2023-01-01T00:00:00.000Z',
    };
    const newer: TaxRateSet = {
      ...SEED_TAX,
      effectiveFrom: '2025-01-01',
      vatPct: 16,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const resolved = resolveActiveTaxRate([older, newer], 'c5', '2025-06-01');
    assert.equal(resolved.vatPct, 16);
  });
});
