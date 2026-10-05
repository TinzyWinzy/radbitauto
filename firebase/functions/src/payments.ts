import { transactionWriteCheck } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import type { ImportCaseDoc, PaymentDoc, QuotationDoc } from './types.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { bestEffortNotify, ts } from './audits.ts';
import { validatePaymentProof } from './documents.ts';

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function sameNullable(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function immutablePaymentMatches(existing: PaymentDoc, requested: PaymentDoc): boolean {
  return (
    existing.companyId === requested.companyId &&
    existing.caseId === requested.caseId &&
    existing.quotationId === requested.quotationId &&
    existing.amountCents === requested.amountCents &&
    (existing.recipient ?? 'agency') === requested.recipient &&
    (existing.purpose ?? 'mixed') === requested.purpose &&
    existing.method === requested.method &&
    sameNullable(existing.idempotencyKey, requested.idempotencyKey) &&
    sameNullable(existing.providerRef, requested.providerRef) &&
    sameNullable(existing.proofPath, requested.proofPath)
  );
}

export const recordPayment = onCall<{
  caseId: string;
  amountCents: number;
  method: 'EcoCash' | 'InnBucks' | 'Bank' | 'Cash';
  idempotencyKey?: string;
  providerRef?: string;
  proofPath?: string;
  quotationId: string;
  recipient?: 'agency' | 'supplier';
  purpose?: 'pass_through' | 'service_fee' | 'mixed';
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId, amountCents, method, providerRef, proofPath, quotationId } = request.data;
  const recipient = request.data.recipient ?? 'agency';
  const purpose = request.data.purpose ?? 'mixed';
  if (!['agency','supplier'].includes(recipient) || !['pass_through','service_fee','mixed'].includes(purpose) || recipient === 'supplier' && purpose === 'service_fee') throw new HttpsError('invalid-argument','Invalid payment recipient or purpose');

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new HttpsError('invalid-argument', 'amount must be a positive integer of cents');
  }
  const validMethods = ['EcoCash', 'InnBucks', 'Bank', 'Cash'];
  if (!validMethods.includes(method)) {
    throw new HttpsError('invalid-argument', `invalid method: ${method}`);
  }
  if (quotationId.trim() === '') {
    throw new HttpsError('invalid-argument', 'quotationId is required');
  }

  const normalizedProviderRef = providerRef?.trim() || undefined;
  const idempotencyKey = request.data.idempotencyKey?.trim() || normalizedProviderRef;
  if (idempotencyKey === undefined || idempotencyKey === '' || idempotencyKey.length > 200) {
    throw new HttpsError('invalid-argument', 'idempotencyKey or providerRef is required');
  }
  if (proofPath !== undefined) {
    const expectedProofPath = `payment-proofs/${staff.companyId}/${caseId}/${method}/${encodeURIComponent(idempotencyKey)}`;
    await validatePaymentProof(proofPath, expectedProofPath);
  }
  const paymentId = sha1(`${staff.companyId}|${idempotencyKey}`);
  const now = ts();
  const requested: PaymentDoc = {
    recipient,
    purpose,
    companyId: staff.companyId,
    caseId,
    quotationId,
    amountCents,
    method,
    status: 'pending',
    idempotencyKey,
    providerRef: normalizedProviderRef,
    proofPath,
    recordedBy: ctx.uid,
    createdAt: now,
  };

  const result = await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const ref = db.collection('payments').doc(paymentId);
    const existing = await txn.get(ref);
    const caseSnap = await txn.get(db.collection('import_cases').doc(caseId));
    const quoteSnap = await txn.get(db.collection('quotations').doc(quotationId));

    if (existing.exists) {
      const payment = existing.data() as PaymentDoc;
      if (!immutablePaymentMatches(payment, requested)) {
        throw new HttpsError('already-exists', 'idempotency key was used with a different payment payload');
      }
      return { paymentId, status: payment.status };
    }

    const caseDoc = caseSnap.exists ? (caseSnap.data() as ImportCaseDoc) : undefined;
    if (caseDoc === undefined || caseDoc.companyId !== staff.companyId) {
      throw new HttpsError('not-found', 'case not found for this tenant');
    }
    const quote = quoteSnap.exists ? (quoteSnap.data() as QuotationDoc) : undefined;
    if (
      quote === undefined ||
      quote.companyId !== staff.companyId ||
      quote.caseId !== caseId ||
      quote.status !== 'issued' ||
      caseDoc.currentQuotationId !== quotationId
    ) {
      throw new HttpsError('failed-precondition', 'current issued quotation required');
    }
    if (amountCents > quote.totalDueCents - quote.totalPaidCents) {
      throw new HttpsError('failed-precondition', 'payment exceeds the outstanding quotation balance');
    }

    txn.set(ref, requested);
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'payments',
      entityId: paymentId,
      action: 'record',
      detail: { caseId, quotationId, amountCents, method, idempotencyKey },
      createdAt: ts(),
    });
    return { paymentId, status: 'pending' as const };
  });

  return result;
});

export const confirmPayment = onCall<{ paymentId: string; note?: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);

  let confirmedCaseId = '';
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const ref = db.collection('payments').doc(request.data.paymentId);
    const paymentSnap = await txn.get(ref);
    if (!paymentSnap.exists) {
      throw new HttpsError('not-found', 'payment not found');
    }
    const payment = paymentSnap.data() as PaymentDoc;
    if (payment.companyId !== staff.companyId) {
      throw new HttpsError('permission-denied', 'not authorized for this tenant');
    }
    if (payment.quotationId === undefined || payment.quotationId === '') {
      throw new HttpsError('failed-precondition', 'payment is not linked to a quotation');
    }

    const caseSnap = await txn.get(db.collection('import_cases').doc(payment.caseId));
    const quoteSnap = await txn.get(db.collection('quotations').doc(payment.quotationId));
    const caseDoc = caseSnap.exists ? (caseSnap.data() as ImportCaseDoc) : undefined;
    const quote = quoteSnap.exists ? (quoteSnap.data() as QuotationDoc) : undefined;
    if (
      caseDoc === undefined ||
      caseDoc.companyId !== staff.companyId ||
      quote === undefined ||
      quote.companyId !== staff.companyId ||
      quote.caseId !== payment.caseId
    ) {
      throw new HttpsError('failed-precondition', 'payment case or quotation is invalid');
    }
    if (payment.status !== 'pending') {
      throw new HttpsError('failed-precondition', `payment already ${payment.status}`);
    }
    if (quote.status !== 'issued' || caseDoc.currentQuotationId !== payment.quotationId) {
      throw new HttpsError('failed-precondition', 'payment quotation is no longer current');
    }

    const totalPaidCents = quote.totalPaidCents + payment.amountCents;
    if (!Number.isSafeInteger(totalPaidCents) || totalPaidCents > quote.totalDueCents) {
      throw new HttpsError('failed-precondition', 'payment exceeds the remaining balance; review pending payments before confirming');
    }
    const now = ts();
    txn.update(ref, { status: 'confirmed', confirmedAt: now });
    txn.update(quoteSnap.ref, { totalPaidCents });
    txn.update(caseSnap.ref, {
      balanceDueCents: Math.max(0, quote.totalDueCents - totalPaidCents),
      updatedAt: now,
    });
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'payments',
      entityId: request.data.paymentId,
      action: 'confirm',
      detail: { caseId: payment.caseId, quotationId: payment.quotationId, note: request.data.note ?? null },
      createdAt: now,
    });
    confirmedCaseId = payment.caseId;
  });

  await bestEffortNotify({
    caseId: confirmedCaseId,
    type: 'payment_confirmed',
    title: 'Payment confirmed',
    body: 'Payment confirmed on your import.',
  });

  return { paymentId: request.data.paymentId, status: 'confirmed' as const };
});
