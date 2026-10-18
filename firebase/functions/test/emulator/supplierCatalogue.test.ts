import { test, before } from 'node:test';
import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.GCLOUD_PROJECT='demo-vehicle-import';
const {db}=await import('../../src/db.ts');
const {sourceSupplierVehicle,supplierCatalogueStatus,refreshSupplierCatalogue,enquireSupplierVehicle,verifySupplierLead,publicImportDealers}=await import('../../src/supplierCatalogue.ts');
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
 // Hermetic tax configuration: other emulator files seed minimal global sets, so replace any
 // existing sets with one complete global set before the landed estimate is computed.
 const taxSets=await db.collection('config').doc('tax_rates').collection('sets').get();
 await Promise.all(taxSets.docs.map(d=>d.ref.delete()));
 await db.collection('config').doc('tax_rates').collection('sets').doc('supplier-test').set({scope:'all',effectiveFrom:'2024-01-01',vatPct:15.5,surtaxThresholdYears:5,surtaxPct:35,dutyRates:{sedan_station_wagon:40,pickup_up_to_800kg:25,pickup_801_to_1400kg:40,pickup_over_1400kg:40,double_cab:60},carbonTaxBands:[{fromCc:0,toCc:1500,amountCents:600},{fromCc:1501,toCc:2000,amountCents:1100},{fromCc:2001,toCc:3000,amountCents:1500},{fromCc:3001,amountCents:3000}],createdAt:'2024-01-01T00:00:00.000Z'});
});
test('supplier enquiry is server-derived, retry-safe, tenant-owned and verified before case creation',async()=>{
 const requestId=crypto.randomUUID();const request={data:{requestId,trackingToken:'f'.repeat(64),slug,supplierVehicleId:beforwardSeed[0].id,name:'Buyer',phone:'+263771111111',preferences:'Quote import',budgetCents:1000000,title:'Forged title'},rawRequest:{ip:'supplier-test-ip'}} as any;
 const first=await enquireSupplierVehicle.run(request);const second=await enquireSupplierVehicle.run(request);
 assert.match(first.ref,/^[0-9A-F]{8}$/);assert.equal(first.ref,second.ref);assert.equal(first.received,true);assert.equal(first.trackingToken,'f'.repeat(64));assert.equal(second.trackingToken,first.trackingToken);
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

test('dealer sourcing uses owned customer data, ignores forged vehicle data and is retry-safe',async()=>{
 await db.doc('customers/sourcing-owned').set({companyId,fullName:'Existing Buyer',phoneNumber:'+263771222222',isActive:true});
 await db.doc('customers/sourcing-foreign').set({companyId:otherId,fullName:'Other Buyer',phoneNumber:'private',isActive:true});
 const req={auth,data:{requestId:crypto.randomUUID(),supplierVehicleId:beforwardSeed[0].id,customerId:'sourcing-owned',name:'Forged',phone:'Forged',title:'Forged'},rawRequest:{}} as any;
 const a=await sourceSupplierVehicle.run(req),b=await sourceSupplierVehicle.run(req);assert.equal(a.leadId,b.leadId);
 const lead=(await db.doc('dealer_leads/'+a.leadId).get()).data()!;
 assert.equal(lead.name,'Existing Buyer');assert.equal(lead.phone,'+263771222222');assert.equal(lead.customerId,'sourcing-owned');assert.equal(lead.supplierVehicle.title,beforwardSeed[0].title);assert.equal(lead.supplierVerification.status,'pending');
 await assert.rejects(sourceSupplierVehicle.run({...req,data:{...req.data,requestId:crypto.randomUUID(),customerId:'sourcing-foreign'}}));
 await assert.rejects(sourceSupplierVehicle.run({...req,auth:undefined}));
 await assert.rejects(supplierCatalogueStatus.run({auth,data:{}} as any));
 await assert.rejects(refreshSupplierCatalogue.run({auth,data:{}} as any));
 const fresh=await sourceSupplierVehicle.run({auth,data:{requestId:crypto.randomUUID(),supplierVehicleId:beforwardSeed[0].id,name:'Walk-in Buyer',phone:'+263771333333'},rawRequest:{}} as any);
 assert.equal((await db.doc('dealer_leads/'+fresh.leadId).get()).data()?.customerId,null);
});

test('failed refresh preserves inventory, exposes admin diagnostics and blocks overlapping refreshes',async t=>{
 const uid='supplier-platform-test';await db.doc('users/'+uid).set({isActive:true});await db.doc('platform_admins/'+uid).set({isActive:true});
 const req={auth:{uid,token:{platform_admin:true,app_role:'platform_admin'}},data:{}} as any;
 const ref=db.doc('supplier_catalogues/beforward'),before=(await ref.get()).data()!.stock;
 t.mock.method(globalThis,'fetch',async()=>new Response('<title>Supplier maintenance</title>'));
 await assert.rejects(refreshSupplierCatalogue.run(req),/No usable USD listings/);
 assert.deepEqual((await ref.get()).data()!.stock,before);
 const status=await supplierCatalogueStatus.run(req);assert.equal(status.status,'failed');assert.equal(status.consecutiveFailures,1);assert.match(status.lastError,/Supplier maintenance/);
 await ref.update({refreshLockUntil:Date.now()+60000});
 await assert.rejects(refreshSupplierCatalogue.run(req),/already running/);
 await ref.update({refreshLockUntil:0});
});
