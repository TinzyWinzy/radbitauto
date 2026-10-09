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
const vehicle = (specs: SupplierVehicle['specs'], askingPriceCents = 425000, title = '2020 TOYOTA AQUA'): SupplierVehicle => ({
  id: 'CE123456', title, listingUrl: 'https://www.beforward.jp/toyota/aqua/ce123456/id/1/',
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
  assert.equal(estimate.body, undefined);
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

test('taxes a double cab from the listing title at 60% without waiting for the detail page', () => {
  const estimate = supplierLandedEstimate(vehicle({ year: 2021, engineCc: 2400, make: 'TOYOTA' }, 1200000, '2021 TOYOTA HILUX 2.4 D-4D DOUBLE CAB'), TAX, '2026-10-09');
  assert.ok(estimate);
  assert.equal(estimate.category, 'double_cab');
  assert.equal(estimate.dutyPct, 60);
  assert.equal(estimate.categoryAssumed, false);
});

test('a stated pickup body refines the detail estimate and an unconfirmed cab assumes the higher band', () => {
  const pickup: SupplierVehicle = vehicle({ year: 2019, engineCc: 2500, make: 'TOYOTA' }, 900000, '2019 TOYOTA HILUX 2.5 D-4D');
  const unknownCab = supplierLandedEstimate(pickup, TAX, '2026-10-09', { body: 'Pick up', doors: 2 });
  assert.ok(unknownCab);
  assert.equal(unknownCab.category, 'double_cab');
  assert.equal(unknownCab.dutyPct, 60);
  assert.equal(unknownCab.categoryAssumed, true, 'the buyer is told the cab style was assumed');
  assert.equal(unknownCab.body, 'Pick up');
  const fourDoors = supplierLandedEstimate(pickup, TAX, '2026-10-09', { body: 'Pick up', doors: 4 });
  assert.ok(fourDoors);
  assert.equal(fourDoors.category, 'double_cab');
  assert.equal(fourDoors.categoryAssumed, false, 'four doors on a stated pickup confirm a double cab');
  const single = supplierLandedEstimate(vehicle({ year: 2019, engineCc: 2500 }, 900000, '2019 TOYOTA HILUX 2.5 SINGLE CAB'), TAX, '2026-10-09', { body: 'Pick up', doors: 2 });
  assert.ok(single);
  assert.equal(single.category, 'pickup_over_1400kg');
  assert.equal(single.dutyPct, 40);
  assert.equal(single.categoryAssumed, true, 'payload is still unconfirmed');
});

test('a stated passenger body is no longer assumed and unsupported bodies stay disclosed', () => {
  const hatch = supplierLandedEstimate(vehicle({ year: 2020, engineCc: 1500 }), TAX, '2026-10-09', { body: 'Hatchback' });
  assert.ok(hatch);
  assert.equal(hatch.category, 'sedan_station_wagon');
  assert.equal(hatch.categoryAssumed, false);
  assert.equal(hatch.body, 'Hatchback');
  const truck = supplierLandedEstimate(vehicle({ year: 2020, engineCc: 4000 }, 900000, '2020 ISUZU NQR TRUCK'), TAX, '2026-10-09', { body: 'Truck' });
  assert.ok(truck);
  assert.equal(truck.category, 'sedan_station_wagon');
  assert.equal(truck.categoryAssumed, true, 'no duty rate is configured for trucks');
});

test('falls back to passenger rates when a custom tax set lacks the category, instead of failing', () => {
  const custom: TaxRateSet = { ...TAX, dutyRates: { sedan_station_wagon: 40 } };
  const estimate = supplierLandedEstimate(vehicle({ year: 2021, engineCc: 2400 }, 1200000, '2021 TOYOTA HILUX 2.4 D-4D DOUBLE CAB'), custom, '2026-10-09');
  assert.ok(estimate);
  assert.equal(estimate.category, 'sedan_station_wagon');
  assert.equal(estimate.dutyPct, 40);
  assert.equal(estimate.categoryAssumed, true);
  const empty: TaxRateSet = { ...TAX, dutyRates: {} };
  assert.equal(supplierLandedEstimate(vehicle({ year: 2021, engineCc: 2400 }), empty, '2026-10-09'), null, 'no active categories hides the estimate instead of throwing');
});

test('planning charges are ranges on both sides of the total', () => {
  const estimate = supplierLandedEstimate(vehicle({ year: 2020, engineCc: 1500 }), TAX, '2026-10-09');
  assert.ok(estimate);
  assert.equal(estimate.deliveryCents.length, 2);
  assert.ok(estimate.agencyFeeCents[0] > 0 && estimate.agencyFeeCents[1] > estimate.agencyFeeCents[0]);
  assert.ok(estimate.outsideCents[1] > estimate.outsideCents[0]);
  assert.equal(estimate.lowCents < estimate.highCents, true);
});

test('ignores listings without a usable supplier price', () => {
  assert.equal(supplierLandedEstimate(vehicle({ year: 2020 }, 0), TAX, '2026-10-09'), null);
  assert.equal(supplierLandedEstimate(vehicle({ year: 2020 }, 42.5), TAX, '2026-10-09'), null);
});
