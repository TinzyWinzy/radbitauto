import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError,onCall } from 'firebase-functions/v2/https';
import { contextFrom,requireAdmin } from './claims.ts';
import { db } from './db.ts';
import { ts } from './audits.ts';
import { normalizeVehicleIdentifier } from './vehicleIdentifier.ts';
import { VEHICLE_CATEGORIES } from './constants.ts';
const hash=(s:string,algorithm='sha256')=>createHash(algorithm).update(s).digest('hex');
const text=(v:unknown,field:string,max=150)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Error(`${field} is required (maximum ${max} characters)`);return v.trim();};
export function importPhone(value:unknown){const raw=text(value,'Phone',25);let phone=raw.replace(/[ ()-]/g,'');if(/^0[1678]\d{8}$/.test(phone))phone=`+263${phone.slice(1)}`;if(/^263\d{9}$/.test(phone))phone=`+${phone}`;if(!/^\+\d{7,15}$/.test(phone))throw new Error('Use +country code or a Zimbabwe local number starting 0; format phone columns as text');return phone;}
export function importMoney(value:unknown,required=false):number|null{const raw=String(value??'').trim();if(!raw){if(required)throw new Error('Asking price is required');return null;}const normalized=raw.replace(/^USD\s*|^\$\s*/i,'');if(!/^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/.test(normalized))throw new Error('Use USD amounts with up to two decimals (e.g. 7,500.00)');const cents=Math.round(Number(normalized.replaceAll(',',''))*100);if(!Number.isSafeInteger(cents)||cents>10000000000)throw new Error('Amount is too large');if(required&&cents<=0)throw new Error('Asking price must be positive');return cents;}
export const bulkImportRecords=onCall({timeoutSeconds:300},async request=>{
 const ctx=contextFrom(request),owner=await requireAdmin(ctx);const {kind,mode,rows}=request.data;
 if(!['customers','stock'].includes(kind)||!['preview','commit'].includes(mode)||!Array.isArray(rows)||!rows.length||rows.length>100)throw new HttpsError('invalid-argument','Choose customers or stock; import 1–100 rows at a time');
 const customerSnapshot=kind==='customers'?await db.collection('customers').where('companyId','==',owner.companyId).limit(5000).get():null;
 if(customerSnapshot?.size===5000)throw new HttpsError('resource-exhausted','This agency requires a larger-volume assisted import');
 const existingCustomers=new Set(customerSnapshot?.docs.map(d=>{const c=d.data();try{return `${String(c.fullName).trim().toLowerCase().replace(/\s+/g,' ')}|${importPhone(c.phoneNumber)}`;}catch{return '';}}));
 const seen=new Set<string>();const results:Record<string,unknown>[]=[];
 for(let index=0;index<rows.length;index++){
  const row=rows[index];const rowNumber=Number.isInteger(row?.rowNumber)?row.rowNumber:index+1;
  try{
   if(!row||typeof row!=='object')throw new Error('Invalid row');
   let key:string;let vehicle:Record<string,unknown>|undefined;let customer:Record<string,unknown>|undefined;let stock:Record<string,unknown>|undefined;let cost:Record<string,unknown>|undefined;
   if(kind==='customers'){
    const name=text(row.fullName,'Customer name');const phone=importPhone(row.phoneNumber);const fingerprint=`${name.toLowerCase().replace(/\s+/g,' ')}|${phone}`;key=hash(`${owner.companyId}|bulk-customer|${fingerprint}`);
    if(existingCustomers.has(fingerprint)){results.push({rowNumber,status:'duplicate',message:'Customer name and phone already exist'});continue;}
    customer={companyId:owner.companyId,fullName:name,lastNameLower:name.split(/\s+/).at(-1)!.toLowerCase(),phoneNumber:phone,isActive:true,createdAt:ts()};
   }else{
    const vin=normalizeVehicleIdentifier(text(row.vinChassis,'VIN / chassis'));key=hash(`${owner.companyId}|${vin}`,'sha1');const make=text(row.make,'Make',80),model=text(row.model,'Model',80);const year=Number(text(row.year,'Year'));
    if(!Number.isInteger(year)||year<1960||year>new Date().getFullYear()+1)throw new Error('Year must be between 1960 and next year');
    const category=text(row.category,'Vehicle category');if(!VEHICLE_CATEGORIES.includes(category as typeof VEHICLE_CATEGORIES[number]))throw new Error('Choose a supported vehicle category');
    const ownership=String(row.ownership||'owned').trim().toLowerCase();if(!['owned','consigned'].includes(ownership))throw new Error('Ownership must be owned or consigned');
    const asking=importMoney(row.askingPrice,true)!;const acquisition=importMoney(row.acquisitionCost);const direct=importMoney(row.directCosts);
    const complete=String(row.costsComplete??'').trim().toLowerCase();if(complete&&!['yes','no','true','false'].includes(complete))throw new Error('Costs complete must be yes or no');if(['yes','true'].includes(complete)&&(acquisition===null||direct===null))throw new Error('Complete costs require acquisition/settlement and direct costs; enter explicit 0 if none');
    vehicle={companyId:owner.companyId,customerIds:[],vinChassisUpper:vin,make,model,year,category,sourceCountry:'',purchasePriceCents:ownership==='owned'?acquisition:null,eaaStatus:'none',isCommercial:false,exemptionFlag:'none',importLicenceRequired:false,allocation:'dealer_stock',createdAt:ts()};
    stock={companyId:owner.companyId,vehicleId:key,title:`${year} ${make} ${model}`,vin,askingPriceCents:asking,ownership,location:text(row.location,'Location'),status:'available',activeSaleId:null,published:false,photos:[],createdAt:ts(),updatedAt:ts()};
    cost={companyId:owner.companyId,acquisitionCents:acquisition,directCostsCents:direct,complete:['yes','true'].includes(complete),updatedAt:ts()};
   }
   if(seen.has(key)){results.push({rowNumber,status:'duplicate',message:'Repeated row in this file'});continue;}seen.add(key);
   const ref=db.doc(`${kind==='customers'?'customers':'vehicles'}/${key}`);
   const status=await db.runTransaction(async txn=>{
    await transactionWriteCheck(txn, owner.companyId);
    const found=await txn.get(ref);if(found.exists)return 'duplicate';
    const lock = !customer ? await capacityCheck(txn, owner.companyId, { vehicleKey: `vehicle:${key}` }) : null;
    if(mode==='preview')return 'ready';
    lock?.();
    if(customer)txn.create(ref,customer);else{txn.create(ref,vehicle!);txn.create(db.doc(`dealer_stock/${key}`),stock!);txn.create(db.doc(`dealer_costs/${key}`),cost!);}
    txn.create(db.collection('audit_log').doc(),{companyId:owner.companyId,actorId:ctx.uid,entityType:kind,entityId:key,action:'bulk_import',detail:{rowNumber},createdAt:ts()});return 'imported';
   });
   const summary=customer?`${customer.fullName} · ${customer.phoneNumber}`:`${stock!.title} · ${stock!.vin} · USD ${(Number(stock!.askingPriceCents)/100).toFixed(2)} · ${stock!.location} · ${stock!.ownership} · Acquisition/settlement: ${cost!.acquisitionCents===null?'not recorded':`USD ${(Number(cost!.acquisitionCents)/100).toFixed(2)}`} · Direct costs: ${cost!.directCostsCents===null?'not recorded':`USD ${(Number(cost!.directCostsCents)/100).toFixed(2)}`} · Costs complete: ${cost!.complete?'yes':'no'}`;
   results.push({rowNumber,status,recordId:key,summary,message:status==='duplicate'?'Record already exists; existing data kept':kind==='stock'&&cost?.acquisitionCents===null?'Acquisition/settlement cost not recorded':kind==='stock'&&cost?.directCostsCents===null?'Direct costs not recorded':''});
  }catch(e){results.push({rowNumber,status:'error',message:(e as Error).message});}
 }
 return {results};
});

