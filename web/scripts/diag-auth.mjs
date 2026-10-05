import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAkOCgTGRpSyVGRIHf-HDJXDTa6nFFcync',
  authDomain: 'studio-285787437-bc95b.firebaseapp.com',
  projectId: 'studio-285787437-bc95b',
  storageBucket: 'studio-285787437-bc95b.firebasestorage.app',
  appId: '1:361047726956:web:18087147a9b516279eb149',
};

const email = process.env.DIAG_EMAIL ?? '';
const password = process.env.DIAG_PASS ?? '';

async function main() {
  if (!email) throw new Error('email required via DIAG_EMAIL');
  if (!password) throw new Error('password required via DIAG_PASS');

  const app = initializeApp(firebaseConfig, 'diag');
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, email, password);
  const token = await auth.currentUser.getIdToken();
  const url = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/searchCases`;
  const attempts = [
    ['bearer', { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }],
    ['x-auth', { 'Content-Type': 'application/json', 'x-auth': token }],
  ];

  for (const [label, headers] of attempts) {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { mode: 'caseNum', q: 'ZA' } }),
    });
    console.log('RES', label, response.status);
  }
}

main().catch((err) => {
  console.error('AUTH DIAGNOSTIC FAILED:', err?.code ?? 'unknown');
  process.exit(1);
});
