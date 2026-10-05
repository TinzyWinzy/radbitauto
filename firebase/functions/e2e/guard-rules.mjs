// Deploy interlock: aborts `firebase deploy` if the emulator-only open
// rules file is currently swapped in as firestore.rules.
// Wired into firebase.json functions.predeploy (runs before every deploy).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulesPath = resolve(root, 'firestore.rules');
const e2ePath = resolve(root, 'firestore.e2e.rules');

if (!existsSync(rulesPath)) {
  console.error('guard-rules: firestore.rules not found at', rulesPath);
  process.exit(1);
}
const active = readFileSync(rulesPath, 'utf8');
if (active.includes('E2E-OPEN-RULES')) {
  console.error(
    'guard-rules: REFUSING TO DEPLOY — firestore.rules currently contains the emulator-only open rules.\n' +
      'Restore production rules first (finish or kill the e2e run, which restores automatically).',
  );
  process.exit(1);
}
if (!existsSync(e2ePath)) {
  console.error('guard-rules: firestore.e2e.rules missing at', e2ePath);
  process.exit(1);
}
console.log('guard-rules: production firestore.rules active — deploy allowed.');
