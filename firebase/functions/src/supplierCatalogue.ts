import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash } from 'node:crypto';
import { db } from './db.ts';
import { contextFrom, requirePlatformCaller, requireStaff } from './claims.ts';
import { text, id, cents, owned, leadRef } from './dealership.ts';
import { transactionWriteCheck, subscriptionState } from './subscriptions.ts';
import { ts } from './audits.ts';
import { beforwardSeed } from './beforwardSeed.ts';
import { fetchBeforwardSelection, freshSupplierVehicle, parseSupplierDetail, type SupplierVehicle, type SupplierDetailSpecs } from './beforwardParser.ts';
import { globalTaxSet } from './quotations.ts';
import { supplierLandedEstimate, type SupplierLandedEstimate } from './supplierEstimate.ts';
import type { TaxRateSet } from './types.ts';

const snapshotRef=db.doc('supplier_catalogues/beforward');
let taxCache:{at:number;set:TaxRateSet|null}|undefined;
async function activeTaxSet():Promise<TaxRateSet|null> {
  const now=Date.now();
  if(taxCache&&now-taxCache.at<300000)return taxCache.set;
  try { const set=await globalTaxSet(new Date().toISOString().slice(0,10));taxCache={at:now,set};return set; }
  catch { taxCache={at:now,set:null};return null; }
}
export type EstimatedSupplierVehicle = SupplierVehicle & { estimate: SupplierLandedEstimate | null };
async function selection():Promise<EstimatedSupplierVehicle[]> {
  const snap=await snapshotRef.get();
  const stock:SupplierVehicle[]=snap.exists?snap.data()!.stock:beforwardSeed;
  const fresh=stock.filter(v=>freshSupplierVehicle(v));
  const taxSet=await activeTaxSet();
  const refDate=new Date().toISOString().slice(0,10);
  return fresh.map(v=>({...v,estimate:taxSet?supplierLandedEstimate(v,taxSet,refDate):null}));
}
async function refreshSelection() {
  const stock=await fetchBeforwardSelection();
  await snapshotRef.set({stock,updatedAt:ts()});return {count:stock.length};
}
export const refreshSupplierCatalogue=onCall({timeoutSeconds:240},async request=>{
  await requirePlatformCaller(contextFrom(request));return refreshSelection();
});
export const supplierCatalogueMaintenance=onSchedule({schedule:'every 6 hours',timeZone:'Africa/Harare',timeoutSeconds:240,maxInstances:1},async()=>{await refreshSelection();});
export const publicSupplierCatalogue=onCall(async()=>({stock:await selection(),limited:true}));
export const publicSupplierVehicle=onCall({timeoutSeconds:35,maxInstances:2},async request=>{
  const vehicle=(await selection()).find(v=>v.id===id(request.data.supplierVehicleId));
  if(!vehicle)throw new HttpsError('not-found','Supplier listing expired');
  const ref=db.doc(`supplier_photos/${vehicle.id}`),cached=(await ref.get()).data();
  // A cached detail of null records a failed attempt, so the gallery is not refetched for every viewer.
  if(cached&&cached.listingUrl===vehicle.listingUrl&&Date.now()-cached.checkedAt<6*3600000&&Object.hasOwn(cached,'detail'))return {photos:cached.photos,detail:cached.detail??null,estimate:vehicle.estimate??null};
  // Only the stored supplier URL is fetched; callers cannot supply arbitrary URLs.
  const url=new URL(vehicle.listingUrl);
  if(url.protocol!=='https:'||url.hostname!=='www.beforward.jp'||url.username||url.password||url.port||url.search||url.hash||!/^\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z]{2}\d+\/id\/\d+\/$/.test(url.pathname))throw new HttpsError('failed-precondition','Invalid stored supplier URL');
  let photos=vehicle.photos,detail:SupplierDetailSpecs|null=null;
  try {
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Gallery unavailable');
    const html=await response.text();if(html.length>5000000)throw new Error('Gallery exceeds limit');
    const parsed=parseSupplierDetail(html,vehicle.id);
    if(parsed.photos.length)photos=parsed.photos;
    if(Object.keys(parsed.detail).length)detail=parsed.detail;
  }catch{ /* The captured catalogue photo remains usable when the gallery is unavailable. */ }
  await ref.set({photos,detail,listingUrl:vehicle.listingUrl,checkedAt:Date.now()});return {photos,detail,estimate:vehicle.estimate??null};
});

export function importDealerEligible(c:Record<string,any>) {
  return c.isActive===true && subscriptionState(c.subscription).writable &&
    ['sourcing','both'].includes(c.operationMode) && /^[a-z0-9-]{1,100}$/.test(c.slug??'');
}
export const publicImportDealers=onCall(async request=>{
  const cursor=request.data?.cursor;
  if(cursor!==undefined)id(cursor);
  let query=db.collection('companies').orderBy('__name__').limit(100);
  if(cursor)query=query.startAfter(cursor);
  const page=await query.get();
  return {dealers:page.docs.filter(d=>importDealerEligible(d.data())).map(d=>({slug:d.data().slug,name:d.data().name,operationMode:d.data().operationMode})),nextCursor:page.size===100?page.docs.at(-1)!.id:null};
});
export const enquireSupplierVehicle=onCall(async request=>{
  const d=request.data, vehicle=(await selection()).find(v=>v.id===id(d.supplierVehicleId));
  if(!vehicle)throw new HttpsError('failed-precondition','This supplier listing has expired. Browse the refreshed selection.');
  const slug=text(d.slug,'Dealer');if(!/^[a-z0-9-]{1,100}$/.test(slug))throw new HttpsError('invalid-argument','Invalid dealer');
  const company=(await db.collection('companies').where('slug','==',slug).limit(1).get()).docs[0];
  if(!company||!importDealerEligible(company.data()))throw new HttpsError('failed-precondition','This dealer is not accepting import enquiries. Choose another dealer.');
  const name=text(d.name,'Name'),phone=text(d.phone,'Phone'),preferences=text(d.preferences,'Questions',true),budgetCents=cents(d.budgetCents??0);
  const requestId=id(d.requestId),lead=db.doc(`dealer_leads/${createHash('sha256').update(`${company.id}|supplier|${requestId}`).digest('hex')}`);
  const hour=Math.floor(Date.now()/3600000),throttle=db.doc(`dealer_enquiry_limits/${createHash('sha256').update(`${request.rawRequest.ip}|supplier|${hour}`).digest('hex')}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx,company.id);
    const [currentCompany,existing,limit]=await Promise.all([tx.get(company.ref),tx.get(lead),tx.get(throttle)]);
    if(!importDealerEligible(currentCompany.data()!))throw new HttpsError('failed-precondition','Dealer unavailable');
    if(existing.exists){if(existing.data()?.phone!==phone||existing.data()?.supplierVehicle.id!==vehicle.id)throw new HttpsError('already-exists','Enquiry key already used');return;}
    if((limit.data()?.count??0)>=10)throw new HttpsError('resource-exhausted','Too many enquiries. Please try again later.');
    tx.set(throttle,{count:(limit.data()?.count??0)+1,expiresAt:new Date((hour+2)*3600000)});
    tx.create(lead,{companyId:company.id,name,phone,preferences,interest:'import',budgetCents,status:'new',followUp:'',source:'beforward',supplierVehicle:vehicle,supplierVerification:{status:'pending'},createdAt:ts(),updatedAt:ts()});
  });return {received:true,ref:leadRef(lead.id),dealer:{name:company.data().name,slug,whatsapp:typeof company.data().contactWhatsapp==='string'?company.data().contactWhatsapp:''}};
});
export const verifySupplierLead=onCall(async request=>{
  const ctx=contextFrom(request),staff=await requireStaff(ctx),d=request.data;
  if(!['available','unavailable'].includes(d.status))throw new HttpsError('invalid-argument','Choose an availability result');
  const evidence=text(d.evidence,'Supplier confirmation reference / notes'),ref=db.doc(`dealer_leads/${id(d.leadId)}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx,staff.companyId);const lead=owned((await tx.get(ref)).data(),staff.companyId);
    if(!lead.supplierVehicle)throw new HttpsError('failed-precondition','This is not a supplier enquiry');
    tx.update(ref,{supplierVerification:{status:d.status,evidence,verifiedAt:new Date().toISOString(),verifiedBy:ctx.uid},updatedAt:ts()});
    tx.create(db.collection('audit_log').doc(),{companyId:staff.companyId,actorId:ctx.uid,entityType:'dealer_leads',entityId:ref.id,action:'supplier.verify',detail:{status:d.status,evidence},createdAt:ts()});
  });return {saved:true};
});
