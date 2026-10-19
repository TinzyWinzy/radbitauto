import { transactionWriteCheck } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { ts } from './audits.ts';
import { consentCollection, consentRecord, NOTICE_VERSION } from './consent.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createCustomerRecord = onCall<{ fullName: string; phoneNumber: string; email?: string; contactConsent?: boolean; consentVersion?: string; idempotencyKey: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { fullName, phoneNumber, idempotencyKey } = request.data;
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 150 || typeof phoneNumber !== 'string' || !/^\+?[0-9 ()-]{7,20}$/.test(phoneNumber) || typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{10,100}$/.test(idempotencyKey)) {
    throw new HttpsError('invalid-argument', 'Provide a customer name, phone number and valid request identifier');
  }
  const email = typeof request.data.email === 'string' ? request.data.email.trim().toLowerCase() : '';
  if (email !== '' && (email.length > 254 || !EMAIL.test(email))) {
    throw new HttpsError('invalid-argument', 'Provide a valid customer email address');
  }
  const customerId = createHash('sha256').update(`${staff.companyId}|customer|${idempotencyKey}`).digest('hex');
  const name = fullName.trim();
  const phone = phoneNumber.trim();
  const contactConsent = request.data.contactConsent === true;
  const consentVersion = typeof request.data.consentVersion === 'string' && request.data.consentVersion.length > 0 && request.data.consentVersion.length <= 40 ? request.data.consentVersion : NOTICE_VERSION;
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const ref = db.collection('customers').doc(customerId);
    const existing = await txn.get(ref);
    if (existing.exists) {
      if (existing.data()?.fullName !== name || existing.data()?.phoneNumber !== phone || (existing.data()?.email ?? '') !== email) throw new HttpsError('already-exists', 'Request identifier belongs to another customer record');
      return;
    }
    txn.create(ref, { companyId: staff.companyId, fullName: name, lastNameLower: name.split(/\s+/).at(-1)!.toLowerCase(), phoneNumber: phone, ...(email ? { email } : {}), isActive: true, createdAt: ts() });
    if (contactConsent) {
      txn.set(consentCollection().doc(), consentRecord({ purpose: 'processing', version: consentVersion, granted: true, method: 'staff_capture', source: 'customer_intake', companyId: staff.companyId, customerId }));
    }
    txn.create(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'customers', entityId: customerId, action: 'create_record', detail: { email: email !== '', consent: contactConsent }, createdAt: ts() });
  });
  return { customerId };
});
