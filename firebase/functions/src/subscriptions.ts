import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath, Timestamp, FieldValue, type Transaction } from 'firebase-admin/firestore';
import { db } from './db.ts';
import { contextFrom, requireAdmin, requirePlatformCaller } from './claims.ts';
import { PLANS, subscriptionState, activeVehicleKeys } from './subscriptionPolicy.ts';
import { ts } from './audits.ts';
export { PLANS, subscriptionState } from './subscriptionPolicy.ts';
export function trialSubscription() { return { version: 1, planId: 'dealer', status: 'trial', monthlyCents: 2900, currency: 'USD', billingMethod: 'manual_invoice', accessUntil: Timestamp.fromMillis(Date.now() + 30 * 86400000), startedAt: ts() }; }
export function assertSubscriptionWritable(company: any) {
  if (!subscriptionState(company?.subscription).writable) throw new HttpsError('failed-precondition', 'Subscription is read-only. Your owner can renew from Billing; existing records remain available.');
}
export async function transactionWriteCheck(tx: Transaction, companyId: string) {
  const company = await tx.get(db.doc(`companies/${companyId}`));
  if (company.data()?.isActive !== true) throw new HttpsError('permission-denied','Agency unavailable');
  assertSubscriptionWritable(company.data());
}
async function usage(tx: Transaction, companyId: string) {
  const rows = await Promise.all(['staff','dealer_stock','import_cases','dealer_acquisitions'].map(name => tx.get(db.collection(name).where('companyId','==',companyId).limit(5001))));
  if (rows.some(r => r.size > 5000)) throw new HttpsError('resource-exhausted','Contact support for a larger-volume subscription review');
  const docs = rows.map(r => r.docs.map(d => ({ id: d.id, ...d.data() })) as any[]);
  return { seats: docs[0].filter(d => d.isActive === true && d.isPlatformView !== true).length, keys: activeVehicleKeys(docs[1],docs[2],docs[3]) };
}
// Call before any transaction writes, then call the returned lock after all reads.
// Every capacity-adding operation writes this same company document: concurrent
// requests retry against fresh usage, including legacy records and bulk imports.
export async function capacityCheck(tx: Transaction, companyId: string, addition: { seat?: boolean; vehicleKey?: string }) {
  const ref = db.doc(`companies/${companyId}`); const company = await tx.get(ref);
  if (company.data()?.isActive !== true) throw new HttpsError('permission-denied','Agency unavailable');
  assertSubscriptionWritable(company.data());
  const state = subscriptionState(company.data()?.subscription); const used = await usage(tx,companyId);
  if (addition.seat && used.seats >= state.seats) throw new HttpsError('resource-exhausted',`${state.name} allows ${state.seats} active team members, including the owner. Deactivate a team member or upgrade from Billing.`);
  if (addition.vehicleKey && !used.keys.has(addition.vehicleKey) && used.keys.size >= state.activeVehicles) throw new HttpsError('resource-exhausted',`${state.name} allows ${state.activeVehicles} active vehicles. Complete existing work or upgrade from Billing.`);
  return () => tx.update(ref,{ capacityRevision: FieldValue.increment(1) });
}
export const subscriptionOverview = onCall(async request => {
  const staff = await requireAdmin(contextFrom(request), true);
  return db.runTransaction(async tx => { const c = await tx.get(db.doc(`companies/${staff.companyId}`)); const billing=await tx.get(db.doc(`agency_billing/${staff.companyId}`)); const used = await usage(tx,staff.companyId); const state = subscriptionState(c.data()?.subscription);
    return { ...state, usedSeats: used.seats, usedActiveVehicles: used.keys.size, invoiceReference: billing.data()?.invoiceReference ?? c.data()?.subscription?.invoiceReference ?? '', requestedPlan: c.data()?.subscription?.requestedPlan ?? null, plans: PLANS, supportEmail: 'brandontinoz@gmail.com' }; });
});
export const platformSubscriptionReport = onCall(async request => {
  await requirePlatformCaller(contextFrom(request)); const companyId=request.data.companyId;
  if(typeof companyId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(companyId))throw new HttpsError('invalid-argument','Invalid agency ID');
  const overview=await db.runTransaction(async tx=>{const c=await tx.get(db.doc(`companies/${companyId}`));if(!c.exists)throw new HttpsError('not-found','Agency unavailable');const used=await usage(tx,companyId);return {agencyName:c.data()?.name,...subscriptionState(c.data()?.subscription),usedSeats:used.seats,usedActiveVehicles:used.keys.size,requestedPlan:c.data()?.subscription?.requestedPlan??null};});
  const [storage,support]=await Promise.all([db.collection(`subscription_usage/${companyId}/daily`).orderBy('measuredAt','desc').limit(1).get(),db.collection('subscription_support').where('companyId','==',companyId).limit(500).get()]);
  return {...overview,storageBytes:storage.docs[0]?.data().storageBytes??null,storageMeasuredDate:storage.docs[0]?.id??null,supportMinutes30Days:support.docs.filter(d=>d.data().createdAt.toMillis()>Date.now()-30*86400000).reduce((n,d)=>n+d.data().minutes,0),supportLimited:support.size===500};
});
export const requestSubscriptionPlan = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireAdmin(ctx,true); const planId = request.data.planId;
  if (planId !== 'solo' && planId !== 'dealer') throw new HttpsError('invalid-argument','Choose Solo or Dealer');
  await db.runTransaction(async tx => { const ref=db.doc(`companies/${staff.companyId}`);const c=await tx.get(ref);if(c.data()?.isActive!==true)throw new HttpsError('permission-denied','Agency unavailable');
    tx.update(ref,{'subscription.requestedPlan':planId,'subscription.requestedAt':ts()});
    tx.create(db.collection('audit_log').doc(),{companyId:staff.companyId,actorId:ctx.uid,entityType:'companies',entityId:staff.companyId,action:'subscription.request',detail:{planId},createdAt:ts()}); });
  return { requested: true };
});
const EXPORT_COLLECTIONS = ['customers','staff','vehicles','import_cases','quotations','payments','dealer_leads','dealer_stock','dealer_costs','dealer_sales','dealer_acquisitions','dealer_sales_documents','dealer_sale_entries','import_deal_results','audit_log','subscription_events','agency_billing'];
export const exportAgencyRecords = onCall(async request => {
  const staff = await requireAdmin(contextFrom(request),true); const { collection, cursor, parentId, childCollection }=request.data;
  let query: FirebaseFirestore.Query;
  if (parentId) {
    if (!['import_cases','dealer_acquisitions'].includes(collection) || !/^[A-Za-z0-9_-]{1,128}$/.test(parentId)) throw new HttpsError('invalid-argument','Invalid export parent');
    const parent=await db.doc(`${collection}/${parentId}`).get();if(parent.data()?.companyId!==staff.companyId)throw new HttpsError('permission-denied','Record unavailable');
    if (!(collection==='import_cases'?['supplier','stage_updates','tracking','documents']:['events']).includes(childCollection)) throw new HttpsError('invalid-argument','Invalid export section');
    query=parent.ref.collection(childCollection);
  } else {
    if (!EXPORT_COLLECTIONS.includes(collection)) throw new HttpsError('invalid-argument','Invalid export collection');
    query=db.collection(collection).where('companyId','==',staff.companyId);
  }
  query=query.orderBy(FieldPath.documentId()).limit(101);
  if(cursor){if(typeof cursor!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(cursor))throw new HttpsError('invalid-argument','Invalid cursor');query=query.startAfter(cursor);}
  const snap=await query.get(); const page=snap.docs.slice(0,100);
  function clean(v:any):any {if(v?.toMillis)return new Date(v.toMillis()).toISOString();if(Array.isArray(v))return v.map(clean);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['photos','url','downloadUrl'].includes(k)).map(([k,x])=>[k,clean(x)]));return v;}
  return { rows:page.map(d=>({id:d.id,...clean(d.data())})), nextCursor:snap.size>100?page[99].id:null };
});
