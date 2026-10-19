import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireActiveUser, requireAdmin } from './claims.ts';
import { ts } from './audits.ts';
import { CONSENT_COLLECTION } from './consent.ts';

export const DATA_REQUEST_COLLECTION = 'data_requests';

function iso(value: unknown): unknown {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return new Date((value as { toMillis: () => number }).toMillis()).toISOString();
  }
  if (Array.isArray(value)) return value.map(iso);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, iso(entry)]));
  }
  return value;
}

function rows(snap: FirebaseFirestore.QuerySnapshot): Record<string, unknown>[] {
  return snap.docs.map((document) => ({ id: document.id, ...(iso(document.data()) as Record<string, unknown>) }));
}

/**
 * Data-subject access request (CDPA s.21). Returns the caller's own personal data
 * across the platform, including records held for tenant agencies where the caller
 * is the data subject. Never returns another person's records.
 */
export const exportMyData = onCall(async (request) => {
  const ctx = contextFrom(request);
  const profile = await requireActiveUser(ctx.uid);

  const customerLinks = await db.collection('customers').where('userId', '==', ctx.uid).get();
  const customerIds = customerLinks.docs.map((document) => document.id);

  const caseDocs = customerIds.length
    ? await db.collection('import_cases').where('customerId', 'in', customerIds.slice(0, 30)).get()
    : null;
  const caseIds = caseDocs?.docs.map((document) => document.id) ?? [];

  const [notifications, consents, enquiries, quotations, payments] = await Promise.all([
    db.collection('users').doc(ctx.uid).collection('notifications').get(),
    db.collection(CONSENT_COLLECTION).where('subjectUserId', '==', ctx.uid).get(),
    customerIds.length ? db.collection('enquiries').where('customerId', 'in', customerIds.slice(0, 30)).get() : null,
    caseIds.length ? db.collection('quotations').where('caseId', 'in', caseIds.slice(0, 30)).get() : null,
    caseIds.length ? db.collection('payments').where('caseId', 'in', caseIds.slice(0, 30)).get() : null,
  ]);

  const exportPayload = {
    generatedAt: new Date().toISOString(),
    subjectUserId: ctx.uid,
    account: iso({ ...profile, id: ctx.uid }),
    customerRecords: rows(customerLinks),
    importCases: caseDocs ? rows(caseDocs) : [],
    quotations: quotations ? rows(quotations) : [],
    payments: payments ? rows(payments) : [],
    enquiries: enquiries ? rows(enquiries) : [],
    notifications: rows(notifications),
    consents: rows(consents),
  };

  await db.collection('audit_log').add({
    actorId: ctx.uid,
    entityType: 'users',
    entityId: ctx.uid,
    action: 'dsar_export',
    detail: { customerRecords: customerLinks.size, cases: caseIds.length },
    createdAt: ts(),
  });

  return exportPayload;
});

/**
 * Erasure request (CDPA s.22). Records the request and routes it to the controller:
 * the tenant agency for agency-held records, or the platform for the account itself.
 * Records are not destroyed here because the controller must assess legal retention
 * duties (tax, customs and financial records) before deleting anything.
 */
export const requestErasure = onCall<{ note?: string }>(async (request) => {
  const ctx = contextFrom(request);
  await requireActiveUser(ctx.uid);
  const note = typeof request.data?.note === 'string' ? request.data.note.trim().slice(0, 500) : '';
  const customerLinks = await db.collection('customers').where('userId', '==', ctx.uid).get();
  const companyIds = [...new Set(customerLinks.docs.map((document) => document.data()?.companyId).filter((value): value is string => typeof value === 'string'))];

  const ref = await db.collection(DATA_REQUEST_COLLECTION).add({
    type: 'erasure',
    subjectUserId: ctx.uid,
    companyIds,
    customerIds: customerLinks.docs.map((document) => document.id),
    status: 'pending',
    ...(note ? { note } : {}),
    createdAt: ts(),
  });

  await db.collection('audit_log').add({
    actorId: ctx.uid,
    entityType: 'data_requests',
    entityId: ref.id,
    action: 'erasure_requested',
    detail: { agencies: companyIds.length },
    createdAt: ts(),
  });

  return { requestId: ref.id, agencies: companyIds.length, status: 'pending' as const };
});

/** Agency-side queue of erasure requests for its own tenant. Admin only. */
export const listErasureRequests = onCall(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx, true);
  const snap = await db.collection(DATA_REQUEST_COLLECTION).where('companyIds', 'array-contains', staff.companyId).limit(100).get();
  return {
    requests: snap.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        status: data.status as string,
        note: (data.note as string | undefined) ?? '',
        createdAt: (data.createdAt as { toMillis: () => number }).toMillis(),
      };
    }),
  };
});

/** Marks a tenant's erasure request as fulfilled or rejected after assessment. */
export const resolveErasureRequest = onCall<{ requestId: string; decision: 'fulfilled' | 'rejected'; reason?: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx);
  const requestId = request.data.requestId;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request');
  const decision = request.data.decision;
  if (decision !== 'fulfilled' && decision !== 'rejected') throw new HttpsError('invalid-argument', 'Choose fulfilled or rejected');
  const ref = db.collection(DATA_REQUEST_COLLECTION).doc(requestId);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const data = snap.data();
    if (!snap.exists || !Array.isArray(data?.companyIds) || !data!.companyIds.includes(staff.companyId)) {
      throw new HttpsError('permission-denied', 'Request unavailable');
    }
    if (data!.status !== 'pending') throw new HttpsError('failed-precondition', 'Request already resolved');
    txn.update(ref, { status: decision, resolvedBy: ctx.uid, resolvedAt: ts(), ...(request.data.reason ? { reason: request.data.reason.slice(0, 300) } : {}) });
    txn.create(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'data_requests',
      entityId: requestId,
      action: `erasure_${decision}`,
      detail: {},
      createdAt: ts(),
    });
  });
  return { requestId, status: decision };
});
