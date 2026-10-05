import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyAkOCgTGRpSyVGRIHf-HDJXDTa6nFFcync',
  authDomain: 'studio-285787437-bc95b.firebaseapp.com',
  projectId: 'studio-285787437-bc95b',
  storageBucket: 'studio-285787437-bc95b.firebasestorage.app',
  appId: '1:361047726956:web:18087147a9b516279eb149',
};

const PLATFORM_EMAIL = 'platform.admin@vehicleimport.dev';
const PLATFORM_PASS = process.env.PLATFORM_PASS ?? '';
const LIMIT = Number(process.argv[2] ?? 500);

async function main() {
  if (!PLATFORM_PASS) throw new Error('platform password required via PLATFORM_PASS');
  if (!Number.isSafeInteger(LIMIT) || LIMIT < 1) throw new Error('limit must be a positive integer');

  const app = initializeApp(firebaseConfig, 'backfill');
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, PLATFORM_EMAIL, PLATFORM_PASS);
  const result = await httpsCallable(getFunctions(app), 'backfillVehicleCustomers')({ limit: LIMIT });
  console.log(JSON.stringify({
    limit: LIMIT,
    scanned: result.data?.scanned ?? null,
    linked: result.data?.linked ?? null,
    skipped: result.data?.skipped ?? null,
  }, null, 2));
  await signOut(auth);
}

main().catch((err) => {
  console.error('BACKFILL FAILED:', err?.code ?? 'unknown');
  process.exit(1);
});
