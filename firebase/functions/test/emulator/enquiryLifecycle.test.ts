import {test,before} from 'node:test';import assert from 'node:assert/strict';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.GCLOUD_PROJECT='demo-vehicle-import';
const {db}=await import('../../src/db.ts');
const {issueEnquiryQuotation,dealerEnquiryDetails,saveEnquiryPrivateCosts,updateEnquiryAction,manageEnquiryTracking,publicEnquiryTracking}=await import('../../src/enquiryLifecycle.ts');
const {createCase}=await import('../../src/cases.ts');
const {trackingHash}=await import('../../src/enquiryAccess.ts');
const companyId='lifecycle-company',leadId='lifecycle-lead',admin={uid:'lifecycle-owner',token:{app_role:'admin',company_id:companyId}},staff={uid:'lifecycle-staff',token:{app_role:'staff',company_id:companyId}},foreign={uid:'lifecycle-other',token:{app_role:'admin',company_id:'other-lifecycle'}};
const req=(auth:any,data:any)=>({auth,data}) as any;
const quote=()=>({leadId,requestId:crypto.randomUUID(),charges:{vehicle:500000,shipping:100000,insurance:10000,duties:200000,clearing:30000,delivery:50000,dealerFee:60000},validUntil:new Date(Date.now()+86400000*7).toISOString().slice(0,10),route:'Japan via Durban',inclusions:'Listed charges',exclusions:'Unlisted costs',taxBasis:'Practitioner estimate',taxStatus:'estimate'});
before(async()=>{
 for(const [id,company,role]of [[admin.uid,companyId,'admin'],[staff.uid,companyId,'staff'],[foreign.uid,'other-lifecycle','admin']]){await db.doc('users/'+id).set({isActive:true});await db.doc('staff/'+id).set({companyId:company,role,isActive:true});}
 for(const c of [companyId,'other-lifecycle'])await db.doc('companies/'+c).set({name:'Lifecycle Dealer',isActive:true,casePrefix:'LIF',contactWhatsapp:'+263771234567',subscription:{version:1,planId:'dealer',status:'active',accessUntil:Date.now()+86400000}});
 await db.doc('companies/'+companyId+'/stages/enquiry').set({enabled:true,position:0,label:'Enquiry'});
 await db.doc('customers/lifecycle-buyer').set({companyId,isActive:true,fullName:'Secret Buyer',phoneNumber:'Secret phone'});
 await db.doc('dealer_leads/'+leadId).set({companyId,name:'Secret Buyer',phone:'Secret phone',preferences:'Internal negotiation notes',customerId:'lifecycle-buyer',status:'new',interest:'import',followUp:'',supplierVehicle:{id:'CE123456',title:'Toyota Aqua'},supplierVerification:{status:'available',verifiedAt:new Date().toISOString()}});
});
test('quotation revisions are retry-safe and private costs never reach staff or customer projections',async()=>{
 await db.doc('dealer_leads/'+leadId).update({supplierVerification:{status:'pending'}});await assert.rejects(issueEnquiryQuotation.run(req(staff,quote())),/Verify supplier/);await db.doc('dealer_leads/'+leadId).update({supplierVerification:{status:'available',verifiedAt:new Date().toISOString()}});
 const d=quote(),a=await issueEnquiryQuotation.run(req(staff,d)),b=await issueEnquiryQuotation.run(req(staff,d));assert.equal(a.quoteId,b.quoteId);
 const details=await dealerEnquiryDetails.run(req(admin,{leadId}));assert.equal(details.lead.quotation.totalCents,950000);assert.equal(details.quotations.length,1);assert.equal(details.lead.followUp,details.reminder.dueDate);
 await saveEnquiryPrivateCosts.run(req(admin,{leadId,quoteId:a.quoteId,expectedCostCents:812345,costsComplete:true}));
 assert.equal((await dealerEnquiryDetails.run(req(admin,{leadId}))).privateReview?.marginCents,137655);
 const staffDetails=await dealerEnquiryDetails.run(req(staff,{leadId}));assert.equal(staffDetails.privateReview,null);assert.ok(!JSON.stringify(staffDetails).includes('812345'));
 await assert.rejects(saveEnquiryPrivateCosts.run(req(staff,{leadId,quoteId:a.quoteId,expectedCostCents:0,costsComplete:true})));
 await assert.rejects(issueEnquiryQuotation.run(req(foreign,quote())));
 await assert.rejects(dealerEnquiryDetails.run(req(foreign,{leadId})));
 await assert.rejects(issueEnquiryQuotation.run(req(undefined,quote())));
 await assert.rejects(issueEnquiryQuotation.run(req(staff,{...quote(),privateCosts:{expectedCostCents:800000,costsComplete:true}})),/Only the owner/);
 const second=await issueEnquiryQuotation.run(req(admin,{...quote(),privateCosts:{expectedCostCents:800000,costsComplete:true}}));assert.notEqual(second.quoteId,a.quoteId);assert.equal((await dealerEnquiryDetails.run(req(admin,{leadId}))).lead.quotation.version,2);assert.equal((await dealerEnquiryDetails.run(req(admin,{leadId}))).privateReview?.marginCents,150000);
});
test('follow-up updates are validated and only deliberate public content is exposed',async()=>{
 await updateEnquiryAction.run(req(staff,{leadId,title:'Internal call about margin',dueDate:'2020-01-01',responsible:'agency',state:'pending',assignedTo:staff.uid,publicStatus:'awaiting_customer',customerUpdate:'We have prepared your quotation.'}));
 const detail=await dealerEnquiryDetails.run(req(admin,{leadId}));assert.equal(detail.reminder.overdue,true);
 await assert.rejects(updateEnquiryAction.run(req(staff,{leadId,title:'Call',dueDate:'2026-02-30',responsible:'agency',state:'pending',publicStatus:'received'})));
 await assert.rejects(updateEnquiryAction.run(req(staff,{leadId,title:'Call',dueDate:'',responsible:'agency',state:'pending',publicStatus:'received',assignedTo:foreign.uid})));
});
test('tracking tokens are hashed, scoped, expiring and revocable, without contact or internal data',async()=>{
 const first=await manageEnquiryTracking.run(req(staff,{leadId,action:'replace'}));assert.ok('token'in first);const token=(first as any).token;
 const publicData=await publicEnquiryTracking.run(req(undefined,{token}));const raw=JSON.stringify(publicData);
 assert.equal(publicData.quotation?.totalCents,950000);for(const secret of ['Secret Buyer','Secret phone','Internal negotiation','Internal call','expectedCostCents','trackingHash'])assert.ok(!raw.includes(secret));
 assert.ok(raw.includes('We have prepared your quotation'));
 assert.ok(!(JSON.stringify((await db.doc('dealer_leads/'+leadId).get()).data())).includes(token));
 const second=await manageEnquiryTracking.run(req(admin,{leadId,action:'replace'}));await assert.rejects(publicEnquiryTracking.run(req(undefined,{token})));
 const token2=(second as any).token;await db.doc('dealer_enquiry_access/'+trackingHash(token2)).update({expiresAt:Date.now()-1});await assert.rejects(publicEnquiryTracking.run(req(undefined,{token:token2})));
 const third=await manageEnquiryTracking.run(req(admin,{leadId,action:'replace'}));await manageEnquiryTracking.run(req(staff,{leadId,action:'revoke'}));await assert.rejects(publicEnquiryTracking.run(req(undefined,{token:(third as any).token})));
 await assert.rejects(manageEnquiryTracking.run(req(foreign,{leadId,action:'replace'})));await assert.rejects(publicEnquiryTracking.run(req(undefined,{token:'bad'})));
});
test('case conversion preserves the proposal and tracking handoff without changing case balances',async()=>{
 const link=await manageEnquiryTracking.run(req(admin,{leadId,action:'replace'}));
 const created=await createCase.run(req(admin,{customerId:'lifecycle-buyer',enquiryLeadId:leadId}));
 const c=(await db.doc('import_cases/'+created.caseId).get()).data()!;assert.equal(c.enquiryQuotation.totalCents,950000);assert.equal(c.balanceDueCents,0);assert.equal(c.quotationVersion,0);
 const p=await publicEnquiryTracking.run(req(undefined,{token:(link as any).token}));assert.equal(p.status,'import_started');assert.equal(p.hasImportCase,true);
 await assert.rejects(createCase.run(req(admin,{customerId:'lifecycle-buyer',enquiryLeadId:leadId})),/already has/);
});
