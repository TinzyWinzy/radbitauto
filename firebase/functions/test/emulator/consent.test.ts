import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-vehicle-import';

const { db } = await import('../../src/db.ts');
const { recordConsent, CONSENT_COLLECTION } = await import('../../src/consent.ts');
const { createCustomerRecord } = await import('../../src/customers.ts');

const companyId = 'consent-company';

interface CallableRequest {
  data: Record<string, unknown>;
  auth?: { uid: string; token: Record<string, string | boolean> };
}
type CallableFn = { run: (request: CallableRequest) => Promise<Record<string, unknown>> };

const asConsent = recordConsent as unknown as CallableFn;
const asCustomer = createCustomerRecord as unknown as CallableFn;

function call(fn: CallableFn, uid: string, token: Record<string, string | boolean> = {}) {
  return (data: Record<string, unknown>) => fn.run({ data, auth: { uid, token } });
}

before(async () => {
  await db.doc(`companies/${companyId}`).set({
    name: 'Consent Dealer',
    isActive: true,
    casePrefix: 'CC',
    contactWhatsapp: '+263771234567',
    subscription: { version: 1, planId: 'dealer', status: 'active', accessUntil: Date.now() + 86400000 },
  });
  await db.doc('users/consent-owner').set({ isActive: true });
  await db.doc('staff/consent-owner').set({ companyId, role: 'admin', isActive: true });
});

beforeEach(async () => {
  const existing = await db.collection(CONSENT_COLLECTION).get();
  for (const doc of existing.docs) await doc.ref.delete();
});

test('recordConsent appends immutable records and caches the accepted version', async () => {
  await db.doc('users/consent-user').set({ isActive: true });
  const result = await call(asConsent, 'consent-user')({ source: 'signup' });
  assert.equal(result.recorded, 2);
  assert.equal(typeof result.version, 'string');

  const records = await db.collection(CONSENT_COLLECTION).where('subjectUserId', '==', 'consent-user').get();
  assert.equal(records.size, 2);
  const purposes = records.docs.map((d) => d.data().purpose).sort();
  assert.deepEqual(purposes, ['privacy', 'terms']);
  assert.ok(records.docs.every((d) => d.data().granted === true && d.data().method === 'signup_checkbox'));

  const profile = (await db.doc('users/consent-user').get()).data()!;
  assert.equal(profile.consent.termsVersion, result.version);
  assert.equal(profile.consent.privacyVersion, result.version);
  assert.equal(profile.isActive, true);
});

test('recordConsent never creates a partial profile before account setup', async () => {
  await call(asConsent, 'consent-ghost')({});
  const profile = await db.doc('users/consent-ghost').get();
  assert.equal(profile.exists, false);
  assert.equal((await db.collection(CONSENT_COLLECTION).where('subjectUserId', '==', 'consent-ghost').get()).size, 2);
});

test('recordConsent rejects unauthenticated callers and unknown purposes', async () => {
  await assert.rejects(asConsent.run({ data: {} } as CallableRequest), { code: 'unauthenticated' });
  await assert.rejects(call(asConsent, 'consent-user')({ purposes: ['marketing'] }), { code: 'invalid-argument' });
  await assert.rejects(call(asConsent, 'consent-user')({ purposes: [] }), { code: 'invalid-argument' });
});

test('createCustomerRecord stores an email and records intake consent when attested', async () => {
  const result = await call(asCustomer, 'consent-owner', { app_role: 'admin', company_id: companyId })({
    fullName: 'Blessing Chiwa',
    phoneNumber: '+263771234567',
    email: 'Blessing@Example.com',
    contactConsent: true,
    idempotencyKey: 'consent-intake-0001',
  });
  const customerId = result.customerId as string;
  const customer = (await db.doc(`customers/${customerId}`).get()).data()!;
  assert.equal(customer.email, 'blessing@example.com');

  const consents = await db.collection(CONSENT_COLLECTION).where('customerId', '==', customerId).get();
  assert.equal(consents.size, 1);
  assert.equal(consents.docs[0].data().purpose, 'processing');
  assert.equal(consents.docs[0].data().method, 'staff_capture');
  assert.equal(consents.docs[0].data().companyId, companyId);

  const repeat = await call(asCustomer, 'consent-owner', { app_role: 'admin', company_id: companyId })({
    fullName: 'Blessing Chiwa',
    phoneNumber: '+263771234567',
    email: 'blessing@example.com',
    contactConsent: true,
    idempotencyKey: 'consent-intake-0001',
  });
  assert.equal(repeat.customerId, customerId);
  assert.equal((await db.collection(CONSENT_COLLECTION).where('customerId', '==', customerId).get()).size, 1);
});

test('createCustomerRecord rejects a malformed email', async () => {
  await assert.rejects(
    call(asCustomer, 'consent-owner', { app_role: 'admin', company_id: companyId })({
      fullName: 'Bad Email',
      phoneNumber: '+263771234567',
      email: 'not-an-email',
      idempotencyKey: 'consent-intake-0002',
    }),
    { code: 'invalid-argument' },
  );
});
