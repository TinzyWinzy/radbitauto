import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck } from './subscriptions.ts';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { db } from './db.ts';
import type { ImportCaseDoc, PaymentDoc, QuotationDoc, StageUpdateDoc, VehicleDoc } from './types.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { bestEffortNotify, ts } from './audits.ts';
import { DOC_REQUIREMENTS, STAGES } from './constants.ts';

function pad4(seq: number): string {
  return seq.toString().padStart(4, '0');
}

function randomId(collectionPath: string): string {
  return db.collection(collectionPath).doc().id;
}

type CaseWithId = ImportCaseDoc & { id: string };

interface TenantStage {
  key: string;
  position: number;
  enabled: boolean;
  label: string;
}

async function tenantStages(companyId: string, reader: Firestore | Transaction): Promise<TenantStage[]> {
  const stagesQuery = db
    .collection('companies')
    .doc(companyId)
    .collection('stages')
    .orderBy('position', 'asc');
  const snap = reader === db ? await stagesQuery.get() : await (reader as Transaction).get(stagesQuery);
  return snap.docs
    .map((doc) => {
      const data = (doc.data() as Record<string, unknown> | undefined) ?? {};
      const key = doc.id;
      return {
        key,
        position: data.position as number,
        enabled: data.enabled === true,
        label:
          typeof data.customLabel === 'string' && data.customLabel.trim() !== ''
            ? data.customLabel.trim()
            : STAGES.find((stage) => stage.key === key)?.label ?? key,
      };
    })
    .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
}

async function nextEnabledStage(
  companyId: string,
  currentStageKey: string,
  reader: Firestore | Transaction,
): Promise<TenantStage> {
  const stageDocs = await tenantStages(companyId, reader);
  const current = stageDocs.find((stage) => stage.key === currentStageKey);
  if (current === undefined) {
    throw new HttpsError('failed-precondition', 'current stage is not configured for this tenant');
  }
  if (!current.enabled) {
    throw new HttpsError('failed-precondition', 'current stage is disabled for this tenant');
  }
  const next = stageDocs.find((stage) => stage.enabled && stage.position > current.position);
  if (next === undefined) {
    throw new HttpsError('failed-precondition', 'no further stage defined for this tenant');
  }
  return next;
}

async function requiredDocsVerified(
  caseId: string,
  required: string[],
  reader: Firestore | Transaction,
): Promise<string[]> {
  const missing: string[] = [];
  for (const type of required) {
    const docsQuery = db
      .collection('import_cases')
      .doc(caseId)
      .collection('documents')
      .where('docType', '==', type);
    const snap = reader === db ? await docsQuery.get() : await (reader as Transaction).get(docsQuery);
    const accepted = snap.docs.some((document) => {
      const data = document.data() as { storageValid?: boolean; verified?: boolean };
      return data.storageValid === true && data.verified === true;
    });
    if (!accepted) {
      missing.push(type);
    }
  }
  return missing;
}

async function currentIssuedQuotation(
  caseDoc: CaseWithId,
  reader: Firestore | Transaction,
): Promise<QuotationDoc> {
  if (caseDoc.currentQuotationId === undefined || caseDoc.currentQuotationId === '') {
    throw new HttpsError('failed-precondition', 'current issued quotation required');
  }
  const snap = reader === db
    ? await db.collection('quotations').doc(caseDoc.currentQuotationId).get()
    : await (reader as Transaction).get(db.collection('quotations').doc(caseDoc.currentQuotationId));
  const quote = snap.exists ? (snap.data() as QuotationDoc) : undefined;
  if (
    quote === undefined ||
    quote.status !== 'issued' ||
    quote.companyId !== caseDoc.companyId ||
    quote.caseId !== caseDoc.id
  ) {
    throw new HttpsError('failed-precondition', 'current issued quotation required');
  }
  return quote;
}

async function confirmedPaymentTotal(
  caseDoc: CaseWithId,
  reader: Firestore | Transaction,
  quotationId?: string,
): Promise<number> {

  const paymentsQuery = db
    .collection('payments')
    .where('companyId', '==', caseDoc.companyId)
    .where('caseId', '==', caseDoc.id);
  const snap = reader === db ? await paymentsQuery.get() : await (reader as Transaction).get(paymentsQuery);
  return snap.docs.reduce((total, doc) => {
    const payment = doc.data() as PaymentDoc;
    if (payment.status !== 'confirmed') {
      return total;
    }
    if (quotationId !== undefined && payment.quotationId !== quotationId) {
      return total;
    }
    return total + payment.amountCents;
  }, 0);
}

async function japanEaaGuard(
  caseDoc: CaseWithId,
  toStage: string,
  reader: Firestore | Transaction,
): Promise<void> {
  if (toStage !== 'export_processing' && toStage !== 'shipped') {
    return;
  }
  const vehicleSnap = reader === db
    ? await db.collection('vehicles').doc(caseDoc.vehicleId).get()
    : await (reader as Transaction).get(db.collection('vehicles').doc(caseDoc.vehicleId));
  if (!vehicleSnap.exists) {
    throw new HttpsError('not-found', 'vehicle not found');
  }
  const vehicle = vehicleSnap.data() as VehicleDoc;
  if (vehicle.sourceCountry === 'Japan') {
    const missing = await requiredDocsVerified(caseDoc.id, ['eaa_certificate'], reader);
    if (missing.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        'EAA certificate required before export processing or shipping a Japan-sourced vehicle',
      );
    }
  }
}

async function validateStageGuards(
  caseDoc: CaseWithId,
  toStage: string,
  reader: Firestore | Transaction,
): Promise<void> {
  const required = DOC_REQUIREMENTS[toStage] ?? [];
  const missing = await requiredDocsVerified(caseDoc.id, required, reader);
  if (missing.length > 0) {
    throw new HttpsError('failed-precondition', `missing required documents: ${missing.join(', ')}`);
  }

  if (toStage === 'quotation' || toStage === 'duties_charges' || toStage === 'ready_for_collection') {
    await currentIssuedQuotation(caseDoc, reader);
  }
  if (toStage === 'payment_confirmed' || toStage === 'ready_for_collection') {
    const quote = await currentIssuedQuotation(caseDoc, reader);
    const paid = await confirmedPaymentTotal(caseDoc, reader);
    if (toStage === 'payment_confirmed' && paid <= 0) {
      throw new HttpsError('failed-precondition', 'confirmed payment required for current quotation');
    }
    if (toStage === 'ready_for_collection' && paid < quote.totalDueCents) {
      throw new HttpsError('failed-precondition', 'outstanding balance unpaid');
    }
  }
  await japanEaaGuard(caseDoc, toStage, reader);
}

export const createCase = onCall<{ customerId: string; vehicleId?: string; statusNote?: string; supplierLeadId?:string }>(
  async (request) => {
    const ctx = contextFrom(request);
    const staff = await requireStaff(ctx);
    const { customerId } = request.data;
    const vehicleId = request.data.vehicleId ?? '';

    if (typeof customerId !== 'string' || customerId.trim() === '' || typeof vehicleId !== 'string') {
      throw new HttpsError('invalid-argument', 'customerId is required and vehicleId must be a string');
    }

    const [customerSnap, vehicleSnap, companySnap, stages] = await Promise.all([
      db.collection('customers').doc(customerId).get(),
      vehicleId ? db.collection('vehicles').doc(vehicleId).get() : Promise.resolve(null),
      db.collection('companies').doc(staff.companyId).get(),
      tenantStages(staff.companyId, db),
    ]);
    if (!customerSnap.exists || customerSnap.data()!.companyId !== staff.companyId) {
      throw new HttpsError('not-found', 'customer not found for this tenant');
    }
    if (vehicleId && (!vehicleSnap?.exists || vehicleSnap.data()!.companyId !== staff.companyId)) {
      throw new HttpsError('not-found', 'vehicle not found for this tenant');
    }
    if (!companySnap.exists) {
      throw new HttpsError('not-found', 'company not found');
    }
    const firstStage = stages.find((stage) => stage.enabled);
    if (firstStage === undefined) {
      throw new HttpsError('failed-precondition', 'no enabled stage defined for this tenant');
    }

    const caseId = randomId('import_cases');
    const now = ts();
    let resolvedCaseNum = '';
    let createdStage = '';
    let createdStageLabel = '';

    await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
      const companyRef = db.collection('companies').doc(staff.companyId);
      const customerRef = db.collection('customers').doc(customerId);
      const vehicleRef = vehicleId ? db.collection('vehicles').doc(vehicleId) : null;
      const caseRef = db.collection('import_cases').doc(caseId);
      const counterRef = db.collection('companies').doc(staff.companyId).collection('meta').doc('counter');
      const currentCompany = await txn.get(companyRef);
      const currentCustomer = await txn.get(customerRef);
      const currentVehicle = vehicleRef ? await txn.get(vehicleRef) : null;
      const dealerStock = vehicleId ? await txn.get(db.collection('dealer_stock').doc(vehicleId)) : null;
      const dealerAcquisition = vehicleId ? await txn.get(db.collection('dealer_acquisitions').doc(vehicleId)) : null;
      if (dealerAcquisition?.exists) throw new HttpsError('failed-precondition','Vehicle belongs to a dealer acquisition');
      if (dealerStock?.exists) throw new HttpsError('failed-precondition', 'Dealer stock uses the retail sale workflow; it cannot be assigned to a customer import');
      const counterSnap = await txn.get(counterRef);
      const caseSnap = await txn.get(caseRef);
      const supplierLeadId=request.data.supplierLeadId;
      if(supplierLeadId!=null&&(typeof supplierLeadId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(supplierLeadId)))throw new HttpsError('invalid-argument','Invalid supplier enquiry');
      const supplierLead=supplierLeadId?await txn.get(db.doc(`dealer_leads/${supplierLeadId}`)):null;
      const sourcing=supplierLead?.data();
      if(supplierLeadId&&(!sourcing||sourcing.companyId!==staff.companyId||sourcing.customerId!==customerId||!sourcing.supplierVehicle))throw new HttpsError('permission-denied','Supplier enquiry does not belong to this customer');
      if(sourcing&&(sourcing.supplierVerification?.status!=='available'||!Number.isFinite(Date.parse(sourcing.supplierVerification.verifiedAt))||Date.now()-Date.parse(sourcing.supplierVerification.verifiedAt)>86400000))throw new HttpsError('failed-precondition','Confirm supplier availability within the last 24 hours before starting this import');
      if(sourcing?.importCaseId)throw new HttpsError('already-exists','This enquiry already has an import case');
      const currentStages = await tenantStages(staff.companyId, txn);
      const currentFirstStage = currentStages.find((stage) => stage.enabled);
      if (!currentCompany.exists || !currentCustomer.exists || (vehicleRef && !currentVehicle?.exists)) {
        throw new HttpsError('not-found', 'case references changed before creation');
      }
      if (
        currentCustomer.data()!.companyId !== staff.companyId ||
        currentCustomer.data()!.isActive !== true ||
        (currentVehicle && currentVehicle.data()!.companyId !== staff.companyId)
      ) {
        throw new HttpsError('permission-denied', 'not authorized for this tenant');
      }
      if (caseSnap.exists) {
        throw new HttpsError('already-exists', 'case already exists');
      }
      if (currentFirstStage === undefined) {
        throw new HttpsError('failed-precondition', 'no enabled stage defined for this tenant');
      }
      if (currentFirstStage.key !== firstStage.key) {
        throw new HttpsError('aborted', 'tenant stages changed concurrently');
      }

      const lastSeq = (counterSnap.exists ? (counterSnap.data()!.lastSeq as number) : 0) + 1;
      const casePrefix = currentCompany.data()!.casePrefix as string;
      const caseNum = `${casePrefix}${pad4(lastSeq)}`;
      const caseDoc: ImportCaseDoc = {
        caseNum,
        companyId: staff.companyId,
        customerId,
        vehicleId,
        currentStage: currentFirstStage.key,
        statusNote: request.data.statusNote,
        balanceDueCents: 0,
        quotationVersion: 0,
        createdAt: now,
        updatedAt: now,
      };
      const lock = await capacityCheck(txn, staff.companyId, { vehicleKey: vehicleId ? `vehicle:${vehicleId}` : `case:${caseId}` }); lock();
      txn.set(caseRef, caseDoc);
      if(sourcing&&supplierLead){
        txn.set(caseRef.collection('supplier').doc('details'),{companyId:staff.companyId,supplierName:'BE FORWARD',stockReference:sourcing.supplierVehicle.id,listingUrl:sourcing.supplierVehicle.listingUrl,purchaseReference:'',updatedAt:now});
        txn.set(caseRef,{supplierSelection:sourcing.supplierVehicle,supplierVerification:sourcing.supplierVerification},{merge:true});
        txn.update(supplierLead.ref,{importCaseId:caseId,status:'won',updatedAt:now});
      }
      txn.set(counterRef, { lastSeq });
      if (vehicleRef) txn.update(vehicleRef, { customerIds: FieldValue.arrayUnion(customerId) });
      txn.set(db.collection('audit_log').doc(), {
        companyId: staff.companyId,
        actorId: ctx.uid,
        entityType: 'import_cases',
        entityId: caseId,
        action: 'create',
        detail: { caseNum },
        createdAt: ts(),
      });
      resolvedCaseNum = caseNum;
      createdStage = currentFirstStage.key;
      createdStageLabel = currentFirstStage.label;
    });

    await bestEffortNotify({
      caseId,
      type: 'case_created',
      title: 'Import enquiry received',
      body: `Your import ${resolvedCaseNum} (${createdStageLabel}) has been registered.`,
    });

    return { caseId, caseNum: resolvedCaseNum, currentStage: createdStage };
  },
);

export const attachCaseVehicle = onCall<{ caseId: string; vehicleId: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId, vehicleId } = request.data;
  if (typeof caseId !== 'string' || !caseId || typeof vehicleId !== 'string' || !vehicleId) throw new HttpsError('invalid-argument', 'caseId and vehicleId are required');
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const caseRef = db.collection('import_cases').doc(caseId);
    const vehicleRef = db.collection('vehicles').doc(vehicleId);
    const [caseSnap, vehicleSnap] = await Promise.all([txn.get(caseRef), txn.get(vehicleRef)]);
    const dealerStock = await txn.get(db.collection('dealer_stock').doc(vehicleId));
    const dealerAcquisition = await txn.get(db.collection('dealer_acquisitions').doc(vehicleId));
    if (dealerAcquisition.exists) throw new HttpsError('failed-precondition','Vehicle belongs to a dealer acquisition');
    if (dealerStock.exists) throw new HttpsError('failed-precondition', 'Dealer stock uses the retail sale workflow');
    const caseDoc = caseSnap.data() as ImportCaseDoc | undefined;
    if (!caseDoc || !vehicleSnap.exists || caseDoc.companyId !== staff.companyId || vehicleSnap.data()?.companyId !== staff.companyId) throw new HttpsError('not-found', 'case or vehicle not found for this tenant');
    if (caseDoc.vehicleId === vehicleId) return;
    if (caseDoc.vehicleId || caseDoc.quotationVersion > 0) throw new HttpsError('failed-precondition', 'A vehicle is already attached; financial history cannot be reassigned');
    txn.update(caseRef, { vehicleId, updatedAt: ts() });
    txn.update(vehicleRef, { customerIds: FieldValue.arrayUnion(caseDoc.customerId) });
    txn.create(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'import_cases', entityId: caseId, action: 'attach_vehicle', detail: { vehicleId }, createdAt: ts() });
  });
  return { caseId, vehicleId };
});

export const advanceImportStage = onCall<{
  caseId: string;
  toStage: string;
  note?: string;
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { caseId, toStage } = request.data;

  const caseSnap = await db.collection('import_cases').doc(caseId).get();
  if (!caseSnap.exists) {
    throw new HttpsError('not-found', 'case not found');
  }
  const caseDoc = caseSnap.data() as ImportCaseDoc;
  if (caseDoc.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }
  const next = await nextEnabledStage(staff.companyId, caseDoc.currentStage, db);
  if (toStage !== next.key) {
    throw new HttpsError('failed-precondition', `must advance to next enabled stage: ${next.key}`);
  }
  await validateStageGuards({ ...caseDoc, id: caseId }, toStage, db);

  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const caseRef = db.collection('import_cases').doc(caseId);
    const current = await txn.get(caseRef);
    if (!current.exists) {
      throw new HttpsError('not-found', 'case not found');
    }
    const currentCase = { ...(current.data() as ImportCaseDoc), id: caseId };
    if (currentCase.currentStage !== caseDoc.currentStage) {
      throw new HttpsError('aborted', 'case changed concurrently');
    }
    const currentNext = await nextEnabledStage(staff.companyId, currentCase.currentStage, txn);
    if (currentNext.key !== toStage) {
      throw new HttpsError('failed-precondition', `must advance to next enabled stage: ${currentNext.key}`);
    }
    await validateStageGuards(currentCase, toStage, txn);

    txn.update(caseRef, {
      currentStage: toStage,
      previousStage: currentCase.currentStage,
      statusNote: request.data.note ?? currentCase.statusNote,
      updatedAt: ts(),
    });

    const stageUpdate: StageUpdateDoc = {
      companyId: staff.companyId,
      caseId,
      stageKey: toStage,
      status: 'completed',
      staffId: ctx.uid,
      note: request.data.note,
      createdAt: ts(),
    };
    txn.set(db.collection('import_cases').doc(caseId).collection('stage_updates').doc(), stageUpdate);
    txn.set(db.collection('audit_log').doc(), {
      companyId: staff.companyId,
      actorId: ctx.uid,
      entityType: 'import_cases',
      entityId: caseId,
      action: 'advance_stage',
      detail: { toStage, fromStage: currentCase.currentStage },
      createdAt: ts(),
    });
  });

  await bestEffortNotify({
    caseId,
    type: 'status_update',
    title: 'Import status updated',
    body: `Your import ${caseDoc.caseNum} is now at: ${next.label}`,
  });

  return {
    caseId,
    fromStage: caseDoc.currentStage,
    toStage,
    label: next.label,
  };
});

export const clearanceReady = onCall<{ caseId: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx, true);

  const caseSnap = await db.collection('import_cases').doc(request.data.caseId).get();
  if (!caseSnap.exists) {
    throw new HttpsError('not-found', 'case not found');
  }
  const caseDoc = caseSnap.data() as ImportCaseDoc;
  if (caseDoc.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }

  const required = DOC_REQUIREMENTS.customs_clearance;
  const missing = await requiredDocsVerified(
    request.data.caseId,
    required,
    db,
  );
  return { ready: missing.length === 0, missingDocs: missing };
});
