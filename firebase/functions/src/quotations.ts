import { validateQuoteTerms, type QuoteTerms } from './quoteTerms.ts';
import { transactionWriteCheck } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { db } from './db.ts';
import type { ImportCaseDoc, PaymentDoc, QuotationDoc, TaxRateSet, VehicleDoc } from './types.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { calculateImportQuotation, normalizeCharges, resolveActiveTaxRate } from './taxEngine.ts';
import type { QuotationCharges } from './taxEngine.ts';
import { bestEffortNotify, ts } from './audits.ts';

function quotationId(companyId: string, caseId: string, version: number): string {
  return createHash('sha1').update(`${companyId}|${caseId}|${version}`).digest('hex');
}

async function loadTaxSets(reader: Firestore | Transaction = db): Promise<TaxRateSet[]> {
  const query = db.collection('config').doc('tax_rates').collection('sets');
  const snap = reader === db ? await query.get() : await (reader as Transaction).get(query);
  const sets: TaxRateSet[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const taxSet: TaxRateSet = {
      scope: data.scope as TaxRateSet['scope'],
      companyId: data.companyId,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo,
      vatPct: data.vatPct,
      surtaxThresholdYears: data.surtaxThresholdYears,
      surtaxPct: data.surtaxPct,
      dutyRates: data.dutyRates,
      carbonTaxBands: data.carbonTaxBands,
      createdAt: data.createdAt,
    };
    sets.push(taxSet);
  }
  return sets;
}

function validatedCharges(value: unknown): QuotationCharges {
  try { return normalizeCharges(value); }
  catch (error) { throw new HttpsError('invalid-argument', (error as Error).message); }
}

async function requireUsd(companyId: string, reader: Firestore | Transaction = db): Promise<void> {
  const ref = db.collection('company_settings').doc(companyId);
  const snap = reader === db ? await ref.get() : await (reader as Transaction).get(ref);
  if (snap.exists && snap.data()?.currency !== 'USD') {
    throw new HttpsError('failed-precondition', 'Quotations currently support USD only. Set the agency currency to USD before issuing.');
  }
}

export const calculateImportQuotationView = onCall<{ vehicleId: string; charges?: Partial<QuotationCharges> }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx, true);
  await requireUsd(staff.companyId);
  const charges = validatedCharges(request.data.charges);

  const vehicleSnap = await db.collection('vehicles').doc(request.data.vehicleId).get();
  if (!vehicleSnap.exists) {
    throw new HttpsError('not-found', 'vehicle not found');
  }
  const vehicle = vehicleSnap.data() as VehicleDoc;
  if (vehicle.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }

  const taxSets = await loadTaxSets();
  const refDate = new Date().toISOString().slice(0, 10);
  const taxSet = resolveActiveTaxRate(taxSets, staff.companyId, refDate);

  return calculateImportQuotation(
    {
      category: vehicle.category,
      engineCc: vehicle.engineCc,
      purchasePriceCents: vehicle.purchasePriceCents,
      yellowBookValueCents: vehicle.yellowBookValueCents,
      year: vehicle.year,
    },
    taxSet,
    new Date().getFullYear(),
    charges,
  );
});

export const issueQuotation = onCall<{ caseId: string; charges?: Partial<QuotationCharges>; terms?:QuoteTerms }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);

  const caseSnap = await db.collection('import_cases').doc(request.data.caseId).get();
  if (!caseSnap.exists) {
    throw new HttpsError('not-found', 'case not found');
  }
  const caseDoc = caseSnap.data() as ImportCaseDoc;
  if (caseDoc.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }

  const terms=request.data.terms===undefined?undefined:validateQuoteTerms(request.data.terms);
  let issuedQuotationId = '';
  let issuedVersion = 0;
  let issuedTotalPaidCents = 0;
  let issuedBalanceDueCents = 0;
  let calculation: ReturnType<typeof calculateImportQuotation> | undefined;

  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const caseRef = db.collection('import_cases').doc(request.data.caseId);
    const quotationsQuery = db
      .collection('quotations')
      .where('companyId', '==', staff.companyId)
       .where('caseId', '==', request.data.caseId);
    const paymentsQuery = db

      .collection('payments')
      .where('companyId', '==', staff.companyId)
       .where('caseId', '==', request.data.caseId);
    const current = await txn.get(caseRef);
    const quotationsSnap = await txn.get(quotationsQuery);
    const paymentsSnap = await txn.get(paymentsQuery);

    if (!current.exists) {
      throw new HttpsError('not-found', 'case not found');
    }
    const latest = current.data() as ImportCaseDoc;
    if (latest.companyId !== staff.companyId) {
      throw new HttpsError('permission-denied', 'not authorized for this tenant');
    }
    await requireUsd(staff.companyId, txn);
    const previousQuote = quotationsSnap.docs.find((doc) => doc.id === latest.currentQuotationId)?.data() as QuotationDoc | undefined;
    const charges = validatedCharges(request.data.charges ?? previousQuote?.charges);
    const vehicleSnap = await txn.get(db.collection('vehicles').doc(latest.vehicleId));
    if (!vehicleSnap.exists) {
      throw new HttpsError('not-found', 'vehicle not found');
    }
    const vehicle = vehicleSnap.data() as VehicleDoc;
    if (vehicle.companyId !== staff.companyId) throw new HttpsError('permission-denied', 'vehicle belongs to another tenant');
    const taxSets = await loadTaxSets(txn);
    const refDate = new Date().toISOString().slice(0, 10);
    const taxSet = resolveActiveTaxRate(taxSets, staff.companyId, refDate);
    const calc = calculateImportQuotation(
      {
        category: vehicle.category,
        engineCc: vehicle.engineCc,
        purchasePriceCents: vehicle.purchasePriceCents,
        yellowBookValueCents: vehicle.yellowBookValueCents,
        year: vehicle.year,
      },
      taxSet,
      new Date().getFullYear(),
      charges,
    );

    const version = latest.quotationVersion + 1;
    const id = quotationId(staff.companyId, request.data.caseId, version);
    const priorIssuedIds = new Set(
      quotationsSnap.docs
        .filter((doc) => (doc.data() as QuotationDoc).status === 'issued')
        .map((doc) => doc.id),
    );
    const confirmedTotal = paymentsSnap.docs.reduce((total, doc) => {
      const payment = doc.data() as PaymentDoc;
      return payment.status === 'confirmed' ? total + payment.amountCents : total;
    }, 0);
    const now = ts();
    const quotation: QuotationDoc = {
      currency: 'USD',
      ...(terms?{terms}:{}),
      calculationVersion: 2,
      purchasePriceCents: calc.purchasePriceCents,
      charges: calc.charges,
      taxTotalCents: calc.taxTotalCents,
      calculationSnapshot: { refDate, vehicle: { category: vehicle.category, year: vehicle.year, engineCc: vehicle.engineCc ?? null, purchasePriceCents: vehicle.purchasePriceCents, yellowBookValueCents: vehicle.yellowBookValueCents ?? null }, taxSet, applied: calc.applied },
      companyId: staff.companyId,
      caseId: request.data.caseId,
      version,
      valuationBasis: calc.valuationBasis,
      cifValueCents: calc.cifValueCents,
      customsDutyCents: calc.customsDutyCents,
      surtaxCents: calc.surtaxCents,
      vatCents: calc.vatCents,
      carbonTaxCents: calc.carbonTaxCents,
      totalDueCents: calc.totalDueCents,
      totalPaidCents: confirmedTotal,
      status: 'issued',
      issuedAt: now,
      createdAt: now,
    };

    for (const quoteSnap of quotationsSnap.docs) {
      const quote = quoteSnap.data() as QuotationDoc;
      if (quote.status === 'issued') {
        txn.update(quoteSnap.ref, {
          status: 'expired',
          expiredAt: now,
        });
      }
    }
    for (const paymentSnap of paymentsSnap.docs) {
      const payment = paymentSnap.data() as PaymentDoc;
      if (payment.status === 'pending' && payment.quotationId !== undefined && priorIssuedIds.has(payment.quotationId)) {
        txn.update(paymentSnap.ref, {
          status: 'superseded',
          supersededAt: now,
        });
      }
    }

    txn.set(db.collection('quotations').doc(id), quotation);
    txn.update(caseRef, {
      currentQuotationId: id,
      quotationVersion: version,
      balanceDueCents: Math.max(0, calc.totalDueCents - confirmedTotal),
      updatedAt: now,
    });
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'quotations',
      entityId: id,
      action: 'issue',
      detail: {
        caseId: request.data.caseId,
        version,
        totalDueCents: calc.totalDueCents,
        totalPaidCents: confirmedTotal,
      },
      createdAt: now,
    });

    issuedQuotationId = id;
    issuedVersion = version;
    issuedTotalPaidCents = confirmedTotal;
    issuedBalanceDueCents = Math.max(0, calc.totalDueCents - confirmedTotal);
    calculation = calc;
  });

  if (calculation === undefined) {
    throw new HttpsError('aborted', 'quotation calculation did not complete');
  }
  const calc = calculation;

  await bestEffortNotify({
    caseId: request.data.caseId,
    type: 'quotation_issued',
    title: 'New quotation',
    body: `Your quotation for ${caseDoc.caseNum} is ready. Total due: $${(calc.totalDueCents / 100).toFixed(2)}`,
  });

  return {
    quotationId: issuedQuotationId,
    version: issuedVersion,
    totalPaidCents: issuedTotalPaidCents,
    balanceDueCents: issuedBalanceDueCents,
    ...calc,
  };
});
