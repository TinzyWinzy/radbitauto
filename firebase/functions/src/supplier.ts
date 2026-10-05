import { transactionWriteCheck } from './subscriptions.ts';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { ts } from './audits.ts';

export function validateSupplierDetails(data: Record<string, unknown>) {
  const text = (key: string, max: number) => {
    const value = data[key] ?? '';
    if (typeof value !== 'string' || value.length > max || /[\r\n]/.test(value)) throw new Error(`Invalid ${key}`);
    return value.trim();
  };
  const listingUrl = text('listingUrl', 1000);
  if (listingUrl) {
    const url = new URL(listingUrl);
    if (url.protocol !== 'https:' || !['beforward.jp', 'www.beforward.jp'].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !/\/id\/\d+\/?$/.test(url.pathname)) {
      throw new Error('Use a public HTTPS BE FORWARD vehicle listing, without query parameters');
    }
  }
  return { supplierName: text('supplierName', 100), stockReference: text('stockReference', 100), purchaseReference: text('purchaseReference', 100), listingUrl };
}

export const saveCaseSupplier = onCall<{ caseId: string; supplierName?: string; stockReference?: string; purchaseReference?: string; listingUrl?: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId } = request.data;
  if (typeof caseId !== 'string' || !caseId || caseId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid case');
  let details;
  try { details = validateSupplierDetails(request.data); }
  catch (error) { throw new HttpsError('invalid-argument', (error as Error).message); }
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const caseRef = db.collection('import_cases').doc(caseId);
    const record = await txn.get(caseRef);
    if (!record.exists || record.data()?.companyId !== staff.companyId) throw new HttpsError('permission-denied', 'Case does not belong to your agency');
    txn.set(caseRef.collection('supplier').doc('details'), { ...details, companyId: staff.companyId, updatedAt: ts() });
    txn.create(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'import_cases', entityId: caseId, action: 'supplier.update', detail: {}, createdAt: ts() });
  });
  return { saved: true };
});
