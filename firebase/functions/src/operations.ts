import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck, assertSubscriptionWritable } from './subscriptions.ts';
import { createHash, randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { AggregateField, FieldPath, Timestamp } from 'firebase-admin/firestore';
import { db } from './db.ts';
import { contextFrom, requireAdmin, requireStaff, requireActiveUser, requirePlatformCaller } from './claims.ts';
import { ts } from './audits.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'Invalid record identifier');
  return value;
}
function audit(companyId: string, actorId: string, entityType: string, entityId: string, action: string, detail: object = {}) {
  return { companyId, actorId, entityType, entityId, action, detail, createdAt: ts() };
}

export const createInvitation = onCall<{ email: string; role: 'staff' | 'customer'; customerId?: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx);
  const email = request.data.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['staff', 'customer'].includes(request.data.role)) throw new HttpsError('invalid-argument', 'Provide an email and invitation role');
  const customerId = request.data.role === 'customer' ? id(request.data.customerId) : null;
  const token = randomBytes(32).toString('hex');
  const inviteId = hash(token);
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    if (customerId) {
      const customer = await txn.get(db.collection('customers').doc(customerId));
      if (!customer.exists || customer.data()?.companyId !== staff.companyId || customer.data()?.isActive !== true || customer.data()?.userId) throw new HttpsError('failed-precondition', 'Choose an active customer without portal access');
    }
    if (request.data.role === 'staff') { const lock = await capacityCheck(txn, staff.companyId, { seat: true }); lock(); }
    txn.create(db.collection('invitations').doc(inviteId), { companyId: staff.companyId, email, role: request.data.role, customerId, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000), createdAt: ts(), createdBy: ctx.uid });
    txn.create(db.collection('audit_log').doc(), audit(staff.companyId, ctx.uid, 'invitations', inviteId, 'create'));
  });
  return { token, expiresInDays: 7 };
});

export const acceptInvitation = onCall<{ token: string }>(async (request) => {
  const ctx = contextFrom(request);
  if (request.auth?.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before accepting');
  const token = id(request.data.token);
  if (token.length !== 64) throw new HttpsError('invalid-argument', 'Invalid invitation');
  const inviteRef = db.collection('invitations').doc(hash(token));
  let claims: Record<string, string> = {};
  await db.runTransaction(async (txn) => {
    const invite = await txn.get(inviteRef);
    const data = invite.data();
    if (!data || data.email !== String(request.auth?.token.email ?? '').toLowerCase()) throw new HttpsError('permission-denied', 'Sign in with the email this invitation was issued to');
    const company = await txn.get(db.collection('companies').doc(data.companyId));
    const profile = await txn.get(db.collection('users').doc(ctx.uid));
    const staff = await txn.get(db.collection('staff').doc(ctx.uid));
    const customers = await txn.get(db.collection('customers').where('userId', '==', ctx.uid));
    const platform = await txn.get(db.collection('platform_admins').doc(ctx.uid));
    const customer = data.customerId ? await txn.get(db.collection('customers').doc(data.customerId)) : null;
    if (company.data()?.isActive !== true || profile.data()?.isActive === false || platform.exists) throw new HttpsError('permission-denied', 'Account or agency unavailable');
    claims = { app_role: data.role, company_id: data.companyId, ...(data.customerId ? { customer_id: data.customerId } : {}) };
    if (data.acceptedBy === ctx.uid) {
      if (data.role === 'staff' ? staff.data()?.isActive !== true || staff.data()?.companyId !== data.companyId : customer?.data()?.isActive !== true || customer?.data()?.userId !== ctx.uid) throw new HttpsError('permission-denied', 'Membership is unavailable');
      return;
    }
    if (data.revokedAt || data.acceptedBy || data.expiresAt.toMillis() < Date.now() || staff.exists || !customers.empty || ctx.companyId) throw new HttpsError('failed-precondition', 'Invitation revoked, expired, used, or account already belongs to an agency');
    if (customer && (customer.data()?.companyId !== data.companyId || customer.data()?.isActive !== true || customer.data()?.userId)) throw new HttpsError('failed-precondition', 'Customer already linked or inactive');
    if (data.role === 'staff') { const lock = await capacityCheck(txn, data.companyId, { seat: true }); lock(); } else assertSubscriptionWritable(company.data());
    if (!profile.exists) txn.create(profile.ref, { email: data.email, fullName: request.auth?.token.name ?? '', isActive: true, createdAt: ts() });
    if (data.role === 'staff') txn.create(db.collection('staff').doc(ctx.uid), { companyId: data.companyId, role: 'staff', isActive: true, createdAt: ts() });
    else txn.update(customer!.ref, { userId: ctx.uid, updatedAt: ts() });
    txn.update(inviteRef, { acceptedBy: ctx.uid, acceptedAt: ts() });
    txn.create(db.collection('audit_log').doc(), audit(data.companyId, ctx.uid, 'invitations', invite.id, 'accept'));
  });
  await getAuth().setCustomUserClaims(ctx.uid, claims);
  return { accepted: true };
});

export const listInvitations = onCall(async request => {
  const staff=await requireAdmin(contextFrom(request), true);
  const result=await db.collection('invitations').where('companyId','==',staff.companyId).limit(200).get();
  return { invitations:result.docs.map(doc=>{const d=doc.data();return {id:doc.id,email:d.email,role:d.role,customerId:d.customerId,createdAt:d.createdAt.toMillis(),expiresAt:d.expiresAt.toMillis(),status:d.acceptedBy?'accepted':d.revokedAt?'revoked':d.expiresAt.toMillis()<Date.now()?'expired':'pending'};}).sort((a,b)=>b.createdAt-a.createdAt),limited:result.size===200 };
});

export const revokeInvitation = onCall(async request => {
  const ctx=contextFrom(request);const staff=await requireAdmin(ctx);const ref=db.doc(`invitations/${id(request.data.invitationId)}`);
  await db.runTransaction(async txn=>{const snap=await txn.get(ref);const d=snap.data();if(!d||d.companyId!==staff.companyId)throw new HttpsError('permission-denied','Invitation unavailable');if(d.acceptedBy)throw new HttpsError('failed-precondition','Invitation already accepted. Manage membership from Team.');if(d.revokedAt)return;txn.update(ref,{revokedAt:ts(),revokedBy:ctx.uid});txn.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,'invitations',ref.id,'revoke'));});
  return {revoked:true};
});

// The private link is a capability; its preview contains no recipient identity.
export const invitationInfo = onCall(async request=>{
  const token=id(request.data.token);if(!/^[a-f0-9]{64}$/.test(token))throw new HttpsError('invalid-argument','Invalid invitation link');
  const invite=await db.doc(`invitations/${hash(token)}`).get();const d=invite.data();if(!d)throw new HttpsError('not-found','Invitation unavailable');
  const company=await db.doc(`companies/${d.companyId}`).get();if(company.data()?.isActive!==true)throw new HttpsError('not-found','Agency unavailable');
  return {agencyName:company.data()!.name,role:d.role,status:d.acceptedBy?'accepted':d.revokedAt?'revoked':d.expiresAt.toMillis()<Date.now()?'expired':'pending',expiresAt:d.expiresAt.toMillis()};
});

export const acceptQuotation = onCall<{ quotationId: string }>(async (request) => {
  const ctx = contextFrom(request);
  await requireActiveUser(ctx.uid);
  await db.runTransaction(async (txn) => {
    const quote = await txn.get(db.collection('quotations').doc(id(request.data.quotationId)));
    const q = quote.data();
    if (!q) throw new HttpsError('not-found', 'Quotation not found');
    const caseSnap = await txn.get(db.collection('import_cases').doc(q.caseId));
    const customer = await txn.get(db.collection('customers').doc(caseSnap.data()?.customerId ?? 'missing'));
    const company = await txn.get(db.collection('companies').doc(q.companyId));
    if (ctx.appRole !== 'customer' || ctx.companyId !== q.companyId || ctx.customerId !== customer.id || customer.data()?.userId !== ctx.uid || customer.data()?.isActive !== true || company.data()?.isActive !== true) throw new HttpsError('permission-denied', 'This quotation is not yours');
    if(q.terms?.validUntil&&q.terms.validUntil<new Date().toISOString().slice(0,10))throw new HttpsError('failed-precondition','Quotation price validity has expired. Ask your agency to issue a reviewed quotation.');
    if (caseSnap.data()?.currentQuotationId !== quote.id || q.status !== 'issued') throw new HttpsError('failed-precondition', 'Quotation is no longer current');
    assertSubscriptionWritable(company.data());
    if (q.acceptedBy === ctx.uid) return;
    txn.update(quote.ref, { acceptedBy: ctx.uid, acceptedAt: ts() });
    txn.create(db.collection('audit_log').doc(), audit(q.companyId, ctx.uid, 'quotations', quote.id, 'accept', { caseId: q.caseId }));
  });
  return { accepted: true };
});

export const correctPayment = onCall<{ paymentId: string; action: 'reverse' | 'refund'; reason: string; reference: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx);
  const { action, reason, reference } = request.data;
  if (!['reverse', 'refund'].includes(action) || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 500 || typeof reference !== 'string' || !reference.trim() || reference.length > 150) throw new HttpsError('invalid-argument', 'Provide an action, reason and correction reference');
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const payment = await txn.get(db.collection('payments').doc(id(request.data.paymentId)));
    const p = payment.data();
    if (!p || p.companyId !== staff.companyId) throw new HttpsError('permission-denied', 'Payment unavailable');
    const c = await txn.get(db.collection('import_cases').doc(p.caseId));
    const quote = c.data()?.currentQuotationId ? await txn.get(db.collection('quotations').doc(c.data()!.currentQuotationId)) : null;
    const paid = await txn.get(db.collection('payments').where('companyId', '==', staff.companyId).where('caseId', '==', p.caseId));
    const status = action === 'refund' ? 'refunded' : 'reversed';
    if (p.status === status && p.correctionReference === reference.trim() && p.correctionReason === reason.trim()) return;
    if (p.status !== 'confirmed' || c.data()?.companyId !== staff.companyId || !quote || quote.data()?.companyId !== staff.companyId) throw new HttpsError('failed-precondition', 'Only confirmed payments on a valid case can be corrected');
    const totalPaidCents = paid.docs.reduce((sum, doc) => sum + (doc.id !== payment.id && doc.data().status === 'confirmed' ? doc.data().amountCents : 0), 0);
    txn.update(payment.ref, { status, correctionReason: reason.trim(), correctionReference: reference.trim(), correctedBy: ctx.uid, correctedAt: ts() });
    txn.update(quote.ref, { totalPaidCents });
    txn.update(c.ref, { balanceDueCents: Math.max(0, quote.data()!.totalDueCents - totalPaidCents), updatedAt: ts() });
    txn.create(db.collection('audit_log').doc(), audit(staff.companyId, ctx.uid, 'payments', payment.id, status, { caseId: p.caseId, reason: reason.trim(), reference: reference.trim(), amountCents: p.amountCents }));
  });
  return { corrected: true };
});

export const dashboardOverview = onCall(async (request) => {
  const staff = await requireStaff(contextFrom(request), true);
  const cases = db.collection('import_cases').where('companyId', '==', staff.companyId);
  const quotesNeeded = cases.where('quotationVersion', '==', 0);
  const payments = db.collection('payments').where('companyId', '==', staff.companyId).where('status', '==', 'pending');
  const documents = db.collectionGroup('documents').where('companyId', '==', staff.companyId).where('verified', '==', false).where('storageValid', '==', true);
  const [totals, active, quoteCount, paymentCount, documentCount, quoteRows, paymentRows, documentRows] = await Promise.all([
    cases.aggregate({ cases: AggregateField.count(), outstandingCents: AggregateField.sum('balanceDueCents') }).get(),
    cases.where('currentStage', '!=', 'delivered').count().get(),
    quotesNeeded.count().get(), payments.count().get(), documents.count().get(),
    quotesNeeded.limit(4).get(), payments.limit(4).get(), documents.limit(4).get(),
  ]);
  const tasks: { caseId: string; caseNum: string; kind: 'quotation' | 'payment' | 'document'; title: string; detail: string }[] = [];
  for (const row of quoteRows.docs) tasks.push({ caseId: row.id, caseNum: row.data().caseNum, kind: 'quotation', title: row.data().vehicleId ? 'Quotation to issue' : 'Vehicle to attach', detail: row.data().vehicleId ? 'Vehicle selected · prepare the USD quotation' : 'Enquiry open · vehicle not selected yet' });
  const references = [...paymentRows.docs.map(row => ({ row, caseId: row.data().caseId, kind: 'payment' as const })), ...documentRows.docs.map(row => ({ row, caseId: row.ref.parent.parent?.id, kind: 'document' as const }))];
  for (const item of references) {
    if (!item.caseId) continue;
    const parent = await db.collection('import_cases').doc(item.caseId).get();
    if (parent.data()?.companyId !== staff.companyId) continue;
    tasks.push({ caseId: parent.id, caseNum: parent.data()!.caseNum, kind: item.kind, title: item.kind === 'payment' ? 'Payment to confirm' : 'Document to verify', detail: item.kind === 'payment' ? 'Check transaction evidence before confirming' : String(item.row.data().docType ?? 'Import document').replaceAll('_', ' ') });
  }
  return { ...totals.data(), activeCases: active.data().count, attentionCount: quoteCount.data().count + paymentCount.data().count + documentCount.data().count, tasks };
});

export const agencyReport = onCall<{ cursor?: string }>(async (request) => {
  const staff = await requireStaff(contextFrom(request), true);
  const cases = db.collection('import_cases').where('companyId', '==', staff.companyId);
  const payments = db.collection('payments').where('companyId', '==', staff.companyId).where('status', '==', 'confirmed');
  const quotes = db.collection('quotations').where('companyId', '==', staff.companyId).where('status', '==', 'issued');
  let page = cases.orderBy(FieldPath.documentId()).limit(26);
  if (request.data.cursor) page = page.startAfter(id(request.data.cursor));
  const [summary, collections, fees, rows] = await Promise.all([
    cases.aggregate({ cases: AggregateField.count(), outstandingCents: AggregateField.sum('balanceDueCents') }).get(),
    payments.get(),
    quotes.aggregate({ quotedFeesCents: AggregateField.sum('charges.agencyFeeCents') }).get(), page.get(),
  ]);
  const totals=collections.docs.reduce((result,doc)=>{const p=doc.data();if(p.recipient==='supplier')result.supplierPaidCents+=p.amountCents;else{result.collectedCents+=p.amountCents;if(p.purpose==='pass_through')result.passThroughCents+=p.amountCents;else if(p.purpose==='service_fee')result.feeCollectionsCents+=p.amountCents;else result.unclassifiedCents+=p.amountCents;}return result;},{collectedCents:0,supplierPaidCents:0,passThroughCents:0,feeCollectionsCents:0,unclassifiedCents:0});
  return { ...summary.data(), ...totals, ...fees.data(), rows: rows.docs.slice(0, 25).map((doc) => ({ id: doc.id, caseNum: doc.data().caseNum, stage: doc.data().currentStage, balanceDueCents: doc.data().balanceDueCents })), nextCursor: rows.size > 25 ? rows.docs[24].id : null };
});

export const setAgencyAccess = onCall(async request => {
  const ctx = contextFrom(request); await requirePlatformCaller(ctx);
  const { status, planId, accessUntil, invoiceReference, paymentReference } = request.data;
  if (!['trial','active','paused','suspended'].includes(status) || !['solo','dealer'].includes(planId)) throw new HttpsError('invalid-argument','Choose a plan and subscription status');
  if (!Number.isSafeInteger(accessUntil) || accessUntil <= Date.now() || accessUntil > Date.now()+366*86400000) throw new HttpsError('invalid-argument','Choose an access end date within the next year');
  for (const value of [invoiceReference,paymentReference]) if(value!==undefined && (typeof value!=='string'||value.length>150)) throw new HttpsError('invalid-argument','Invalid billing reference');
  if(status==='active' && (!invoiceReference?.trim() || !paymentReference?.trim())) throw new HttpsError('invalid-argument','Record the invoice and verified payment references before activating paid access');
  const companyId=id(request.data.companyId);
  await db.runTransaction(async txn => {
    const company=await txn.get(db.doc(`companies/${companyId}`));if(!company.exists)throw new HttpsError('not-found','Agency not found');
    const team=await txn.get(db.collection('staff').where('companyId','==',companyId));
    const seatLimit=planId==='solo'?2:5;
    if(['trial','active'].includes(status) && team.docs.filter(d=>d.data().isActive===true && d.data().isPlatformView!==true).length>seatLimit)throw new HttpsError('failed-precondition',`Deactivate team members before selecting a plan with ${seatLimit} seats; no accounts will be removed automatically.`);
    const plan = planId==='solo' ? {monthlyCents:1500} : {monthlyCents:2900};
    const subscription={version:1,planId,status,...plan,currency:'USD',billingMethod:'manual_invoice',accessUntil:Timestamp.fromMillis(accessUntil),updatedAt:ts()};
    const billing={companyId,invoiceReference:invoiceReference?.trim()??'',paymentReference:paymentReference?.trim()??'',updatedAt:ts()};
    txn.set(db.doc(`agency_billing/${companyId}`),billing);
    txn.update(company.ref,{isActive:status!=='suspended',subscription});
    txn.create(db.collection('subscription_events').doc(),{actorId:ctx.uid,...subscription,...billing,previousSubscription:company.data()?.subscription??null,createdAt:ts()});
    txn.create(db.collection('audit_log').doc(),audit(companyId,ctx.uid,'companies',companyId,'subscription.update',{status,planId,accessUntil}));
  });return {saved:true};
});
