import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';
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
const TENANT_ADMIN_PASS = process.env.TENANT_ADMIN_PASS ?? '';
const CUSTOMER_PASS = process.env.CUSTOMER_PASS ?? '';
const RUN_ID = Date.now().toString(36);

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) process.exitCode = 1;
}

const app = initializeApp(firebaseConfig, 'verify');
const auth = getAuth(app);
const functions = getFunctions(app);
const call = (name) => httpsCallable(functions, name);

async function claimsOf(user) {
  const result = await getIdTokenResult(user, true);
  return result.claims;
}

async function tryCall(name, payload, expectedCode) {
  try {
    return { ok: true, data: (await call(name)(payload)).data };
  } catch (err) {
    if (expectedCode && err.code === expectedCode) return { ok: true, already: true };
    throw err;
  }
}

async function main() {
  if (!PLATFORM_PASS) throw new Error('platform password required via PLATFORM_PASS');
  if (!CUSTOMER_PASS) throw new Error('customer password required via CUSTOMER_PASS');

  await signInWithEmailAndPassword(auth, PLATFORM_EMAIL, PLATFORM_PASS);
  let claims = await claimsOf(auth.currentUser);
  check('platform admin sign-in + claims', claims.app_role === 'platform_admin' && claims.platform_admin === true, `role=${claims.app_role ?? 'none'}`);

  const slug = 'zenith';
  const tenantAdminEmail = `admin@${slug}-imports.dev`;
  const bootstrap = await call('bootstrapCompany')({
    slug,
    name: 'Zenith Autos',
    casePrefix: 'ZA',
    contactWhatsapp: '+263771000000',
    adminEmail: tenantAdminEmail,
    adminFullName: 'Nomatter Muchechetere',
    defaultPort: 'Durban',
    currency: 'USD',
    paymentMethods: ['EcoCash', 'Bank'],
  });
  check('bootstrapCompany → tenant ready', !!bootstrap.data.companyId, `company=${bootstrap.data.companyId}${bootstrap.data.alreadyExisting ? ' (existing)' : ''}`);
  const tenantAdminPass = bootstrap.data.tempPassword ?? TENANT_ADMIN_PASS;
  if (!tenantAdminPass) throw new Error('tenant exists; TENANT_ADMIN_PASS is required');
  await signOut(auth);

  await signInWithEmailAndPassword(auth, tenantAdminEmail, tenantAdminPass);
  claims = await claimsOf(auth.currentUser);
  check('tenant admin sign-in + claims', claims.app_role === 'admin' && claims.company_id === bootstrap.data.companyId, `role=${claims.app_role ?? 'none'}`);

  const baseline = await call('ensureBaseline')({ companyId: bootstrap.data.companyId });
  check('ensureBaseline', baseline.data.stageDefinitions === 14, String(baseline.data.stageDefinitions));

  const staff = await tryCall('createStaff', { email: 'staff@zenith-imports.dev', fullName: 'Tapiwa Mhaka', role: 'staff' }, 'functions/already-exists');
  check('createStaff → account created', staff.ok && (!!staff.data?.staffUid || staff.already), `existing=${!!staff.already}`);

  const customerEmail = `blessing.moyo+${RUN_ID}@zenith-imports.dev`;
  await signOut(auth);
  await createUserWithEmailAndPassword(auth, customerEmail, CUSTOMER_PASS);
  const customerUid = auth.currentUser.uid;
  claims = await claimsOf(auth.currentUser);
  check('customer self-signup (claimless)', claims.app_role === undefined, `uid=${customerUid}`);
  await signOut(auth);

  await signInWithEmailAndPassword(auth, tenantAdminEmail, tenantAdminPass);
  const link = await call('linkCustomer')({ email: customerEmail, fullName: 'Blessing Moyo', phoneNumber: '+263771234567', whatsappRef: `SMOKE-${RUN_ID}` });
  check('linkCustomer resolves email → claims set', !!link.data.customerId, `customer=${link.data.customerId}`);

  const vinSuffix = RUN_ID.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, 'X').slice(-4).padStart(4, '0');
  const vehicle = await call('createVehicle')({
    vinChassis: `JN1CMAT51A000${vinSuffix}`,
    make: 'Toyota',
    model: 'Corolla',
    year: 2015,
    category: 'sedan_station_wagon',
    sourceCountry: 'Japan',
    purchasePriceCents: 380000,
    engineCc: 1600,
  });
  check('createVehicle', !!vehicle.data.vehicleId, vehicle.data.vehicleId);

  const importCase = await call('createCase')({ customerId: link.data.customerId, vehicleId: vehicle.data.vehicleId, statusNote: 'Smoke-test case' });
  check('createCase → ZA-prefixed number', String(importCase.data.caseNum).startsWith('ZA'), importCase.data.caseNum);
  const caseId = importCase.data.caseId;

  const quote = await call('issueQuotation')({ caseId });
  check('issueQuotation computes due', quote.data.totalDueCents > 0, `total=${quote.data.totalDueCents}`);
  check('issueQuotation records version 1', quote.data.version === 1, `v=${quote.data.version}`);

  const advance = await call('advanceImportStage')({ caseId, toStage: 'quotation', note: 'moved to quotation' });
  check('advance to quotation', advance.data.toStage === 'quotation', advance.data.toStage);

  const payment = await call('recordPayment')({
    caseId,
    amountCents: 100000,
    method: 'Bank',
    quotationId: quote.data.quotationId,
    idempotencyKey: `SMOKE-${RUN_ID}`,
    providerRef: `SMOKE-${RUN_ID}`,
  });
  const confirmation = await call('confirmPayment')({ paymentId: payment.data.paymentId });
  check('record + confirm payment', confirmation.data.status === 'confirmed', confirmation.data.status);

  const search = await call('searchCases')({ mode: 'caseNum', q: 'ZA' });
  check('searchCases finds case', (search.data.hits ?? []).some((hit) => hit.caseId === caseId), String(search.data.hits?.length));

  await signOut(auth);

  const raw = await fetch(`https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/searchCases`, { method: 'POST', body: '{}' });
  check('raw callable URL guarded (non-200)', raw.status >= 400 && raw.status < 500, `status=${raw.status}`);

  console.log('\n--- RESULT ---');
  console.log(JSON.stringify({
    companyId: bootstrap.data.companyId,
    customerId: link.data.customerId,
    vehicleId: vehicle.data.vehicleId,
    caseNum: importCase.data.caseNum,
    caseId,
  }, null, 2));
  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('SCRIPT ERROR:', err?.code ?? 'unknown');
  process.exit(1);
});
