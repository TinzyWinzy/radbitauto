import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.GCLOUD_PROJECT !== 'demo-vehicle-import' || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Synthetic recovery is restricted to the demo emulator');
initializeApp({ projectId: 'demo-vehicle-import' });
const db = getFirestore();
const ref = db.doc('recovery_checks/synthetic');
if (process.argv[2] === 'seed') {
  await ref.set({ companyId: 'synthetic-recovery', amountCents: 12345, marker: 'restore-rehearsal-only' });
  console.log('Synthetic recovery fixture saved');
} else {
  assert.deepEqual((await ref.get()).data(), { companyId: 'synthetic-recovery', amountCents: 12345, marker: 'restore-rehearsal-only' });
  console.log('PASS: synthetic export imported with tenant and cents preserved');
}
await db.terminate();
