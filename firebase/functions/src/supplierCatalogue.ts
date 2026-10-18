import {addEnquiryTracking,trackingHash,validateTrackingToken} from './enquiryAccess.ts';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash } from 'node:crypto';
import { db } from './db.ts';
import { contextFrom, requirePlatformCaller, requireStaff } from './claims.ts';
import { text, id, cents, owned, leadRef } from './dealership.ts';
import { transactionWriteCheck, subscriptionState } from './subscriptions.ts';
import { ts } from './audits.ts';
import { beforwardSeed } from './beforwardSeed.ts';
import { fetchBeforwardSelection, availableSupplierSelection, parseSupplierDetail, type SupplierVehicle, type SupplierDetailSpecs } from './beforwardParser.ts';
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
// The catalogue estimate assumes a body type; a fetched detail (which carries the supplier's
// body label) refines it so pickups are not budgeted on passenger rates.
async function estimateFor(vehicle:EstimatedSupplierVehicle, detail?:SupplierDetailSpecs|null):Promise<SupplierLandedEstimate|null> {
  if(!detail)return vehicle.estimate;
  const taxSet=await activeTaxSet();
  return taxSet?supplierLandedEstimate(vehicle,taxSet,new Date().toISOString().slice(0,10),detail):null;
}
async function selection():Promise<EstimatedSupplierVehicle[]> {
  const snap=await snapshotRef.get();
  const stock=availableSupplierSelection(snap.data()?.stock,beforwardSeed);
  const taxSet=await activeTaxSet();
  const refDate=new Date().toISOString().slice(0,10);
  return stock.map(v=>({...v,estimate:taxSet?supplierLandedEstimate(v,taxSet,refDate):null}));
}
async function refreshSelection() {
  await db.runTransaction(async tx=>{
    const previous=await tx.get(snapshotRef);
    if((previous.data()?.refreshLockUntil??0)>Date.now())throw new HttpsError('already-exists','A supplier refresh is already running. Check status shortly.');
    tx.set(snapshotRef,{lastAttemptAt:ts(),refreshStatus:'refreshing',refreshLockUntil:Date.now()+240000},{merge:true});
  });
  try {
    const stock=await fetchBeforwardSelection();
    await snapshotRef.set({stock,updatedAt:ts(),lastSuccessAt:ts(),refreshStatus:'healthy',lastError:'',consecutiveFailures:0,refreshLockUntil:0},{merge:true});
    return {count:stock.length};
  } catch(error) {
    const message=(error instanceof Error?error.message:'Supplier refresh failed').slice(0,500);
    await db.runTransaction(async tx=>{const old=await tx.get(snapshotRef);tx.set(snapshotRef,{refreshStatus:'failed',lastError:message,lastFailureAt:ts(),refreshLockUntil:0,consecutiveFailures:(old.data()?.consecutiveFailures??0)+1},{merge:true});});
    console.error('Supplier catalogue refresh failed; saved inventory remains available',message);
    throw new HttpsError('unavailable',message);
  }
}
export const supplierCatalogueStatus=onCall(async request=>{
  await requirePlatformCaller(contextFrom(request));
  const data=(await snapshotRef.get()).data();
  const iso=(v:any)=>v?.toDate?.().toISOString()??null;
  return {status:data?.refreshStatus??'unknown',count:data?.stock?.length??0,lastAttemptAt:iso(data?.lastAttemptAt),lastSuccessAt:iso(data?.lastSuccessAt??data?.updatedAt),lastError:data?.lastError??'',consecutiveFailures:data?.consecutiveFailures??0};
});
export const refreshSupplierCatalogue=onCall({timeoutSeconds:240},async request=>{
  await requirePlatformCaller(contextFrom(request));return refreshSelection();
});
export const supplierCatalogueMaintenance=onSchedule({schedule:'every 6 hours',timeZone:'Africa/Harare',timeoutSeconds:240,maxInstances:1,retryCount:2,minBackoffSeconds:60,maxBackoffSeconds:300},async()=>{await refreshSelection();});
export const publicSupplierCatalogue=onCall(async()=>({stock:await selection(),limited:true}));
export const publicSupplierVehicle=onCall({timeoutSeconds:35,maxInstances:2},async request=>{
  const vehicle=(await selection()).find(v=>v.id===id(request.data.supplierVehicleId));
  if(!vehicle)throw new HttpsError('not-found','Supplier listing expired');
  const ref=db.doc(`supplier_photos/${vehicle.id}`),cached=(await ref.get()).data();
  // A cached detail of null records a failed attempt, so the gallery is not refetched for every viewer.
  if(cached&&cached.listingUrl===vehicle.listingUrl&&Date.now()-cached.checkedAt<6*3600000&&Object.hasOwn(cached,'detail'))return {photos:cached.photos,detail:cached.detail??null,estimate:await estimateFor(vehicle,cached.detail??null)};
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
  await ref.set({photos,detail,listingUrl:vehicle.listingUrl,checkedAt:Date.now()});return {photos,detail,estimate:await estimateFor(vehicle,detail)};
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
  const trackingToken=d.trackingToken?validateTrackingToken(d.trackingToken):null;let canTrack=false;
  const requestId=id(d.requestId),lead=db.doc(`dealer_leads/${createHash('sha256').update(`${company.id}|supplier|${requestId}`).digest('hex')}`);
  const hour=Math.floor(Date.now()/3600000),throttle=db.doc(`dealer_enquiry_limits/${createHash('sha256').update(`${request.rawRequest.ip}|supplier|${hour}`).digest('hex')}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx,company.id);
    const [currentCompany,existing,limit]=await Promise.all([tx.get(company.ref),tx.get(lead),tx.get(throttle)]);
    if(!importDealerEligible(currentCompany.data()!))throw new HttpsError('failed-precondition','Dealer unavailable');
    if(existing.exists){if(existing.data()?.phone!==phone||existing.data()?.supplierVehicle.id!==vehicle.id)throw new HttpsError('already-exists','Enquiry key already used');canTrack=!!trackingToken&&existing.data()?.trackingHash===trackingHash(trackingToken);return;}
    if((limit.data()?.count??0)>=10)throw new HttpsError('resource-exhausted','Too many enquiries. Please try again later.');
    tx.set(throttle,{count:(limit.data()?.count??0)+1,expiresAt:new Date((hour+2)*3600000)});
    tx.create(lead,{companyId:company.id,name,phone,preferences,interest:'import',budgetCents,status:'new',followUp:'',source:'beforward',supplierVehicle:vehicle,supplierVerification:{status:'pending'},createdAt:ts(),updatedAt:ts()});
    if(trackingToken){addEnquiryTracking(tx,lead,company.id,trackingToken);canTrack=true;}
  });return {received:true,...(canTrack?{trackingToken}:{}),ref:leadRef(lead.id),dealer:{name:company.data().name,slug,whatsapp:typeof company.data().contactWhatsapp==='string'?company.data().contactWhatsapp:''}};
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

export const sourceSupplierVehicle=onCall(async request=>{
  const ctx=contextFrom(request),staff=await requireStaff(ctx),d=request.data;
  const vehicle=(await selection()).find(v=>v.id===id(d.supplierVehicleId));
  if(!vehicle)throw new HttpsError('not-found','Choose a vehicle from the current selection');
  const customerId=d.customerId?id(d.customerId):null;
  const requestId=id(d.requestId),preferences=text(d.preferences??'','Notes',true),budgetCents=cents(d.budgetCents??0);
  const lead=db.doc(`dealer_leads/${createHash('sha256').update(`${staff.companyId}|dealer-supplier|${requestId}`).digest('hex')}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx,staff.companyId);
    const [company,existing,customer]=await Promise.all([tx.get(db.doc(`companies/${staff.companyId}`)),tx.get(lead),customerId?tx.get(db.doc(`customers/${customerId}`)):Promise.resolve(null)]);
    if(!['sourcing','both'].includes(company.data()?.operationMode))throw new HttpsError('failed-precondition','Your agency must offer vehicle sourcing');
    const c=customer?owned(customer.data(),staff.companyId):null;
    if(c&&c.isActive!==true)throw new HttpsError('failed-precondition','Customer inactive');
    if(existing.exists){const old=existing.data()!;if(old.supplierVehicle.id!==vehicle.id||old.customerId!==customerId||old.createdBy!==ctx.uid)throw new HttpsError('already-exists','Request already used');return;}
    const name=text(c?.fullName??d.name,'Customer name'),phone=text(c?.phoneNumber??d.phone,'WhatsApp / phone');
    tx.create(lead,{companyId:staff.companyId,customerId,name,phone,preferences,budgetCents,interest:'import',status:'new',followUp:'',assignedTo:ctx.uid,createdBy:ctx.uid,source:'dealer_supplier',supplierVehicle:vehicle,supplierVerification:{status:'pending'},createdAt:ts(),updatedAt:ts()});
    tx.create(db.collection('audit_log').doc(),{companyId:staff.companyId,actorId:ctx.uid,entityType:'dealer_leads',entityId:lead.id,action:'supplier.source',detail:{supplierVehicleId:vehicle.id,customerId},createdAt:ts()});
  });
  return {leadId:lead.id,ref:leadRef(lead.id)};
});
