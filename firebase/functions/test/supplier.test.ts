import { it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSupplierDetails } from '../src/supplier.ts';

it('accepts public supplier listing and normalizes references', () => {
  const result = validateSupplierDetails({ supplierName: ' BE FORWARD ', stockReference: ' CE12345 ', purchaseReference: 'INV-123', listingUrl: 'https://www.beforward.jp/toyota/aqua/ce937168/id/16823011/' });
  assert.equal(result.supplierName, 'BE FORWARD');
  assert.equal(result.stockReference, 'CE12345');
});
it('rejects private access links, lookalike domains and unsafe protocols', () => {
  for (const listingUrl of ['http://www.beforward.jp/id/123/', 'https://beforward.jp.evil.com/id/123/', 'javascript:alert(1)', 'https://www.beforward.jp/id/123/?token=secret', 'https://user:secret@www.beforward.jp/id/123/', 'https://www.beforward.jp/cap/secret', 'https://www.beforward.jp/id/123/#private']) {
    assert.throws(() => validateSupplierDetails({ listingUrl }));
  }
  assert.throws(() => validateSupplierDetails({ purchaseReference: 'one\ntwo' }));
});
