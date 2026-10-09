import { test, before } from 'node:test';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-vehicle-import';
const {db}=await import('../../src/db.ts');
const {enquireSupplierVehicle,verifySupplierLead,publicImportDealers}=await import('../../src/supplierCatalogue.ts');
const {convertDealerLead}=await import('../../src/dealerJourneys.ts');
const {createCase}=await import('../../src/cases.ts');
const {beforwardSeed}=await import('../../src/beforwardSeed.ts');
const companyId='supplier-test-agency',otherId='supplier-test-other',slug='supplier-test-agency';
const auth={uid:'supplier-test-staff',token:{app_role:'staff',company_id:companyId}};
before(async()=>{
 await db.doc(`companies/${companyId}`).set({isActive:true,name:'Supplier Test Dealer',slug,operationMode:'sourcing',casePrefix:'SUP',contactWhatsapp:'+263771234567',subscription:{version:1,planId:'dealer',status:'active',accessUntil:Date.now()+86400000}});
 await db.doc(`companies/${otherId}`).set({isActive:true,name:'Clearing Only',slug:'supplier-clearing',operationMode:'clearing'});
 await db.doc(`users/${auth.uid}`).set({isActive:true});await db.doc(`staff/${auth.uid}`).set({companyId,isActive:true,role:'staff'});
 await db.doc(`companies/${companyId}/stages/enquiry`).set({enabled:true,position:0,label:'Enquiry'});
 await db.doc('supplier_catalogues/beforward').set({stock:[{...beforwardSeed[0],checkedAt:new Date().toISOString()}]});
});
test('supplier enquiry is server-derived, retry-safe, tenant-owned and verified before case creation',async()=>{
 const requestId=crypto.randomUUID();const request={data:{requestId,slug,supplierVehicleId:beforwardSeed[0].id,name:'Buyer',phone:'+263771111111',preferences:'Quote import',budgetCents:1000000,title:'Forged title'},rawRequest:{ip:'supplier-test-ip'}} as any;
 const first=await enquireSupplierVehicle.run(request);const second=await enquireSupplierVehicle.run(request);
 assert.match(first.ref,/^[0-9A-F]{8}$/);assert.equal(first.ref,second.ref);assert.equal(first.received,true);
 assert.equal(first.dealer.name,'Supplier Test Dealer');assert.equal(first.dealer.slug,slug);assert.equal(first.dealer.whatsapp,'+263771234567');
 const leads=await db.collection('dealer_leads').where('companyId','==',companyId).get();const lead=leads.docs.find(l=>l.data().phone===request.data.phone)!;assert.ok(lead);assert.equal(first.ref,lead.id.slice(0,8).toUpperCase());assert.equal(lead.data().supplierVehicle.title,beforwardSeed[0].title);assert.equal(lead.data().supplierVerification.status,'pending');
 await assert.rejects(verifySupplierLead.run({auth:{uid:auth.uid,token:{app_role:'staff',company_id:otherId}},data:{leadId:lead.id,status:'available',evidence:'Supplier checked'}} as any));
 const conversion=await convertDealerLead.run({auth,data:{leadId:lead.id}} as any);
 const caseRequest={auth,data:{customerId:conversion.customerId,supplierLeadId:lead.id}} as any;
 await assert.rejects(createCase.run(caseRequest),/Confirm supplier availability/);
 await verifySupplierLead.run({auth,data:{leadId:lead.id,status:'available',evidence:'Supplier confirmed reference'}} as any);
 const result=await createCase.run(caseRequest);const supplier=(await db.doc(`import_cases/${result.caseId}/supplier/details`).get()).data()!;assert.equal(supplier.stockReference,beforwardSeed[0].id);assert.equal(supplier.listingUrl,beforwardSeed[0].listingUrl);
 await assert.rejects(createCase.run(caseRequest),/already has an import case/);
 const dealers=await publicImportDealers.run({data:{}} as any);assert.ok(dealers.dealers.some((d:any)=>d.slug===slug));assert.ok(!dealers.dealers.some((d:any)=>d.slug==='supplier-clearing'));
});
test('rejects forged supplier references and invalid dealer choice',async()=>{
 await assert.rejects(enquireSupplierVehicle.run({data:{supplierVehicleId:'UNKNOWN',slug},rawRequest:{ip:'test'}} as any),/expired/);
 await assert.rejects(enquireSupplierVehicle.run({data:{supplierVehicleId:beforwardSeed[0].id,slug:'supplier-clearing'},rawRequest:{ip:'test'}} as any),/not accepting/);
});
