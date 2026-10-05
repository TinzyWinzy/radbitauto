import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck } from './subscriptions.ts';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID, createHash } from 'node:crypto';
import { db } from './db.ts';
import { contextFrom, requireStaff, requireAdmin, requireActiveUser } from './claims.ts';
import { ts } from './audits.ts';
import { text, cents, id, owned } from './dealership.ts';

const hash = (s:string) => createHash('sha256').update(s).digest('hex');
const audit = (companyId:string,actorId:string,entityId:string,action:string,detail:object={}) => ({companyId,actorId,entityType:'dealer_journey',entityId,action,detail,createdAt:ts()});
async function retryClosedTransaction<T>(work:()=>Promise<T>):Promise<T> {
  // A stale Firestore read stream can outlive its transaction during contention.
  // Recreate the entire transaction; the deterministic lead/customer link makes
  // a successful commit safe to retry even if its response was interrupted.
  for(let attempt=0;attempt<3;attempt++) {
    try{return await work();}catch(error){const e=error as {code?:number;message?:string};if(attempt===2||e.code!==3||!e.message?.includes('Transaction is invalid or closed'))throw error;}
  }
  throw new HttpsError('aborted','Retry lead conversion');
}
export const convertDealerLead = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const leadRef = db.collection('dealer_leads').doc(id(d.leadId));
  return retryClosedTransaction(()=>db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const lead = owned((await tx.get(leadRef)).data(),staff.companyId);
    if (lead.customerId) return {customerId:lead.customerId};
    const customerId = d.customerId ? id(d.customerId) : hash(`${staff.companyId}|lead|${leadRef.id}`);
    const ref = db.collection('customers').doc(customerId); const old = await tx.get(ref);
    if (d.customerId) {const c = owned(old.data(),staff.companyId);if(c.isActive !== true) throw new HttpsError('failed-precondition','Customer inactive');}
    else if (!old.exists) tx.create(ref,{companyId:staff.companyId,fullName:lead.name,lastNameLower:lead.name.split(/\s+/).at(-1).toLowerCase(),phoneNumber:lead.phone,isActive:true,createdAt:ts(),leadId:leadRef.id});
    tx.update(leadRef,{customerId,status:'contacted',updatedAt:ts()});
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,leadRef.id,'convert_lead',{customerId}));
    return {customerId};
  }));
});

async function saleAccess(request: CallableRequest, saleId:string) {
  const ctx = contextFrom(request);
  const snap = await db.doc(`dealer_sales/${saleId}`).get();
  const sale = owned(snap.data(),ctx.companyId ?? '');
  if (['admin','staff'].includes(ctx.appRole ?? '')) await requireStaff(ctx, true);
  else {
    await requireActiveUser(ctx.uid);
    const [customer,company] = await Promise.all([db.doc(`customers/${sale.customerId}`).get(),db.doc(`companies/${sale.companyId}`).get()]);
    if(ctx.appRole !== 'customer' || ctx.customerId !== sale.customerId || customer.data()?.userId !== ctx.uid || customer.data()?.isActive !== true || customer.data()?.companyId !== ctx.companyId || company.data()?.isActive !== true) throw new HttpsError('permission-denied','Purchase unavailable');
  }
  return {ctx,sale,snap};
}
export const customerRetailPurchases = onCall(async request => {
  const ctx = contextFrom(request); await requireActiveUser(ctx.uid);
  if(ctx.appRole !== 'customer' || !ctx.customerId || !ctx.companyId) throw new HttpsError('permission-denied','Customer only');
  const [c,company] = await Promise.all([db.doc(`customers/${ctx.customerId}`).get(),db.doc(`companies/${ctx.companyId}`).get()]);
  if(c.data()?.userId !== ctx.uid || c.data()?.isActive !== true || c.data()?.companyId !== ctx.companyId || company.data()?.isActive !== true) throw new HttpsError('permission-denied','Membership unavailable');
  const sales = await db.collection('dealer_sales').where('customerId','==',ctx.customerId).get();
  return {sales:sales.docs.filter(s => s.data().companyId === ctx.companyId).map(s => {const v=s.data();return {id:s.id,title:v.title,status:v.status,agreedPriceCents:v.agreedPriceCents,paidCents:v.paidCents,expiresAt:v.expiresAt};})};
});
export const dealerSaleDetails = onCall(async request => {
  const saleId = id(request.data.saleId); const {sale} = await saleAccess(request,saleId);
  const [entries,documents,company] = await Promise.all([db.collection('dealer_sale_entries').where('saleId','==',saleId).get(),db.collection('dealer_sales_documents').where('saleId','==',saleId).get(),db.doc(`companies/${sale.companyId}`).get()]);
  return {sale:{id:saleId,title:sale.title,vin:sale.vin ?? '',photos:sale.photos ?? [],customerName:sale.customerName,customerId:sale.customerId,status:sale.status,agreedPriceCents:sale.agreedPriceCents,paidCents:sale.paidCents,terms:sale.terms,expiresAt:sale.expiresAt,documentNumber:sale.documentNumber ?? saleId},
    agency:{name:company.data()?.name,whatsapp:company.data()?.contactWhatsapp},
    entries:entries.docs.filter(e=>e.data().companyId===sale.companyId).map(e=>({id:e.id,action:e.data().action,amountCents:e.data().amountCents,evidence:e.data().evidence,date:e.data().createdAt?.toDate?.().toISOString() ?? ''})),
    documents:documents.docs.filter(d=>d.data().companyId===sale.companyId).map(d=>({id:d.id,...d.data().snapshot}))};
});
export const issueDealerSaleDocument = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const kind = text(d.kind,'Document type'); if(!['sale','statement','receipt','handover'].includes(kind)) throw new HttpsError('invalid-argument','Invalid document type');
  const saleRef = db.doc(`dealer_sales/${id(d.saleId)}`);
  const docId = hash(`${staff.companyId}|${saleRef.id}|${kind}|${id(d.requestId)}`); const docRef = db.doc(`dealer_sales_documents/${docId}`);
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [s,existing,company] = await Promise.all([tx.get(saleRef),tx.get(docRef),tx.get(db.doc(`companies/${staff.companyId}`))]); const sale = owned(s.data(),staff.companyId);
    if(existing.exists) return;
    const entry = d.entryId ? await tx.get(db.doc(`dealer_sale_entries/${id(d.entryId)}`)) : null;
    if(kind === 'receipt' && (!entry?.exists || entry.data()?.saleId !== saleRef.id || entry.data()?.companyId !== staff.companyId || !['payment','refund'].includes(entry.data()?.action))) throw new HttpsError('failed-precondition','Choose a confirmed payment or refund entry');
    if(kind === 'handover' && sale.status !== 'delivered') throw new HttpsError('failed-precondition','Complete handover first');
    const handoverEntries=kind==='handover'?await tx.get(db.collection('dealer_sale_entries').where('saleId','==',saleRef.id)):null;
    const handoverEvidence=handoverEntries?.docs.find(e=>e.data().companyId===staff.companyId&&e.data().action==='handover')?.data().evidence ?? '';
    const snapshot = {kind,number:`${company.data()?.casePrefix ?? 'DEAL'}-${kind.toUpperCase()}-${docId.slice(0,16)}`,issuedAt:new Date().toISOString(),agency:company.data()?.name ?? '',agencyWhatsapp:company.data()?.contactWhatsapp ?? '',customer:sale.customerName,customerPhone:sale.customerPhone ?? '',title:sale.title,vin:sale.vin ?? '',handoverEvidence,saleReference:sale.documentNumber ?? saleRef.id,terms:sale.terms,agreedPriceCents:sale.agreedPriceCents,paidCents:sale.paidCents,balanceCents:sale.agreedPriceCents-sale.paidCents,status:sale.status,entry:entry?.exists ? {id:entry.id,action:entry.data()?.action,amountCents:entry.data()?.amountCents,evidence:entry.data()?.evidence} : null};
    tx.create(docRef,{companyId:staff.companyId,customerId:sale.customerId,saleId:saleRef.id,snapshot,createdAt:ts()});
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,saleRef.id,'issue_document',{docId,kind}));
  });return {documentId:docId};
});

export const updateDealerStockDetails = onCall(async request => {
  const ctx = contextFrom(request);const staff = await requireAdmin(ctx);const d = request.data;const ref = db.doc(`dealer_stock/${id(d.stockId)}`);
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const stock = owned((await tx.get(ref)).data(),staff.companyId);
    if(d.askingPriceCents !== undefined && stock.status !== 'available') throw new HttpsError('failed-precondition','Only available stock may be repriced');
    if(d.askingPriceCents !== undefined) tx.update(ref,{askingPriceCents:cents(d.askingPriceCents),location:text(d.location,'Location'),updatedAt:ts()});
    if(d.acquisitionCents !== undefined) tx.set(db.doc(`dealer_costs/${ref.id}`),{companyId:staff.companyId,acquisitionCents:cents(d.acquisitionCents),directCostsCents:cents(d.directCostsCents),complete:d.complete === true,updatedAt:ts()},{merge:true});
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,ref.id,'update_stock_costs',{reason:text(d.reason,'Reason'),acquisitionCents:d.acquisitionCents ?? null,directCostsCents:d.directCostsCents ?? null,askingPriceCents:d.askingPriceCents ?? null}));
  });return {stockId:ref.id};
});

export const ACQUISITION_STAGES = ['selected','purchased','shipped','arrived','cleared','prepared','stocked'] as const;
export const createDealerAcquisition = onCall(async request => {
  const ctx = contextFrom(request);const staff = await requireAdmin(ctx);const d=request.data;const vehicleId=id(d.vehicleId);const ref=db.doc(`dealer_acquisitions/${vehicleId}`);
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [v,a,s] = await Promise.all([tx.get(db.doc(`vehicles/${vehicleId}`)),tx.get(ref),tx.get(db.doc(`dealer_stock/${vehicleId}`))]); const vehicle=owned(v.data(),staff.companyId);
    if(a.exists || s.exists || vehicle.customerIds?.length) throw new HttpsError('failed-precondition','Vehicle already allocated');
    const supplierUrl=text(d.supplierUrl,'Supplier link',true); if(supplierUrl && !/^https:\/\//.test(supplierUrl)) throw new HttpsError('invalid-argument','Use an HTTPS supplier link');
    const lock = await capacityCheck(tx, staff.companyId, { vehicleKey: `vehicle:${vehicleId}` }); lock();
    tx.create(ref,{companyId:staff.companyId,vehicleId,title:`${vehicle.year} ${vehicle.make} ${vehicle.model}`,stage:'selected',supplier:text(d.supplier,'Supplier'),supplierUrl,supplierReference:text(d.supplierReference,'Supplier reference'),purchaseCents:0,directCostsCents:0,costsComplete:false,createdAt:ts(),updatedAt:ts()});
    tx.update(v.ref,{allocation:'dealer_acquisition'});
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,ref.id,'create_acquisition'));
  });return {acquisitionId:ref.id};
});
export const updateDealerAcquisition = onCall(async request => {
  const ctx=contextFrom(request);const staff=await requireAdmin(ctx);const d=request.data;const ref=db.doc(`dealer_acquisitions/${id(d.acquisitionId)}`);const key=id(d.requestId);const entryRef=ref.collection('events').doc(key);
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [a,old] = await Promise.all([tx.get(ref),tx.get(entryRef)]);const acq=owned(a.data(),staff.companyId);
    if(old.exists) {if(old.data()?.action!==d.action || old.data()?.amountCents!==(d.amountCents ?? 0))throw new HttpsError('already-exists','Request already used');return;}
    if(acq.stage==='stocked')throw new HttpsError('failed-precondition','Acquisition is already in stock');
    const evidence=text(d.evidence,'Evidence / reference');
    if(d.action==='cost') {
      const amount=cents(d.amountCents);if(!amount)throw new HttpsError('invalid-argument','Positive cost required');
      const category=text(d.category,'Cost category');if(!['purchase','freight','customs','preparation','other'].includes(category))throw new HttpsError('invalid-argument','Invalid cost category');
      tx.update(ref,{purchaseCents:acq.purchaseCents+(category==='purchase'?amount:0),directCostsCents:acq.directCostsCents+(category==='purchase'?0:amount),costsComplete:false,updatedAt:ts()});
      tx.create(entryRef,{action:'cost',category,amountCents:amount,evidence,actorId:ctx.uid,createdAt:ts()});
    } else if(d.action==='advance') {
      const next=ACQUISITION_STAGES[ACQUISITION_STAGES.indexOf(acq.stage)+1];if(next==='stocked'||!next)throw new HttpsError('failed-precondition','Use transfer into stock after preparation');
      if(next==='purchased' && acq.purchaseCents<=0)throw new HttpsError('failed-precondition','Record the actual purchase cost first');
      tx.update(ref,{stage:next,updatedAt:ts()});tx.create(entryRef,{action:'advance',stage:next,amountCents:0,evidence,actorId:ctx.uid,createdAt:ts()});
    } else if(d.action==='transfer') {
      const [stock,vehicle] = await Promise.all([tx.get(db.doc(`dealer_stock/${ref.id}`)),tx.get(db.doc(`vehicles/${ref.id}`))]);
      if(acq.stage!=='prepared'||stock.exists||vehicle.data()?.customerIds?.length||d.costsComplete!==true)throw new HttpsError('failed-precondition','Prepared acquisition and complete actual costs required');
      tx.create(stock.ref,{companyId:staff.companyId,vehicleId:ref.id,title:acq.title,vin:vehicle.data()?.vinChassisUpper,ownership:'owned',status:'available',activeSaleId:null,location:text(d.location,'Location'),askingPriceCents:cents(d.askingPriceCents),acquisitionId:ref.id,createdAt:ts(),updatedAt:ts()});
      tx.set(db.doc(`dealer_costs/${ref.id}`),{companyId:staff.companyId,acquisitionCents:acq.purchaseCents,directCostsCents:acq.directCostsCents,complete:true,acquisitionId:ref.id,updatedAt:ts()});
      tx.update(vehicle.ref,{allocation:'dealer_stock'});
      tx.update(ref,{stage:'stocked',costsComplete:true,updatedAt:ts()});tx.create(entryRef,{action:'transfer',amountCents:0,evidence,actorId:ctx.uid,createdAt:ts()});
    } else throw new HttpsError('invalid-argument','Invalid acquisition action');
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,ref.id,`acquisition_${d.action}`,{evidence}));
  });return {acquisitionId:ref.id};
});
export const dealerAcquisitionDetails = onCall(async request => {
  const staff=await requireAdmin(contextFrom(request), true);const ref=db.doc(`dealer_acquisitions/${id(request.data.acquisitionId)}`);owned((await ref.get()).data(),staff.companyId);const events=await ref.collection('events').get();return {events:events.docs.map(e=>({id:e.id,...e.data()}))};
});

export const attachDealerStockPhoto = onCall(async request => {
  const ctx=contextFrom(request);const staff=await requireStaff(ctx);const d=request.data;const stockId=id(d.stockId);const path=text(d.path,'Photo path');
  if(!new RegExp(`^stock-photos/${staff.companyId}/${stockId}/[A-Za-z0-9_-]{10,100}$`).test(path))throw new HttpsError('invalid-argument','Invalid stock photo path');
  const file=getStorage().bucket('studio-285787437-bc95b.firebasestorage.app').file(path);const [metadata]=await file.getMetadata();
  if(Number(metadata.size)>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(metadata.contentType ?? ''))throw new HttpsError('invalid-argument','Use a JPEG, PNG or WebP under 5 MB');
  const [bytes]=await file.download({start:0,end:15});const mime=metadata.contentType;
  if(!(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216 || mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw new HttpsError('invalid-argument','Photo content does not match its type');
  const token=String(metadata.metadata?.firebaseStorageDownloadTokens??'').split(',')[0] || randomUUID();await file.setMetadata({metadata:{firebaseStorageDownloadTokens:token}});
  const host=process.env.STORAGE_EMULATOR_HOST ? `http://${process.env.STORAGE_EMULATOR_HOST.replace(/^https?:\/\//,'')}` : 'https://firebasestorage.googleapis.com';
  const url=`${host}/v0/b/${file.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  await db.runTransaction(async tx=>{const ref=db.doc(`dealer_stock/${stockId}`);const stock=owned((await tx.get(ref)).data(),staff.companyId);const photos=stock.photos??[];if(photos.includes(url))return;if(photos.length>=8)throw new HttpsError('failed-precondition','Maximum eight photos');tx.update(ref,{photos:[...photos,url],updatedAt:ts()});});return {url};
});

export const recordImportDealResult = onCall(async request=>{
  const ctx=contextFrom(request);const staff=await requireAdmin(ctx);const d=request.data;const caseId=id(d.caseId);const ref=db.doc(`import_deal_results/${hash(`${staff.companyId}|${id(d.requestId)}`)}`);
  await db.runTransaction(async tx=>{
    await transactionWriteCheck(tx, staff.companyId);
    const [c,old]=await Promise.all([tx.get(db.doc(`import_cases/${caseId}`)),tx.get(ref)]);owned(c.data(),staff.companyId);
    if(old.exists){if(old.data()?.caseId!==caseId||old.data()?.requestKind!==d.kind||old.data()?.requestAmount!==(d.amountCents??0))throw new HttpsError('already-exists','Request key already used');return;}
    if(!['fee_earned','dealer_expense','reverse'].includes(d.kind))throw new HttpsError('invalid-argument','Invalid financial event');
    let kind=d.kind;let amount=cents(d.amountCents??0);let reversedEntryId:string|null=null;
    if(kind==='reverse'){
      const target=db.doc(`import_deal_results/${id(d.entryId)}`);const event=owned((await tx.get(target)).data(),staff.companyId);
      if(event.caseId!==caseId||event.reversedBy||event.amountCents<=0)throw new HttpsError('failed-precondition','Entry unavailable for reversal');
      kind=event.kind;amount=-event.amountCents;reversedEntryId=target.id;tx.update(target,{reversedBy:ref.id});
    }else if(!amount)throw new HttpsError('invalid-argument','Positive amount required');
    tx.create(ref,{companyId:staff.companyId,caseId,kind,requestKind:d.kind,requestAmount:d.amountCents??0,amountCents:amount,reversedEntryId,evidence:text(d.evidence,'Earned fee / dealer expense evidence'),actorId:ctx.uid,createdAt:ts()});
    tx.create(db.collection('audit_log').doc(),audit(staff.companyId,ctx.uid,caseId,'import_deal_result',{kind,amountCents:amount}));
  });return {entryId:ref.id};
});
export const importDealResults = onCall(async request=>{
  const staff=await requireAdmin(contextFrom(request), true);const [cases,events]=await Promise.all([db.collection('import_cases').where('companyId','==',staff.companyId).get(),db.collection('import_deal_results').where('companyId','==',staff.companyId).get()]);
  return {cases:cases.docs.map(c=>({id:c.id,caseNum:c.data().caseNum,stage:c.data().currentStage})),events:events.docs.map(e=>({id:e.id,...e.data()}))};
});
