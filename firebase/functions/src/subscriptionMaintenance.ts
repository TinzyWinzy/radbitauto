import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import { db } from './db.ts';
import { contextFrom, requireAdmin, requirePlatformCaller } from './claims.ts';
import { subscriptionState } from './subscriptionPolicy.ts';
import { ts } from './audits.ts';
import { getStorage } from 'firebase-admin/storage';

export async function remindCompany(companyId: string, company: any, now = Date.now()) {
  const state=subscriptionState(company.subscription,now);
  if (!state.managed || !company.ownerUserId || company.isActive!==true || !['trial','active','expired'].includes(state.status)) return false;
  const days=state.daysRemaining!;
  const threshold=days===0?0:days<=3?3:days<=7?7:null;
  if(threshold===null)return false;
  const ref=db.doc(`users/${company.ownerUserId}/notifications/subscription-${state.accessUntil}-${threshold}`);
  await db.runTransaction(async tx=>{if((await tx.get(ref)).exists)return;
    tx.create(ref,{companyId,type:'subscription',title:days===0?'Subscription is read-only':`${days} days of subscription access remaining`,body:days===0?'Your existing records remain available. Open Plan & billing to arrange renewal.':'Arrange your USD renewal from Plan & billing before access expires.',payload:{route:'/app/billing'},createdAt:ts()});});
  return true;
}
// Aggregate usage rather than customer content. These are usage measurements,
// not a calculation of Firebase charges or a promise of an unlimited allowance.
export const subscriptionMaintenance = onSchedule({schedule:'every day 08:00',timeZone:'Africa/Harare',timeoutSeconds:540,maxInstances:1},async()=>{
  let cursor:string|undefined;const day=new Date().toISOString().slice(0,10);
  do {
    let query=db.collection('companies').orderBy(FieldPath.documentId()).limit(100);if(cursor)query=query.startAfter(cursor);
    const page=await query.get();
    for(const company of page.docs){const d=company.data();await remindCompany(company.id,d);
      if(d.isActive!==true)continue;
      const counts=await Promise.all(['staff','customers','dealer_stock','import_cases','dealer_acquisitions'].map(async collection=>({collection,count:(await db.collection(collection).where('companyId','==',company.id).count().get()).data().count})));
      let storageBytes=0,storageObjects=0;
      for(const root of ['stock-photos','documents','payment-proofs']){
        let token:string|undefined;
        do {const [files,next]=await getStorage().bucket().getFiles({prefix:`${root}/${company.id}/`,autoPaginate:false,maxResults:1000,...(token?{pageToken:token}:{})});for(const file of files){storageObjects++;storageBytes+=Number(file.metadata.size??0);}token=next?.pageToken;}while(token);
      }
      await db.doc(`subscription_usage/${company.id}/daily/${day}`).set({companyId:company.id,planId:subscriptionState(d.subscription).planId,counts:Object.fromEntries(counts.map(c=>[c.collection,c.count])),storageBytes,storageObjects,measuredAt:ts()});
    }
    cursor=page.size===100?page.docs[99].id:undefined;
  }while(cursor);
});
export const logAgencySupport = onCall(async request=>{
  const ctx=contextFrom(request);const {companyId,minutes,reference}=request.data;
  await requirePlatformCaller(ctx);
  if(typeof companyId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)||!Number.isInteger(minutes)||minutes<1||minutes>1440||typeof reference!=='string'||!reference.trim()||reference.length>150)throw new HttpsError('invalid-argument','Provide agency, 1–1440 support minutes and a ticket reference');
  if(!(await db.doc(`companies/${companyId}`).get()).exists)throw new HttpsError('not-found','Agency unavailable');
  await db.collection('subscription_support').add({companyId,minutes,reference:reference.trim(),actorId:ctx.uid,createdAt:ts()});return {saved:true};
});
export const agencyUsageHistory=onCall(async request=>{
  const staff=await requireAdmin(contextFrom(request),true);const rows=await db.collection(`subscription_usage/${staff.companyId}/daily`).orderBy('measuredAt','desc').limit(30).get();
  return {rows:rows.docs.map(d=>({date:d.id,storageBytes:d.data().storageBytes,storageObjects:d.data().storageObjects}))};
});
