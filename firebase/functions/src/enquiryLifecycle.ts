import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {createHash} from 'node:crypto';
import {db} from './db.ts';
import {contextFrom,requireStaff,requireAdmin} from './claims.ts';
import {transactionWriteCheck} from './subscriptions.ts';
import {text,id,cents,owned,leadRef} from './dealership.ts';
import {ts} from './audits.ts';
import {validateJourneyAction} from './journeyAction.ts';
import {validateEnquiryQuote,leadReminder} from './enquiryPolicy.ts';
import {addEnquiryTracking,newTrackingToken,trackingHash,validateTrackingToken} from './enquiryAccess.ts';
const audit=(companyId:string,actorId:string,entityId:string,action:string,detail:object={})=>({companyId,actorId,entityId,entityType:'dealer_leads',action,detail,createdAt:ts()});
function publicQuote(q:any){if(!q)return null;return {id:q.id,version:q.version,currency:q.currency,charges:q.charges,totalCents:q.totalCents,validUntil:q.validUntil,expiresAt:q.expiresAt,route:q.route,inclusions:q.inclusions,exclusions:q.exclusions,taxBasis:q.taxBasis,taxStatus:q.taxStatus,issuedAt:q.issuedAt,expired:q.expiresAt<Date.now()};}
export const dealerEnquiryDetails=onCall(async request=>{
 const staff=await requireStaff(contextFrom(request),true),leadId=id(request.data.leadId);
 const lead=owned((await db.doc(`dealer_leads/${leadId}`).get()).data(),staff.companyId);
 const history=await db.collection('dealer_lead_quotes').where('leadId','==',leadId).get();
 let privateReview=null;
 if(staff.role==='admin'&&lead.quotation){const costs=(await db.doc(`dealer_lead_costs/${lead.quotation.id}`).get()).data();if(costs?.companyId===staff.companyId)privateReview={expectedCostCents:costs.expectedCostCents,costsComplete:costs.costsComplete,marginCents:lead.quotation.totalCents-costs.expectedCostCents};}
 const {trackingHash:unused,...safe}=lead;
 return {lead:{id:leadId,...safe} as Record<string,any>,reminder:leadReminder(lead),quotations:history.docs.filter(d=>d.data().companyId===staff.companyId).map(d=>publicQuote({id:d.id,...d.data()})).sort((a,b)=>b!.version-a!.version),privateReview,isOwner:staff.role==='admin'};
});
export const issueEnquiryQuotation=onCall(async request=>{
 const ctx=contextFrom(request),staff=await requireStaff(ctx),d=request.data;
 const quote=validateEnquiryQuote(d),leadId=id(d.leadId),key=id(d.requestId);
 let privateCosts:{expectedCostCents:number;costsComplete:boolean}|null=null;
 if(d.privateCosts!==undefined){
  if(!d.privateCosts||typeof d.privateCosts!=='object'||Array.isArray(d.privateCosts)||typeof d.privateCosts.costsComplete!=='boolean')throw new HttpsError('invalid-argument','Invalid private cost review');
  if(staff.role!=='admin')throw new HttpsError('permission-denied','Only the owner can include a private cost review');
  privateCosts={expectedCostCents:cents(d.privateCosts.expectedCostCents),costsComplete:d.privateCosts.costsComplete};
 }
 const quoteId=createHash('sha256').update(`${staff.companyId}|${leadId}|quote|${key}`).digest('hex');
 const fingerprint=createHash('sha256').update(JSON.stringify({quote,privateCosts})).digest('hex');
 const leadRefDoc=db.doc(`dealer_leads/${leadId}`),quoteRef=db.doc(`dealer_lead_quotes/${quoteId}`);
 await db.runTransaction(async tx=>{
  await transactionWriteCheck(tx,staff.companyId);
  const [leadSnap,previous,settings]=await Promise.all([tx.get(leadRefDoc),tx.get(quoteRef),tx.get(db.doc(`company_settings/${staff.companyId}`))]);
  const lead=owned(leadSnap.data(),staff.companyId);
  if(previous.exists){if(previous.data()?.fingerprint!==fingerprint)throw new HttpsError('already-exists','Quote request already used');return;}
  if(lead.importCaseId||['won','lost'].includes(lead.status))throw new HttpsError('failed-precondition','This enquiry is closed; manage its import case instead');
  if(settings.exists&&settings.data()?.currency!=='USD')throw new HttpsError('failed-precondition','Quotations support USD only');
  if(lead.supplierVehicle&&(lead.supplierVerification?.status!=='available'||!Number.isFinite(Date.parse(lead.supplierVerification?.verifiedAt))||Date.now()-Date.parse(lead.supplierVerification.verifiedAt)>86400000))throw new HttpsError('failed-precondition','Verify supplier availability within the last 24 hours before issuing');
  const version=(lead.quotation?.version??0)+1,snapshot={id:quoteId,...quote,version,issuedAt:new Date().toISOString()};
  if(privateCosts)tx.create(db.doc(`dealer_lead_costs/${quoteId}`),{companyId:staff.companyId,leadId,quoteId,...privateCosts,updatedAt:ts()});
  tx.create(quoteRef,{...snapshot,companyId:staff.companyId,leadId,fingerprint,issuedBy:ctx.uid,createdAt:ts()});
  tx.update(leadRefDoc,{quotation:snapshot,publicStatus:'quotation_ready',followUp:new Date(Date.now()+86400000+7200000).toISOString().slice(0,10),updatedAt:ts(),nextAction:{title:'Follow up quotation with customer',responsible:'agency',dueDate:new Date(Date.now()+86400000+7200000).toISOString().slice(0,10),state:'pending'}});
  tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,leadId,'enquiry.quote',{quoteId,version,totalCents:quote.totalCents}));
 });return {quoteId};
});
export const saveEnquiryPrivateCosts=onCall(async request=>{
 const ctx=contextFrom(request),staff=await requireAdmin(ctx),d=request.data,leadId=id(d.leadId),quoteId=id(d.quoteId),expectedCostCents=cents(d.expectedCostCents);
 if(typeof d.costsComplete!=='boolean')throw new HttpsError('invalid-argument','State whether all expected costs are included');
 await db.runTransaction(async tx=>{
  await transactionWriteCheck(tx,staff.companyId);const [lead,quote]=await Promise.all([tx.get(db.doc(`dealer_leads/${leadId}`)),tx.get(db.doc(`dealer_lead_quotes/${quoteId}`))]);
  const l=owned(lead.data(),staff.companyId),q=owned(quote.data(),staff.companyId);
  if(q.leadId!==leadId||l.quotation?.id!==quoteId)throw new HttpsError('failed-precondition','Review the current quotation');
  tx.set(db.doc(`dealer_lead_costs/${quoteId}`),{companyId:staff.companyId,leadId,quoteId,expectedCostCents,costsComplete:d.costsComplete,updatedAt:ts()});
  tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,leadId,'enquiry.private_cost_review'));
 });return {saved:true};
});
export const updateEnquiryAction=onCall(async request=>{
 const ctx=contextFrom(request),staff=await requireStaff(ctx),d=request.data,leadId=id(d.leadId),action=validateJourneyAction(d);
 const customerUpdate=text(d.customerUpdate??'','Customer update',true);
 const allowed=['received','verifying','awaiting_customer','closed'];
 if(!allowed.includes(d.publicStatus))throw new HttpsError('invalid-argument','Choose a customer-facing status');
 await db.runTransaction(async tx=>{
  await transactionWriteCheck(tx,staff.companyId);const ref=db.doc(`dealer_leads/${leadId}`),lead=owned((await tx.get(ref)).data(),staff.companyId);
  if(lead.importCaseId||['won','lost'].includes(lead.status))throw new HttpsError('failed-precondition','This enquiry is closed');
  const assignedTo=d.assignedTo?id(d.assignedTo):(lead.assignedTo??ctx.uid),member=await tx.get(db.doc(`staff/${assignedTo}`));
  if(member.data()?.companyId!==staff.companyId||member.data()?.isActive!==true)throw new HttpsError('invalid-argument','Choose an active salesperson');
  tx.update(ref,{nextAction:action,followUp:action.state==='pending'?action.dueDate:'',assignedTo,publicStatus:d.publicStatus,...(d.publicStatus==='closed'?{status:'lost'}:{}),...(customerUpdate?{publicUpdates:[...(lead.publicUpdates??[]),{message:customerUpdate,at:new Date().toISOString()}].slice(-20)}:{}),updatedAt:ts()});
  tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,leadId,'enquiry.next_action',{title:action.title,state:action.state}));
 });return {saved:true};
});
export const manageEnquiryTracking=onCall(async request=>{
 const ctx=contextFrom(request),staff=await requireStaff(ctx),leadId=id(request.data.leadId),token=newTrackingToken();let expiresAt=0;
 if(!['replace','revoke'].includes(request.data.action))throw new HttpsError('invalid-argument','Choose replace or revoke');
 await db.runTransaction(async tx=>{
  await transactionWriteCheck(tx,staff.companyId);const ref=db.doc(`dealer_leads/${leadId}`),lead=owned((await tx.get(ref)).data(),staff.companyId);
  if(lead.trackingHash)tx.delete(db.doc(`dealer_enquiry_access/${lead.trackingHash}`));
  if(request.data.action==='replace')expiresAt=addEnquiryTracking(tx,ref,staff.companyId,token);
  else tx.update(ref,{trackingHash:null,trackingExpiresAt:0});
  tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,leadId,'enquiry.tracking_'+request.data.action));
 });return request.data.action==='replace'?{token,expiresAt}:{revoked:true};
});
export const publicEnquiryTracking=onCall({maxInstances:5},async request=>{
 const hash=trackingHash(validateTrackingToken(request.data?.token));
 const access=(await db.doc(`dealer_enquiry_access/${hash}`).get()).data();
 const unavailable=()=>new HttpsError('not-found','Tracking link unavailable or expired');
 if(!access||access.expiresAt<=Date.now())throw unavailable();
 const [leadSnap,companySnap]=await Promise.all([db.doc(`dealer_leads/${access.leadId}`).get(),db.doc(`companies/${access.companyId}`).get()]);
 const lead=leadSnap.data(),company=companySnap.data();
 if(!lead||lead.companyId!==access.companyId||lead.trackingHash!==hash||!company?.isActive||company.subscription?.status==='suspended')throw unavailable();
 const status=lead.importCaseId?'import_started':['won','lost'].includes(lead.status)?'closed':(lead.quotation?.expiresAt<Date.now()?'quotation_expired':lead.publicStatus)??(lead.supplierVerification?.status==='available'?'verified':'received');
 return {ref:leadRef(access.leadId),dealer:{name:company.name,whatsapp:company.contactWhatsapp??''},vehicle:lead.supplierVehicle?{title:lead.supplierVehicle.title,reference:lead.supplierVehicle.id}:lead.stockTitle?{title:lead.stockTitle}:null,status,quotation:publicQuote(lead.quotation),updates:(lead.publicUpdates??[]).map((u:any)=>({message:u.message,at:u.at})),hasImportCase:!!lead.importCaseId,expiresAt:access.expiresAt};
});
