import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ maxInstances: 10 });

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  // a prior initializer (e.g. the emulator test harness) already configured this instance
}
