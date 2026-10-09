import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supplierLandedEstimate } from '../src/supplierEstimate.ts';
import type { TaxRateSet } from '../src/types.ts';
import type { SupplierVehicle } from '../src/beforwardParser.ts';

const TAX: TaxRateSet = {
  scope: 'all',
  effectiveFrom: '2024-01-01',
  vatPct: 15.5,
  surtaxThresholdYears: 5,
  surtaxPct: 35,
  dutyRates: { sedan_station_wagon: 40, pickup_up_to_800kg: 25, pickup_801_to_1400kg: 40, pickup_over_1400kg: 40, double_cab: 60 },
  carbonTaxBands: [
    { fromCc: 0, toCc: 1500, amountCents: 600 },
    { fromCc: 1501, toCc: 2000, amountCents: 1100 },
    { fromCc: 2001, toCc: 3000, amountCents: 1500 },
    { fromCc: 3001, toCc: undefined, amountCents: 3000 },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
};
const vehicle = (specs: SupplierVehicle['specs'], askingPriceCents = 425000): SupplierVehicle => ({
  id: 'CE123456', title: '2020 TOYOTA AQUA', listingUrl: 'https://www.beforward.jp/toyota/aqua/ce123456/id/1/',
  photos: [], location: 'YOKOHAMA', askingPriceCents, checkedAt: '2026-10-09T07:00:00.000Z', specs,
});

test('estimates a landed range from the quotation engine and flags the assumptions', () => {
  const estimate = supplierLandedEstimate(vehicle({ year: 2020, engineCc: 1500, make: 'TOYOTA' }), TAX, '2026-10-09');
  assert.ok(estimate);
  assert.ok(estimate.lowCents < estimate.highCents);
  assert.ok(estimate.dutyCents > 0 && estimate.vatCents > 0 && estimate.taxesCents > 0);
  assert.equal(estimate.dutyPct, 40);
  assert.equal(estimate.surtaxApplied, true, 'a 6 year old passenger car carries the surtax');
  assert.equal(estimate.vehicleAgeYears, 6);
  assert.equal(estimate.tooOld, false);
  assert.equal(estimate.ageAssumed, false);
  assert.equal(estimate.categoryAssumed, true);
  assert.equal(estimate.asAt, '2026-10-09');
});

test('assumes the surtax age rule when the model year is unknown and flags vehicles over the age window', () => {
  const unknownYear = supplierLandedEstimate(vehicle({ engineCc: 2000 }), TAX, '2026-10-09');
  assert.ok(unknownYear);
  assert.equal(unknownYear.ageAssumed, true);
  assert.equal(unknownYear.surtaxApplied, true, 'an unconfirmed age falls back to the conservative surtax assumption');
  const old = supplierLandedEstimate(vehicle({ year: 2010, engineCc: 2000 }), TAX, '2026-10-09');
  assert.ok(old);
  assert.equal(old.tooOld, true);
  assert.equal(old.vehicleAgeYears, 16);
});

test('ignores listings without a usable supplier price', () => {
  assert.equal(supplierLandedEstimate(vehicle({ year: 2020 }, 0), TAX, '2026-10-09'), null);
  assert.equal(supplierLandedEstimate(vehicle({ year: 2020 }, 42.5), TAX, '2026-10-09'), null);
});
