import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-vehicle-import';

const { db } = await import('../../src/db.ts');
const { exportMyData, requestErasure, listErasureRequests, resolveErasureRequest, DATA_REQUEST_COLLECTION } =
  await import('../../src/dataRights.ts');

const companyId = 'rights-company';
const otherCompanyId = 'rights-other';

interface CallableRequest {
  data: Record<string, unknown>;
  auth?: { uid: string; token: Record<string, string | boolean> };
}
type CallableFn = { run: (request: CallableRequest) => Promise<Record<string, unknown>> };

const asExport = exportMyData as unknown as CallableFn;
const asErase = requestErasure as unknown as CallableFn;
const asList = listErasureRequests as unknown as CallableFn;
const asResolve = resolveErasureRequest as unknown as CallableFn;

function call(fn: CallableFn, uid: string, token: Record<string, string | boolean> = {}) {
  return (data: Record<string, unknown> = {}) => fn.run({ data, auth: { uid, token } });
}

before(async () => {
  for (const id of [companyId, otherCompanyId]) {
    await db.doc(`companies/${id}`).set({
      name: id,
      isActive: true,
      casePrefix: 'DR',
      contactWhatsapp: '+263771234567',
      subscription: { version: 1, planId: 'dealer', status: 'active', accessUntil: Date.now() + 86400000 },
    });
  }
  await db.doc('users/rights-owner').set({ isActive: true });
  await db.doc('staff/rights-owner').set({ companyId, role: 'admin', isActive: true });

  await db.doc('users/rights-subject').set({ isActive: true, email: 'subject@example.com', fullName: 'Data Subject' });
  await db.doc('customers/rights-cust').set({
    companyId,
    userId: 'rights-subject',
    fullName: 'Data Subject',
    lastNameLower: 'subject',
    phoneNumber: '+263771234567',
    isActive: true,
  });
  await db.doc('import_cases/rights-case').set({
    companyId,
    caseNum: 'DR-0001',
    customerId: 'rights-cust',
    currentStage: 'quotation',
  });
  await db.doc('quotations/rights-quote').set({ companyId, caseId: 'rights-case', totalDueCents: 1000 });
  await db.doc('payments/rights-payment').set({ companyId, caseId: 'rights-case', amountCents: 500 });

  await db.doc('customers/other-cust').set({
    companyId: otherCompanyId,
    userId: 'other-subject',
    fullName: 'Other Subject',
    lastNameLower: 'subject',
    phoneNumber: '+263771234567',
    isActive: true,
  });
  await db.doc('users/other-subject').set({ isActive: true });
  await db.doc('import_cases/other-case').set({
    companyId: otherCompanyId,
    caseNum: 'OT-0001',
    customerId: 'other-cust',
    currentStage: 'enquiry',
  });
});

test('exportMyData returns only the caller’s own records', async () => {
  const payload = (await call(asExport, 'rights-subject')()) as Record<string, unknown>;
  assert.equal(payload.subjectUserId, 'rights-subject');
  assert.equal((payload.customerRecords as unknown[]).length, 1);
  assert.equal((payload.importCases as unknown[]).length, 1);
  assert.equal((payload.quotations as unknown[]).length, 1);
  assert.equal((payload.payments as unknown[]).length, 1);

  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('other-case'));
  assert.ok(!serialized.includes('Other Subject'));
});

test('exportMyData rejects unauthenticated and inactive callers', async () => {
  await assert.rejects(asExport.run({ data: {} } as CallableRequest), { code: 'unauthenticated' });
  await db.doc('users/rights-inactive').set({ isActive: false });
  await assert.rejects(call(asExport, 'rights-inactive')(), { code: 'permission-denied' });
});

test('requestErasure records one request naming every agency that holds the subject', async () => {
  const result = await call(asErase, 'rights-subject')({ note: 'Please remove my details' });
  const requestId = result.requestId as string;
  assert.equal(result.status, 'pending');
  assert.equal(result.agencies, 1);

  const doc = (await db.collection(DATA_REQUEST_COLLECTION).doc(requestId).get()).data()!;
  assert.equal(doc.type, 'erasure');
  assert.equal(doc.subjectUserId, 'rights-subject');
  assert.deepEqual(doc.companyIds, [companyId]);
  assert.deepEqual(doc.customerIds, ['rights-cust']);
});

test('an agency only sees and resolves its own erasure requests', async () => {
  const created = await call(asErase, 'rights-subject')();
  const requestId = created.requestId as string;

  const mine = await call(asList, 'rights-owner', { app_role: 'admin', company_id: companyId })();
  assert.ok((mine.requests as { id: string }[]).some((row) => row.id === requestId));

  await db.doc('users/other-owner').set({ isActive: true });
  await db.doc('staff/other-owner').set({ companyId: otherCompanyId, role: 'admin', isActive: true });
  const theirs = await call(asList, 'other-owner', { app_role: 'admin', company_id: otherCompanyId })();
  assert.equal((theirs.requests as { id: string }[]).some((row) => row.id === requestId), false);

  await assert.rejects(
    call(asResolve, 'other-owner', { app_role: 'admin', company_id: otherCompanyId })({ requestId, decision: 'fulfilled' }),
    { code: 'permission-denied' },
  );

  await call(asResolve, 'rights-owner', { app_role: 'admin', company_id: companyId })({ requestId, decision: 'rejected', reason: 'Tax records must be retained' });
  const resolved = (await db.collection(DATA_REQUEST_COLLECTION).doc(requestId).get()).data()!;
  assert.equal(resolved.status, 'rejected');
  assert.equal(resolved.reason, 'Tax records must be retained');

  await assert.rejects(
    call(asResolve, 'rights-owner', { app_role: 'admin', company_id: companyId })({ requestId, decision: 'fulfilled' }),
    { code: 'failed-precondition' },
  );
});

test('staff cannot resolve erasure requests and invalid decisions are rejected', async () => {
  const created = await call(asErase, 'rights-subject')();
  await db.doc('users/rights-staff').set({ isActive: true });
  await db.doc('staff/rights-staff').set({ companyId, role: 'staff', isActive: true });
  await assert.rejects(
    call(asResolve, 'rights-staff', { app_role: 'staff', company_id: companyId })({ requestId: created.requestId, decision: 'fulfilled' }),
    { code: 'permission-denied' },
  );
  await assert.rejects(
    call(asResolve, 'rights-owner', { app_role: 'admin', company_id: companyId })({ requestId: created.requestId, decision: 'maybe' }),
    { code: 'invalid-argument' },
  );
});
