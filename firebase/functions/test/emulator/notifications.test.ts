import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-vehicle-import';

const { db } = await import('../../src/db.ts');
const { enqueueNotification, dispatchOutbox, OUTBOX_COLLECTION, LOG_COLLECTION } =
  await import('../../src/notifications.ts');
const { createCase } = await import('../../src/cases.ts');

const companyId = 'notify-company';

async function seedCase(
  caseId: string,
  customerId: string,
  userId: string | null,
  caseNum: string,
): Promise<void> {
  await db.doc(`import_cases/${caseId}`).set({
    companyId,
    caseNum,
    customerId,
    currentStage: 'quotation',
  });
  await db.doc(`customers/${customerId}`).set({
    companyId,
    isActive: true,
    fullName: 'Notify Buyer',
    lastNameLower: 'buyer',
    phoneNumber: '+263771234567',
    ...(userId ? { userId } : {}),
  });
  if (userId) {
    await db.doc(`users/${userId}`).set({ isActive: true });
  }
}

before(async () => {
  await db.doc(`companies/${companyId}`).set({
    name: 'Notify Dealer',
    isActive: true,
    casePrefix: 'NC',
    contactWhatsapp: '+263771234567',
    subscription: { version: 1, planId: 'dealer', status: 'active', accessUntil: Date.now() + 86400000 },
  });
  await db.doc('users/notify-owner').set({ isActive: true });
  await db.doc('staff/notify-owner').set({ companyId, role: 'admin', isActive: true });
  await db.doc(`companies/${companyId}/stages/enquiry`).set({ enabled: true, position: 0, label: 'Enquiry' });
});

test('outbox intent dispatches an in-app notification plus a log record', async () => {
  await seedCase('notify-1', 'notify-cust-1', 'notify-user-1', 'NC-0001');
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-1',
      eventKey: 'status_update',
      data: { caseNum: 'NC-0001', stageLabel: 'Payment Confirmed' },
    });
  });
  await dispatchOutbox(outboxId);

  const notes = await db.collection('users/notify-user-1/notifications').get();
  assert.equal(notes.size, 1);
  const note = notes.docs[0].data()!;
  assert.equal(note.companyId, companyId);
  assert.equal(note.caseId, 'notify-1');
  assert.equal(note.type, 'status_update');
  assert.equal(note.title, 'Import status updated');
  assert.equal(note.body, 'Your import NC-0001 is now at: Payment Confirmed');
  assert.equal((note.payload as Record<string, unknown>).caseRef, 'NC-0001');
  assert.equal((note.payload as Record<string, unknown>).stage, 'quotation');
  assert.ok(note.createdAt);

  const logs = await db.collection(LOG_COLLECTION).where('outboxId', '==', outboxId).get();
  assert.equal(logs.size, 1);
  assert.equal(logs.docs[0].data()!.status, 'dispatched');

  const outbox = (await db.collection(OUTBOX_COLLECTION).doc(outboxId).get()).data()!;
  assert.equal(outbox.status, 'dispatched');
  assert.equal(outbox.attempts, 1);
  assert.equal(outbox.recipientUserId, 'notify-user-1');
});

test('dispatch is idempotent under repeated and concurrent invocation', async () => {
  await seedCase('notify-2', 'notify-cust-2', 'notify-user-2', 'NC-0002');
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-2',
      eventKey: 'payment_confirmed',
      data: { caseNum: 'NC-0002' },
    });
  });
  await Promise.all([dispatchOutbox(outboxId), dispatchOutbox(outboxId), dispatchOutbox(outboxId)]);
  assert.equal((await db.collection('users/notify-user-2/notifications').get()).size, 1);
  assert.equal((await db.collection(LOG_COLLECTION).where('outboxId', '==', outboxId).get()).size, 1);
  const outbox = (await db.collection(OUTBOX_COLLECTION).doc(outboxId).get()).data()!;
  assert.equal(outbox.status, 'dispatched');
});

test('a case with no linked user account is skipped, not delivered', async () => {
  await seedCase('notify-3', 'notify-cust-3', null, 'NC-0003');
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-3',
      eventKey: 'case_created',
      data: { caseNum: 'NC-0003', stageLabel: 'Enquiry' },
    });
  });
  await dispatchOutbox(outboxId);

  const outbox = (await db.collection(OUTBOX_COLLECTION).doc(outboxId).get()).data()!;
  assert.equal(outbox.status, 'skipped');
  assert.equal(outbox.recipientUserId, null);
  const logs = await db.collection(LOG_COLLECTION).where('outboxId', '==', outboxId).get();
  assert.equal(logs.size, 1);
  assert.equal(logs.docs[0].data()!.status, 'skipped');
});

test('an unknown event key fails without throwing out of the dispatcher', async () => {
  await seedCase('notify-4', 'notify-cust-4', 'notify-user-4', 'NC-0004');
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-4',
      eventKey: 'unknown_event',
      data: {},
    });
  });
  await dispatchOutbox(outboxId);

  const outbox = (await db.collection(OUTBOX_COLLECTION).doc(outboxId).get()).data()!;
  assert.equal(outbox.status, 'failed');
  const logs = await db.collection(LOG_COLLECTION).where('outboxId', '==', outboxId).get();
  assert.equal(logs.docs[0].data()!.status, 'failed');
  assert.equal((await db.collection('users/notify-user-4/notifications').get()).size, 0);
});

test('dispatch only ever targets the case owner, never another tenant', async () => {
  await seedCase('notify-5', 'notify-cust-5', 'notify-user-5', 'NC-0005');
  await db.doc('import_cases/notify-6').set({
    companyId: 'other-company',
    caseNum: 'OC-0006',
    customerId: 'notify-cust-6',
    currentStage: 'quotation',
  });
  await db.doc('customers/notify-cust-6').set({
    companyId: 'other-company',
    isActive: true,
    fullName: 'Other Buyer',
    lastNameLower: 'buyer',
    phoneNumber: '+263771234567',
    userId: 'notify-user-6',
  });
  await db.doc('users/notify-user-6').set({ isActive: true });

  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-5',
      eventKey: 'quotation_issued',
      data: { caseNum: 'NC-0005', totalDueCents: 123456 },
    });
  });
  await dispatchOutbox(outboxId);

  const mine = await db.collection('users/notify-user-5/notifications').get();
  assert.equal(mine.size, 1);
  assert.equal(mine.docs[0].data()!.body, 'Your quotation for NC-0005 is ready. Total due: $1234.56');
  assert.equal((await db.collection('users/notify-user-6/notifications').get()).size, 0);
});

test('createCase commits the case_created intent inside the case transaction', async () => {
  await db.doc('customers/notify-int-cust').set({
    companyId,
    isActive: true,
    fullName: 'Int Buyer',
    lastNameLower: 'buyer',
    phoneNumber: '+263771234567',
    userId: 'notify-int-user',
  });
  await db.doc('users/notify-int-user').set({ isActive: true });

  const result = await createCase.run({
    data: { customerId: 'notify-int-cust' },
    auth: { uid: 'notify-owner', token: { app_role: 'admin', company_id: companyId } },
  } as never);
  const caseId = (result as { caseId: string }).caseId;

  const outbox = await db.collection(OUTBOX_COLLECTION).where('caseId', '==', caseId).get();
  assert.equal(outbox.size, 1);
  assert.equal(outbox.docs[0].data()!.eventKey, 'case_created');

  await dispatchOutbox(outbox.docs[0].id);
  const notes = await db.collection('users/notify-int-user/notifications').where('caseId', '==', caseId).get();
  assert.equal(notes.size, 1);
  assert.equal(notes.docs[0].data()!.type, 'case_created');
});

test('a recipient who disabled in-app delivery is not written to', async () => {
  await seedCase('notify-7', 'notify-cust-7', 'notify-user-7', 'NC-0007');
  await db.doc('users/notify-user-7').set({
    isActive: true,
    notificationPrefs: { email: true, whatsapp: true, sms: true, marketing: false },
  });
  // in_app is not user-disableable, so opt out of the delivery channel that was requested.
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-7',
      eventKey: 'status_update',
      data: { caseNum: 'NC-0007', stageLabel: 'Shipped' },
      channels: ['log'],
    });
  });
  await dispatchOutbox(outboxId);
  assert.equal((await db.collection('users/notify-user-7/notifications').get()).size, 0);
  const outbox = (await db.collection(OUTBOX_COLLECTION).doc(outboxId).get()).data()!;
  assert.equal(outbox.status, 'skipped');
});

test('marketing events are suppressed unless the recipient opted in', async () => {
  await seedCase('notify-8', 'notify-cust-8', 'notify-user-8', 'NC-0008');
  await db.doc('users/notify-user-8').set({ isActive: true });
  let outboxId = '';
  await db.runTransaction(async (txn) => {
    outboxId = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-8',
      eventKey: 'marketing_offer',
      data: {},
      channels: ['in_app'],
    });
  });
  await dispatchOutbox(outboxId);
  assert.equal((await db.collection('users/notify-user-8/notifications').get()).size, 0);
  const log = (await db.collection(LOG_COLLECTION).where('outboxId', '==', outboxId).get()).docs[0].data()!;
  assert.deepEqual(log.channels, []);

  await db.doc('users/notify-user-8').set({ isActive: true, notificationPrefs: { marketing: true } });
  let optedIn = '';
  await db.runTransaction(async (txn) => {
    optedIn = enqueueNotification(txn, {
      companyId,
      caseId: 'notify-8',
      eventKey: 'marketing_offer',
      data: {},
      channels: ['in_app'],
    });
  });
  await dispatchOutbox(optedIn);
  const note = (await db.collection('users/notify-user-8/notifications').get()).docs[0].data()!;
  assert.equal(note.title, 'News from your agency');
});
