import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = 'https://us-central1-studio-285787437-bc95b.cloudfunctions.net';
const catalogueResponse = await fetch(`${base}/publicVehicleCatalogue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
assert.equal(catalogueResponse.status, 200);
const catalogue = await catalogueResponse.json();
assert.ok(Array.isArray(catalogue.result.stock));
for (const stock of catalogue.result.stock) {
  assert.ok(stock.specs && typeof stock.specs === 'object');
  for (const key of Object.keys(stock.specs)) assert.ok(['make', 'model', 'year', 'mileageKm', 'engineCc', 'fuel', 'transmission', 'bodyType'].includes(key));
}
const actionResponse = await fetch(`${base}/setCaseNextAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
const action = await actionResponse.json();
assert.equal(action.error.status, 'UNAUTHENTICATED');
await writeFile('release-evidence/engine-live-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), catalogueStatus: catalogueResponse.status, stockCount: catalogue.result.stock.length, publicSpecWhitelist: 'passed', nextActionAnonymousAccess: 'rejected', productionDataMutated: false }, null, 2));
console.log('Live catalogue and protected next-action checks passed. No production records changed.');
