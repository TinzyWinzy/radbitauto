// E2E seed: run inside `firebase emulators:exec` so admin SDK targets emulators.
// Usage: node e2e/seed.mjs   (from firebase/functions, after `npm run build`)
// Fixture emails/passwords are duplicated in web/e2e/accounts.ts — keep in sync.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT;
if (PROJECT_ID !== 'demo-vehicle-import') {
  throw new Error('E2E seed must run with GCLOUD_PROJECT=demo-vehicle-import');
}
const COMPANY_ID = 'e2e-tenant';
const PASS = 'password123';

const STAGE_KEYS = [
  'enquiry', 'quotation', 'payment_confirmed', 'vehicle_sourced',
  'purchase_completed', 'export_processing', 'shipped', 'in_transit',
  'arrived', 'customs_clearance', 'duties_charges',
  'registration_compliance', 'ready_for_collection', 'delivered',
];

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

async function upsertUser(email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: PASS, displayName, disabled: false });
    return existing.uid;
  } catch {
    const rec = await auth.createUser({ email, password: PASS, displayName });
    return rec.uid;
  }
}

async function main() {
  // This seed is guarded to the demo project above. Remove rate fixtures left
  // by security tests so browser calculations always use this complete set.
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('E2E seed requires the Firestore emulator');
  const priorRates = await db.collection('config').doc('tax_rates').collection('sets').get();
  await Promise.all(priorRates.docs.map((document) => document.ref.delete()));
  // Company + settings + stages + tax set
  await db.collection('companies').doc(COMPANY_ID).set({
    slug: 'e2e',
    name: 'E2E Motors',
    casePrefix: 'E2',
    contactWhatsapp: '+263770000000',
    primaryColor: '#1d4ed8',
    secondaryColor: null,
    defaultPort: 'Durban',
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('company_settings').doc(COMPANY_ID).set({
    currency: 'USD',
    paymentMethods: ['EcoCash', 'InnBucks', 'Bank'],
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const [i, key] of STAGE_KEYS.entries()) {
    await db.collection('companies').doc(COMPANY_ID).collection('stages').doc(key).set({
      position: i + 1,
      enabled: true,
    });
  }
  const taxSnap = await db
    .collection('config').doc('tax_rates').collection('sets')
    .where('scope', '==', 'all').limit(1).get();
  if (taxSnap.empty) {
    await db.collection('config').doc('tax_rates').collection('sets').add({
      scope: 'all',
      effectiveFrom: '2024-01-01',
      vatPct: 15.5,
      surtaxThresholdYears: 5,
      surtaxPct: 35,
      dutyRates: {
        sedan_station_wagon: 40,
        pickup_up_to_800kg: 25,
        pickup_801_to_1400kg: 40,
        pickup_over_1400kg: 40,
        double_cab: 60,
      },
      carbonTaxBands: [],
      createdAt: new Date().toISOString(),
    });
  }

  // Users
  const platformUid = await upsertUser('platform@test.dev', 'Platform Admin');
  const adminUid = await upsertUser('admin@e2e.dev', 'Agency Admin');
  const staffUid = await upsertUser('staff@e2e.dev', 'Staff Member');
  const customerUid = await upsertUser('customer@e2e.dev', 'Test Customer');

  for (const [uid, email, name] of [
    [platformUid, 'platform@test.dev', 'Platform Admin'],
    [adminUid, 'admin@e2e.dev', 'Agency Admin'],
    [staffUid, 'staff@e2e.dev', 'Staff Member'],
    [customerUid, 'customer@e2e.dev', 'Test Customer'],
  ]) {
    await db.collection('users').doc(uid).set({
      email, fullName: name, phoneNumber: null, isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await db.collection('platform_admins').doc(platformUid).set({
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await auth.setCustomUserClaims(platformUid, { app_role: 'platform_admin', platform_admin: true });
  await auth.setCustomUserClaims(adminUid, { app_role: 'admin', company_id: COMPANY_ID });
  await auth.setCustomUserClaims(staffUid, { app_role: 'staff', company_id: COMPANY_ID });

  await db.collection('staff').doc(adminUid).set({
    companyId: COMPANY_ID, role: 'admin', isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('staff').doc(staffUid).set({
    companyId: COMPANY_ID, role: 'staff', isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  const customerRef = await db.collection('customers').add({
    companyId: COMPANY_ID,
    userId: customerUid,
    fullName: 'Test Customer',
    lastNameLower: 'customer',
    phoneNumber: '+263771234567',
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await auth.setCustomUserClaims(customerUid, {
    app_role: 'customer', company_id: COMPANY_ID, customer_id: customerRef.id,
  });

  // Vehicle + case + quotation for read flows
  const vehicleRef = await db.collection('vehicles').add({
    companyId: COMPANY_ID,
    customerIds: [customerRef.id],
    vinChassisUpper: 'E2E00000000000001',
    make: 'Toyota',
    model: 'Hilux',
    year: 2019,
    sourceCountry: 'South Africa',
    category: 'double_cab',
    purchasePriceCents: 1500000,
    eaaStatus: 'none',
    isCommercial: false,
    exemptionFlag: 'none',
    importLicenceRequired: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  const caseRef = await db.collection('import_cases').add({
    caseNum: 'E20001',
    companyId: COMPANY_ID,
    customerId: customerRef.id,
    vehicleId: vehicleRef.id,
    currentStage: 'in_transit',
    balanceDueCents: 100000,
    quotationVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // The seeded E20001 consumes sequence 1 just like a real createCase call.
  // Keep subsequent journey-created enquiries from reusing its case number.
  await db.collection('companies').doc(COMPANY_ID).collection('meta').doc('counter').set({lastSeq:1});
  const quotationRef = await db.collection('quotations').add({
    companyId: COMPANY_ID,
    caseId: caseRef.id,
    version: 1,
    valuationBasis: 'invoice',
    cifValueCents: 1600000,
    customsDutyCents: 960000,
    surtaxCents: 0,
    vatCents: 396800,
    carbonTaxCents: 3000,
    totalDueCents: 500000,
    totalPaidCents: 400000,
    status: 'issued',
    createdAt: FieldValue.serverTimestamp(),
  });
  await caseRef.update({ currentQuotationId: quotationRef.id });

  console.log(JSON.stringify({
    companyId: COMPANY_ID, caseId: caseRef.id, customerId: customerRef.id,
    users: { platformUid, adminUid, staffUid, customerUid },
  }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
