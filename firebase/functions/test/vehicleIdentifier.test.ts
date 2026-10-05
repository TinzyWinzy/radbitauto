import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicleIdentifier } from '../src/vehicleIdentifier.ts';

describe('vehicle identifiers', () => {
  it('accepts VINs and the Japanese frame numbers used in supplier listings', () => {
    assert.equal(normalizeVehicleIdentifier(' nhp10-6486305 '), 'NHP10-6486305');
    assert.equal(normalizeVehicleIdentifier('GE6-1221760'), 'GE6-1221760');
    assert.equal(normalizeVehicleIdentifier('jh faa11a000000001'.replace(' ', '')), 'JHFAA11A000000001');
  });
  it('rejects incomplete identifiers, slashes and forbidden VIN letters', () => {
    for (const value of ['SHORT', 'NHP10/1234567', 'NHP10-123', 'JHFAA11I000000001', '']) assert.throws(() => normalizeVehicleIdentifier(value));
  });
});
