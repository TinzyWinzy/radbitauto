import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const PROJECT_ID = 'demo-vehicle-import';
process.env.GCLOUD_PROJECT ??= PROJECT_ID;

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

interface CallableRequest {
  data: Record<string, unknown>;
  auth?: { uid: string; token: Record<string, string | boolean> };
}

type CallableFn = {
  run: (request: CallableRequest) => Promise<Record<string, unknown>>;
};

const STAFF_A = { uid: 'staffA', token: { app_role: 'staff', company_id: 'A' } };
const STAFF_B = { uid: 'staffB', token: { app_role: 'staff', company_id: 'B' } };
const PLATFORM_A = { uid: 'adminA', token: { app_role: 'platform_admin', platform_admin: true } };

function callAs(fn: CallableFn, staff: { uid: string; token: Record<string, string | boolean> }) {
  return async (data: Record<string, unknown>): Promise<Record<string, unknown>> =>
    fn.run({ data, auth: { uid: staff.uid, token: staff.token } });
}

const createCase = (await import('../../src/cases.ts')).createCase as unknown as CallableFn;
const advanceImportStage = (await import('../../src/cases.ts')).advanceImportStage as unknown as CallableFn;
const createVehicle = (await import('../../src/vehicles.ts')).createVehicle as unknown as CallableFn;
const issueQuotation = (await import('../../src/quotations.ts')).issueQuotation as unknown as CallableFn;
const recordPayment = (await import('../../src/payments.ts')).recordPayment as unknown as CallableFn;
const confirmPayment = (await import('../../src/payments.ts')).confirmPayment as unknown as CallableFn;
const verifyDocument = (await import('../../src/documents.ts')).verifyDocument as unknown as CallableFn;
const linkCustomer = (await import('../../src/bootstrap.ts')).linkCustomer as unknown as CallableFn;
const bootstrapCompany = (await import('../../src/bootstrap.ts')).bootstrapCompany as unknown as CallableFn;
const backfillVehicleCustomers = (await import('../../src/platform.ts')).backfillVehicleCustomers as unknown as CallableFn;
const claimPlatformAdmin = (await import('../../src/platform.ts')).claimPlatformAdmin as unknown as CallableFn;

const DEFAULT_TAX_RATE_SET = (await import('../../src/constants.ts')).DEFAULT_TAX_RATE_SET;
const attachCaseVehicle = (await import('../../src/cases.ts')).attachCaseVehicle as unknown as CallableFn;
const createCustomerRecord = (await import('../../src/customers.ts')).createCustomerRecord as unknown as CallableFn;
const registerAgency = (await import('../../src/registration.ts')).registerAgency as unknown as CallableFn;
const operations = await import('../../src/operations.ts');
const correctPaymentA = callAs(operations.correctPayment as unknown as CallableFn, STAFF_A);
const reportA = callAs(operations.agencyReport as unknown as CallableFn, STAFF_A);

describe('production finance, reporting and invitation boundaries', () => {
  it('dashboard totals and attention stay agency-wide and never return another tenant case', async () => {
    const overview = callAs(operations.dashboardOverview as unknown as CallableFn, STAFF_A);
    await db.doc('import_cases/task-a').set({ companyId: 'A', caseNum: 'A-TASK', quotationVersion: 0, currentStage: 'enquiry', vehicleId: '', balanceDueCents: 10000 });
    await db.doc('import_cases/delivered-a').set({ companyId: 'A', caseNum: 'A-DONE', quotationVersion: 1, currentStage: 'delivered', balanceDueCents: 0 });
    await db.doc('import_cases/task-b').set({ companyId: 'B', caseNum: 'B-PRIVATE', quotationVersion: 0, currentStage: 'enquiry', balanceDueCents: 90000 });
    await db.doc('payments/pending-a').set({ companyId: 'A', caseId: 'task-a', status: 'pending', amountCents: 100 });
    await db.doc('import_cases/task-a/documents/pending-doc').set({ companyId: 'A', verified: false, storageValid: true, docType: 'BillOfLading' });
    await db.doc('import_cases/task-b/documents/foreign-doc').set({ companyId: 'B', verified: false, storageValid: true });
    const result = await overview({});
    assert.equal(result.cases, 2); assert.equal(result.activeCases, 1); assert.equal(result.outstandingCents, 10000); assert.equal(result.attentionCount, 3);
    assert.equal((result.tasks as {caseNum:string}[]).length, 3);
    assert.ok((result.tasks as {caseNum:string}[]).every(task => task.caseNum === 'A-TASK'));
    await assert.rejects(callAs(operations.dashboardOverview as unknown as CallableFn, {uid:'uA', token:{app_role:'customer',company_id:'A',customer_id:'custA'}})({}), {code:'permission-denied'});
  });
  it('platform subscription controls enforce USD and suspend then restore agency access', async () => {
    const configure = callAs(operations.setAgencyAccess as unknown as CallableFn, PLATFORM_A);
    await assert.rejects(callAs(operations.setAgencyAccess as unknown as CallableFn, STAFF_A)({ companyId: 'A', status: 'active', monthlyCents: 2500 }), { code: 'permission-denied' });
    await configure({ companyId: 'A', status: 'suspended', planId:'dealer', accessUntil:Date.now()+86400000, invoiceReference: 'INV-001' });
    const company = (await db.doc('companies/A').get()).data()!;
    assert.equal(company.subscription.currency, 'USD'); assert.equal(company.isActive, false);
    assert.equal(company.subscription.invoiceReference,undefined);assert.equal((await db.doc('agency_billing/A').get()).data()?.invoiceReference,'INV-001');
    await assert.rejects(reportA({}), { code: 'permission-denied' });
    await configure({ companyId: 'A', status: 'active', planId:'dealer', accessUntil:Date.now()+86400000, invoiceReference:'INV-001',paymentReference:'BANK-001' });
    assert.equal((await reportA({})).cases, 0);
  });
  it('a completed refund recalculates the current quotation after a price revision', async () => {
    const v = await createVehicleA({ vinChassis: 'NHP10-6486306', make: 'Toyota', model: 'Aqua', year: 2020, category: 'sedan_station_wagon', purchasePriceCents: 300000 });
    const c = await createCaseA({ customerId: 'custA', vehicleId: v.vehicleId });
    const first = await issueQuotationA({ caseId: c.caseId });
    const p = await recordPaymentA({ caseId: c.caseId, quotationId: first.quotationId, amountCents: 10000, method: 'Bank', providerRef: 'REFUND-001' });
    await confirmPaymentA({ paymentId: p.paymentId });
    const current = await issueQuotationA({ caseId: c.caseId, charges: { agencyFeeCents: 20000 } });
    await correctPaymentA({ paymentId: p.paymentId, action: 'refund', reason: 'Bank refund completed', reference: 'BANK-REFUND-001' });
    assert.equal((await db.doc(`quotations/${current.quotationId}`).get()).data()!.totalPaidCents, 0);
    assert.equal((await db.doc(`import_cases/${c.caseId}`).get()).data()!.balanceDueCents, current.totalDueCents);
    assert.equal((await db.doc(`payments/${p.paymentId}`).get()).data()!.status, 'refunded');
  });
  it('reverses a confirmed payment once, restores the current balance and preserves the ledger', async () => {
    const v = await createVehicleA({ vinChassis: 'NHP10-6486305', make: 'Toyota', model: 'Aqua', year: 2020, category: 'sedan_station_wagon', purchasePriceCents: 300000, engineCc: 1500 });
    const c = await createCaseA({ customerId: 'custA', vehicleId: v.vehicleId });
    const q = await issueQuotationA({ caseId: c.caseId, charges: { agencyFeeCents: 15000 } });
    const p = await recordPaymentA({ caseId: c.caseId, quotationId: q.quotationId, amountCents: 10000, method: 'Cash', providerRef: 'REV-001' });
    await confirmPaymentA({ paymentId: p.paymentId });
    const before = await reportA({});
    assert.equal(before.collectedCents, 10000);
    assert.equal(before.quotedFeesCents, 15000);
    const correction = { paymentId: p.paymentId, action: 'reverse', reason: 'Entered against the wrong case', reference: 'CORR-001' };
    await correctPaymentA(correction); await correctPaymentA(correction);
    const current = (await db.collection('quotations').doc(q.quotationId as string).get()).data()!;
    assert.equal(current.totalPaidCents, 0);
    assert.equal((await db.collection('payments').doc(p.paymentId as string).get()).data()!.status, 'reversed');
    assert.equal((await reportA({})).collectedCents, 0);
    await assert.rejects(correctPaymentA({ ...correction, action: 'refund' }), { code: 'failed-precondition' });
    await assert.rejects(callAs(operations.correctPayment as unknown as CallableFn, STAFF_B)(correction), { code: 'permission-denied' });
  });
  it('binds customer quotation acceptance to current version and ownership', async () => {
    const v = await createVehicleA({ vinChassis: 'GE6-1221760', make: 'Honda', model: 'Fit', year: 2020, category: 'sedan_station_wagon', purchasePriceCents: 200000 });
    const c = await createCaseA({ customerId: 'custA', vehicleId: v.vehicleId });
    const q = await issueQuotationA({ caseId: c.caseId });
    const accept = callAs(operations.acceptQuotation as unknown as CallableFn, { uid: 'uA', token: { app_role: 'customer', company_id: 'A', customer_id: 'custA' } });
    await accept({ quotationId: q.quotationId }); await accept({ quotationId: q.quotationId });
    assert.equal((await db.collection('quotations').doc(q.quotationId as string).get()).data()!.acceptedBy, 'uA');
    await issueQuotationA({ caseId: c.caseId });
    await assert.rejects(accept({ quotationId: q.quotationId }), { code: 'failed-precondition' });
  });
  it('paginates all agency cases without mixing other tenants', async () => {
    for (let i = 0; i < 28; i++) await db.collection('import_cases').doc(`page${i.toString().padStart(2, '0')}`).set({ companyId: 'A', caseNum: `P${i}`, currentStage: 'enquiry', balanceDueCents: 100 });
    await db.collection('import_cases').doc('other').set({ companyId: 'B', caseNum: 'OTHER', balanceDueCents: 99999 });
    const first = await reportA({});
    assert.equal(first.cases, 28); assert.equal(first.outstandingCents, 2800);
    assert.equal((first.rows as unknown[]).length, 25);
    const second = await reportA({ cursor: first.nextCursor });
    assert.equal((second.rows as unknown[]).length, 3); assert.equal(second.nextCursor, null);
  });
  it('rejects unverified invite claims, non-admin creators and customers already linked', async () => {
    await assert.rejects(callAs(operations.createInvitation as unknown as CallableFn, STAFF_B)({ email: 'invite@test.dev', role: 'staff' }), { code: 'permission-denied' });
    await assert.rejects(callAs(operations.createInvitation as unknown as CallableFn, STAFF_A)({ email: 'invite@test.dev', role: 'customer', customerId: 'custA' }), { code: 'failed-precondition' });
    await assert.rejects(callAs(operations.acceptInvitation as unknown as CallableFn, { uid: 'new', token: {} })({ token: 'a'.repeat(64) }), { code: 'failed-precondition' });
  });
});

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasUndefined);
  return false;
}

const createCaseA = callAs(createCase, STAFF_A);
const createVehicleA = callAs(createVehicle, STAFF_A);
const advanceImportStageA = callAs(advanceImportStage, STAFF_A);
const issueQuotationA = callAs(issueQuotation, STAFF_A);
const recordPaymentA = callAs(recordPayment, STAFF_A);
const confirmPaymentA = callAs(confirmPayment, STAFF_A);
const confirmPaymentB = callAs(confirmPayment, STAFF_B);
const verifyDocumentA = callAs(verifyDocument, STAFF_A);
const verifyDocumentB = callAs(verifyDocument, STAFF_B);
const linkCustomerA = callAs(linkCustomer, STAFF_A);
const bootstrapCompanyA = callAs(bootstrapCompany, PLATFORM_A);
const backfillAsPlatform = callAs(backfillVehicleCustomers, PLATFORM_A);
const backfillAsStaff = callAs(backfillVehicleCustomers, STAFF_A);
const backfillAsUnmarkedAdmin = callAs(backfillVehicleCustomers, {
  uid: 'unmarkedAdmin',
  token: { app_role: 'admin' },
});

after(() => {
  db.terminate();
});

async function clearCollection(path: string): Promise<void> {
  const snap = await db.collection(path).get();
  for (const d of snap.docs) {
    await d.ref.delete();
  }
}

async function clearAll(): Promise<void> {
  for (const name of ['agency_billing','subscription_events','subscription_support','invitations','dealer_leads','dealer_stock','dealer_sales','dealer_costs','dealer_sale_entries','dealer_sales_documents','dealer_acquisitions','import_deal_results']) await clearCollection(name);
  await clearCollection('import_cases');
  await clearCollection('quotations');
  await clearCollection('payments');
  await clearCollection('customers');
  await clearCollection('vehicles');
  await clearCollection('staff');
  await clearCollection('companies');
  await clearCollection('audit_log');
  await clearCollection('users');
  await clearCollection('platform_admins');
  await clearCollection('enquiries');
  await clearCollection('stage_definitions');
  const taxSets = await db.collection('config').doc('tax_rates').collection('sets').get();
  for (const d of taxSets.docs) {
    await d.ref.delete();
  }
}

const ENQUIRY_TO_DELIVERED = [
  'enquiry',
  'quotation',
  'payment_confirmed',
  'vehicle_sourced',
  'purchase_completed',
  'export_processing',
  'shipped',
  'in_transit',
  'arrived',
  'customs_clearance',
  'duties_charges',
  'registration_compliance',
  'ready_for_collection',
  'delivered',
];

async function seedTenantA(): Promise<void> {
  await db.collection('companies').doc('A').set({
    slug: 'a',
    name: 'Tenant A',
    casePrefix: 'IM',
    contactWhatsapp: '0771000000',
    primaryColor: '#1d4ed8',
    isActive: true,
  });
  await db.collection('companies').doc('B').set({
    slug: 'b',
    name: 'Tenant B',
    casePrefix: 'TB',
    contactWhatsapp: '0771000001',
    isActive: true,
  });
  await db
    .collection('companies')
    .doc('A')
    .collection('meta')
    .doc('counter')
    .set({ lastSeq: 0 });
  for (const [index, key] of ENQUIRY_TO_DELIVERED.entries()) {
    await db.collection('companies').doc('A').collection('stages').doc(key).set({
      position: index + 1,
      enabled: true,
    });
  }
  await db.collection('staff').doc('staffA').set({ companyId: 'A', role: 'admin', isActive: true });
  await db.collection('staff').doc('staffB').set({ companyId: 'B', role: 'staff', isActive: true });
  await db.collection('platform_admins').doc('adminA').set({ isActive: true });
  await db.collection('users').doc('staffA').set({ isActive: true });
  await db.collection('users').doc('staffB').set({ isActive: true });
  await db.collection('users').doc('adminA').set({ isActive: true });
  await db.collection('customers').doc('custA').set({
    companyId: 'A',
    userId: 'uA',
    fullName: 'Customer A',
    lastNameLower: 'customer a',
    phoneNumber: '0771000002',
    isActive: true,
  });
  await db.collection('users').doc('uA').set({
    email: 'cust.a@example.com',
    fullName: 'Customer A',
    phoneNumber: '0771000002',
    isActive: true,
  });
  await db
    .collection('config')
    .doc('tax_rates')
    .collection('sets')
    .add({
      scope: 'all',
      effectiveFrom: '2024-01-01',
      vatPct: 15.5,
      surtaxThresholdYears: 5,
      surtaxPct: 35,
      dutyRates: {
        sedan_station_wagon: 40,
        pickup_up_to_800kg: 25,
        pickup_801_to_1400kg: 40,
        pickup_over_1400kg: 40,
        double_cab: 60,
      },
      carbonTaxBands: [
        { fromCc: 0, toCc: 1500, amountCents: 600 },
        { fromCc: 1501, toCc: 2000, amountCents: 1100 },
        { fromCc: 2001, toCc: 3000, amountCents: 1500 },
        { fromCc: 3001, amountCents: 3000 },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
    });
}

async function addVerifiedDocument(caseId: string, docType: string): Promise<void> {
  await db
    .collection('import_cases')
    .doc(caseId)
    .collection('documents')
    .add({
      companyId: 'A',
      caseId,
      docType,
      objectPath: `gs://bucket/${caseId}/${docType}.pdf`,
      fileName: `${docType}.pdf`,
      storageValid: true,
      verified: true,
      uploadedBy: 'staffA',
    });
}

beforeEach(async () => {
  await clearAll();
  await seedTenantA();
});

describe('dealership stock sales', () => {
  it('converts a lead once and preserves its customer link during follow-up edits', async()=>{
    const dealer=await import('../../src/dealership.ts');const journeys=await import('../../src/dealerJourneys.ts');
    const save=callAs(dealer.saveDealerLead as unknown as CallableFn,STAFF_A);const convert=callAs(journeys.convertDealerLead as unknown as CallableFn,STAFF_A);
    const payload={name:'Lead Buyer',phone:'+263771111111',interest:'either',budgetCents:800000};const {leadId}=await save(payload);
    const [first,second]=await Promise.all([convert({leadId}),convert({leadId})]);assert.equal(first.customerId,second.customerId);
    await save({...payload,leadId,status:'viewing'});assert.equal((await db.doc(`dealer_leads/${leadId}`).get()).data()?.customerId,first.customerId);
    await assert.rejects(callAs(journeys.convertDealerLead as unknown as CallableFn,STAFF_B)({leadId}),{code:'not-found'});
  });
  it('buyer sees only their purchase and issued documents retain their original balances',async()=>{
    const dealer=await import('../../src/dealership.ts');const journeys=await import('../../src/dealerJourneys.ts');
    await db.doc('dealer_stock/retail-test').set({companyId:'A',status:'available',activeSaleId:null,title:'Toyota Aqua',askingPriceCents:800000});
    const {saleId}=await callAs(dealer.reserveDealerStock as unknown as CallableFn,STAFF_A)({stockId:'retail-test',customerId:'custA',agreedPriceCents:800000,expiresAt:new Date(Date.now()+86400000).toISOString(),terms:'Payment before collection'});
    const issue=callAs(journeys.issueDealerSaleDocument as unknown as CallableFn,STAFF_A);const {documentId}=await issue({saleId,kind:'sale',requestId:'agreement1'});
    await callAs(dealer.updateDealerSale as unknown as CallableFn,STAFF_A)({saleId,action:'payment',amountCents:10000,requestId:'p1',evidence:'BANK-1'});
    const buyer={uid:'uA',token:{app_role:'customer',company_id:'A',customer_id:'custA'}};
    const detail=await callAs(journeys.dealerSaleDetails as unknown as CallableFn,buyer)({saleId});assert.equal((detail.sale as {paidCents:number}).paidCents,10000);
    assert.equal((detail.documents as {id:string;balanceCents:number}[]).find(d=>d.id===documentId)?.balanceCents,800000);
    assert.equal((await callAs(journeys.customerRetailPurchases as unknown as CallableFn,buyer)({})).sales instanceof Array,true);
    await assert.rejects(callAs(journeys.dealerSaleDetails as unknown as CallableFn,STAFF_B)({saleId}),{code:'not-found'});
    await assert.rejects(callAs(journeys.dealerSaleDetails as unknown as CallableFn,{uid:'uA',token:{app_role:'customer',company_id:'A',customer_id:'other'}})({saleId}),{code:'permission-denied'});
    await assert.rejects(callAs(journeys.issueDealerSaleDocument as unknown as CallableFn,buyer)({saleId,kind:'sale',requestId:'bad'}),{code:'permission-denied'});
    const receipt=await issue({saleId,kind:'receipt',entryId:`${saleId}_p1`,requestId:'receipt1'});assert.ok(receipt.documentId);
  });
  it('dealer acquisition advances with evidence and transfers complete actual costs into stock once',async()=>{
    const j=await import('../../src/dealerJourneys.ts');const v=await createVehicleA({vinChassis:'NHP10-1122334',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon'});
    const {acquisitionId}=await callAs(j.createDealerAcquisition as unknown as CallableFn,STAFF_A)({vehicleId:v.vehicleId,supplier:'BE FORWARD',supplierReference:'BF-123',supplierUrl:'https://www.beforward.jp/'});
    await assert.rejects(createCaseA({customerId:'custA',vehicleId:v.vehicleId}),{code:'failed-precondition'});
    const update=callAs(j.updateDealerAcquisition as unknown as CallableFn,STAFF_A);
    await assert.rejects(update({acquisitionId,action:'advance',requestId:'early',evidence:'No cost yet'}),{code:'failed-precondition'});
    const cost={acquisitionId,action:'cost',category:'purchase',amountCents:500000,requestId:'purchase1',evidence:'Supplier paid invoice 123'};await update(cost);await update(cost);
    await update({acquisitionId,action:'cost',category:'freight',amountCents:100000,requestId:'freight1',evidence:'Freight invoice'});
    for(const stage of ['purchased','shipped','arrived','cleared','prepared'])await update({acquisitionId,action:'advance',requestId:stage,evidence:`Verified ${stage}`});
    await update({acquisitionId,action:'transfer',requestId:'stock1',evidence:'Prepared and cleared',location:'Harare',askingPriceCents:800000,costsComplete:true});
    const landed=(await db.doc(`dealer_costs/${v.vehicleId}`).get()).data()!;assert.equal(landed.acquisitionCents,500000);assert.equal(landed.directCostsCents,100000);assert.equal(landed.complete,true);
    await assert.rejects(update({...cost,requestId:'post-stock'}),{code:'failed-precondition'});
    await db.doc('staff/staffA').update({role:'staff'});await assert.rejects(callAs(j.createDealerAcquisition as unknown as CallableFn,STAFF_A)({vehicleId:v.vehicleId}),{code:'permission-denied'});
  });
  it('supplier-direct payments settle obligations without being counted as agency collections',async()=>{
    const v=await createVehicleA({vinChassis:'NHP10-5555533',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon',purchasePriceCents:500000});const c=await createCaseA({customerId:'custA',vehicleId:v.vehicleId});const q=await issueQuotationA({caseId:c.caseId});
    const p=await recordPaymentA({caseId:c.caseId,quotationId:q.quotationId,amountCents:10000,method:'Bank',providerRef:'SUPPLIER-DIRECT',recipient:'supplier',purpose:'pass_through'});await confirmPaymentA({paymentId:p.paymentId});
    const report=await reportA({});assert.equal(report.collectedCents,0);assert.equal(report.supplierPaidCents,10000);
    assert.equal((await db.doc(`quotations/${q.quotationId}`).get()).data()?.totalPaidCents,10000);
  });
  it('earned fee corrections preserve original entries and cannot be reversed twice',async()=>{
    const j=await import('../../src/dealerJourneys.ts');await db.doc('import_cases/earnings').set({companyId:'A',caseNum:'IM-123'});
    const record=callAs(j.recordImportDealResult as unknown as CallableFn,STAFF_A);const {entryId}=await record({caseId:'earnings',kind:'fee_earned',amountCents:50000,requestId:'fee1',evidence:'Service completed'});
    await record({caseId:'earnings',kind:'dealer_expense',amountCents:10000,requestId:'expense1',evidence:'Dealer paid courier'});
    await record({caseId:'earnings',kind:'reverse',entryId,requestId:'correction1',evidence:'Fee entered incorrectly'});
    await assert.rejects(record({caseId:'earnings',kind:'reverse',entryId,requestId:'correction2',evidence:'Duplicate'}),{code:'failed-precondition'});
    const result=await callAs(j.importDealResults as unknown as CallableFn,STAFF_A)({});const events=result.events as {kind:string;amountCents:number}[];assert.equal(events.filter(e=>e.kind==='fee_earned').reduce((n,e)=>n+e.amountCents,0),0);
    await assert.rejects(callAs(j.importDealResults as unknown as CallableFn,STAFF_B)({}),{code:'permission-denied'});
  });
  it('public showroom projects only safe stock fields and captures leads in the selected tenant', async () => {
    const dealer = await import('../../src/dealership.ts');
    await db.doc('dealer_stock/public-stock').set({companyId:'A',title:'Toyota Aqua',location:'Harare',askingPriceCents:800000,status:'available',published:true,vin:'PRIVATE-VIN',ownership:'consigned',activeSaleId:null,description:'Ready to view',photos:[]});
    await db.doc('dealer_stock/private-stock').set({companyId:'A',status:'available',published:false});
    await db.doc('dealer_stock/other-stock').set({companyId:'B',status:'available',published:true,title:'Other dealer'});
    const result = await (dealer.dealerShowroom as unknown as CallableFn).run({data:{slug:'a'}});
    const stock = result.stock as Record<string,unknown>[];
    assert.equal(stock.length,1); assert.equal(stock[0].title,'Toyota Aqua');
    for (const privateKey of ['vin','companyId','ownership','activeSaleId','acquisitionCents']) assert.equal(privateKey in stock[0],false);
    await (dealer.enquireDealerShowroom as unknown as {run:(r:unknown)=>Promise<unknown>}).run({data:{slug:'a',name:'Visitor',phone:'+263771234567',preferences:'Aqua under USD 8500'},rawRequest:{ip:'127.0.0.1'}});
    const leads = await db.collection('dealer_leads').get(); assert.equal(leads.size,1);assert.equal(leads.docs[0].data().companyId,'A');
    const enquiry=(data:Record<string,unknown>)=>(dealer.enquireDealerShowroom as unknown as {run:(r:unknown)=>Promise<unknown>}).run({data:{slug:'a',name:'Buyer',phone:'+263771111111',preferences:'View the Aqua',interest:'stock',...data},rawRequest:{ip:'127.0.0.1'}});
    await enquiry({stockId:'public-stock'});
    const linked=await db.collection('dealer_leads').where('stockId','==','public-stock').get();assert.equal(linked.size,1);assert.equal(linked.docs[0].data().stockTitle,'Toyota Aqua');
    await assert.rejects(enquiry({stockId:'other-stock'}),{code:'not-found'});
    await assert.rejects(enquiry({stockId:'private-stock'}),{code:'failed-precondition'});

    await db.doc('dealer_stock/public-stock').update({status:'reserved'});
    await assert.rejects(enquiry({stockId:'public-stock'}),{code:'failed-precondition'});
    assert.deepEqual((await (dealer.dealerShowroom as unknown as CallableFn).run({data:{slug:'a'}})).stock,[]);
  });
  it('locks concurrent reservations, isolates tenants and keeps payment retries from double counting', async () => {
    const dealer = await import('../../src/dealership.ts');
    const add = callAs(dealer.addDealerStock as unknown as CallableFn, STAFF_A);
    const reserve = callAs(dealer.reserveDealerStock as unknown as CallableFn, STAFF_A);
    const update = callAs(dealer.updateDealerSale as unknown as CallableFn, STAFF_A);
    const vehicle = await createVehicleA({vinChassis:'NHP10-7777777',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon'});
    await add({vehicleId:vehicle.vehicleId,askingPriceCents:800000,acquisitionCents:500000,location:'Harare'});
    await assert.rejects(createCaseA({customerId:'custA',vehicleId:vehicle.vehicleId}),{code:'failed-precondition'});
    const booking = {stockId:vehicle.vehicleId,customerId:'custA',agreedPriceCents:800000,expiresAt:new Date(Date.now()+86400000).toISOString(),terms:'Full payment before handover'};
    await assert.rejects(callAs(dealer.reserveDealerStock as unknown as CallableFn, STAFF_B)(booking),{code:'not-found'});
    const bookings = await Promise.allSettled([reserve(booking),reserve(booking)]);
    assert.equal(bookings.filter(b => b.status==='fulfilled').length,1);
    const saleId = (bookings.find(b => b.status==='fulfilled') as PromiseFulfilledResult<Record<string,unknown>>).value.saleId;
    await assert.rejects(update({saleId,action:'handover',requestId:'early',evidence:'Signed'}),{code:'failed-precondition'});
    const payment = {saleId,action:'payment',amountCents:800000,requestId:'bank1',evidence:'Bank transaction confirmed'};
    await update(payment); await update(payment);
    assert.equal((await db.doc(`dealer_sales/${saleId}`).get()).data()?.paidCents,800000);
    await assert.rejects(update({saleId,action:'cancel',requestId:'cancel',evidence:'Cancelled'}),{code:'failed-precondition'});
    await update({saleId,action:'handover',requestId:'deliver',evidence:'Buyer signed collection acknowledgement'});
    assert.equal((await db.doc(`dealer_stock/${vehicle.vehicleId}`).get()).data()?.status,'sold');
    await assert.rejects(reserve(booking),{code:'failed-precondition'});
    const workspace = await callAs(dealer.dealershipWorkspace as unknown as CallableFn, STAFF_B)({});
    assert.deepEqual(workspace.dealer_sales,[]);
    assert.equal('dealer_costs' in await callAs(dealer.dealershipWorkspace as unknown as CallableFn,STAFF_A)({}),true);
    await db.doc('staff/staffA').update({role:'staff'});
    assert.equal('dealer_costs' in await callAs(dealer.dealershipWorkspace as unknown as CallableFn,STAFF_A)({}),false);
  });
  it('refunds and cancellation release stock without erasing sale history', async () => {
    const dealer = await import('../../src/dealership.ts');
    const vehicle = await createVehicleA({vinChassis:'NHP10-8888888',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon'});
    await callAs(dealer.addDealerStock as unknown as CallableFn,STAFF_A)({vehicleId:vehicle.vehicleId,askingPriceCents:800000,acquisitionCents:500000,location:'Harare'});
    const reserve = callAs(dealer.reserveDealerStock as unknown as CallableFn,STAFF_A);
    const booking = {stockId:vehicle.vehicleId,customerId:'custA',agreedPriceCents:800000,expiresAt:new Date(Date.now()+86400000).toISOString(),terms:'Written deposit terms'};
    const {saleId} = await reserve(booking); const update = callAs(dealer.updateDealerSale as unknown as CallableFn,STAFF_A);
    await update({saleId,action:'payment',amountCents:10000,requestId:'p1',evidence:'Cash receipt 1'});
    await update({saleId,action:'refund',amountCents:10000,requestId:'r1',evidence:'Refund receipt 1'});
    await update({saleId,action:'cancel',requestId:'c1',evidence:'Buyer cancelled'});
    assert.equal((await db.doc(`dealer_stock/${vehicle.vehicleId}`).get()).data()?.status,'available');
    const second = await reserve(booking); assert.notEqual(second.saleId,saleId);
    assert.equal((await db.doc(`dealer_sales/${saleId}`).get()).data()?.status,'cancelled');
  });
});

describe('createVehicle / createCase', () => {
  it('creates a vehicle and derives a deterministic id from company|vin', async () => {
    const res = await createVehicleA({
      vinChassis: 'JHFAA11A000000001',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      sourceCountry: 'Japan',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const id = res.vehicleId as string;
    assert.equal(id.length, 40);
    const snap = await db.collection('vehicles').doc(id).get();
    assert.equal(snap.exists, true);
  });

  it('createCase increments the counter and returns IM0001', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000002',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const res = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    assert.equal(res.caseNum, 'IM0001');
    assert.equal(res.currentStage, 'enquiry');
    const counter = await db
      .collection('companies')
      .doc('A')
      .collection('meta')
      .doc('counter')
      .get();
    assert.equal((counter.data() as { lastSeq: number }).lastSeq, 1);
    const caseSnap = await db.collection('import_cases').doc(res.caseId as string).get();
    assert.equal((caseSnap.data() as { balanceDueCents: number }).balanceDueCents, 0);
    const linkedVehicle = await db.collection('vehicles').doc(vehicleId.vehicleId as string).get();
    assert.deepEqual((linkedVehicle.data() as { customerIds: string[] }).customerIds, ['custA']);
  });

  it('sequences cases IM0001, IM0002', async () => {
    const v1 = await createVehicleA({
      vinChassis: 'JHFAA11A000000011',
      make: 'A',
      model: 'B',
      year: 2001,
      category: 'sedan_station_wagon',
    });
    const v2 = await createVehicleA({
      vinChassis: 'JHFAA11A000000012',
      make: 'A',
      model: 'B',
      year: 2001,
      category: 'sedan_station_wagon',
    });
    const c1 = await createCaseA({ customerId: 'custA', vehicleId: v1.vehicleId });
    const c2 = await createCaseA({ customerId: 'custA', vehicleId: v2.vehicleId });
    assert.equal(c1.caseNum, 'IM0001');
    assert.equal(c2.caseNum, 'IM0002');
  });
  it('rejects invalid vehicle data and prevents duplicate race writes', async () => {
    const base = {
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    };
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'SHORT' }), { code: 'invalid-argument' });
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'JHFAA11A000000015', make: ' ' }), {
      code: 'invalid-argument',
    });
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'JHFAA11A000000016', purchasePriceCents: 1.5 }), {
      code: 'invalid-argument',
    });
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'JHFAA11A000000017', engineCc: 0 }), {
      code: 'invalid-argument',
    });
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'JHFAA11A000000018', sourceCountry: 'Mars' }), {
      code: 'invalid-argument',
    });
    await assert.rejects(createVehicleA({ ...base, vinChassis: 'JHFAA11A000000019', isCommercial: 'yes' }), {
      code: 'invalid-argument',
    });

    const duplicateInput = { ...base, vinChassis: 'JHFAA11A000000020' };
    const results = await Promise.allSettled([
      createVehicleA(duplicateInput),
      createVehicleA(duplicateInput),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
     assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
   });

  it('initializes a case at the first enabled tenant stage', async () => {

    await db.collection('companies').doc('A').collection('stages').doc('enquiry').update({ enabled: false });
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000024',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const result = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
     assert.equal(result.currentStage, 'quotation');
   });
});

describe('issueQuotation (ZIMRA golden persistence)', () => {
  it('persists itemised charges and a reproducible calculation snapshot across reissue', async () => {
    const vehicle = await createVehicleA({ vinChassis: 'JHFAA11A000000025', make: 'Toyota', model: 'Aqua', year: 2022, category: 'sedan_station_wagon', purchasePriceCents: 500000, yellowBookValueCents: 600000, engineCc: 1500 });
    const created = await createCaseA({ customerId: 'custA', vehicleId: vehicle.vehicleId });
    const first = await issueQuotationA({ caseId: created.caseId, charges: { freightCents: 100000, agencyFeeCents: 25000 } });
    const second = await issueQuotationA({ caseId: created.caseId });
    assert.equal(first.totalDueCents, second.totalDueCents);
    const stored = (await db.collection('quotations').doc(second.quotationId as string).get()).data()!;
    assert.equal(stored.currency, 'USD');
    assert.equal(stored.calculationVersion, 2);
    assert.equal(stored.purchasePriceCents, 500000);
    assert.equal(stored.charges.freightCents, 100000);
    assert.equal(stored.calculationSnapshot.vehicle.yellowBookValueCents, 600000);
    await assert.rejects(issueQuotationA({ caseId: created.caseId, charges: { freightCents: -1 } }), { code: 'invalid-argument' });
    await db.collection('company_settings').doc('A').set({ currency: 'ZAR' });
    await assert.rejects(issueQuotationA({ caseId: created.caseId }), { code: 'failed-precondition' });
    await db.collection('company_settings').doc('A').delete();
  });
   it('persists the official engine figures to the quotation and case', async () => {


    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000003',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      sourceCountry: 'Japan',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const quote = await issueQuotationA({ caseId });

    assert.equal(quote.version, 1);
    assert.equal(quote.totalDueCents, 1161630);
    assert.equal(quote.carbonTaxCents, 1100);
    assert.equal(quote.vatCents, 128030);

    const quoteSnap = await db.collection('quotations').doc(quote.quotationId as string).get();
    assert.equal((quoteSnap.data() as { totalPaidCents: number }).totalPaidCents, 0);
    const caseSnap = await db.collection('import_cases').doc(caseId).get();
    assert.equal((caseSnap.data() as { quotationVersion: number }).quotationVersion, 1);
    assert.equal((caseSnap.data() as { balanceDueCents: number }).balanceDueCents, 1161630);
  });

  it('allocates unique versions under concurrent issuance', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000013',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const results = await Promise.all([issueQuotationA({ caseId }), issueQuotationA({ caseId })]);
    assert.deepEqual(results.map((result) => result.version).sort(), [1, 2]);
    const current = await db.collection('import_cases').doc(caseId).get();
    assert.equal((current.data() as { quotationVersion: number }).quotationVersion, 2);
    assert.notEqual(results[0].quotationId, results[1].quotationId);
  });

  it('reissues after partial payment and supersedes pending payments', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000014',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const first = await issueQuotationA({ caseId });
    const partial = await recordPaymentA({
      caseId,
      amountCents: 100000,
      method: 'Bank',
      idempotencyKey: 'REISSUE-PARTIAL',
      quotationId: first.quotationId,
    });
    await confirmPaymentA({ paymentId: partial.paymentId });
    const pending = await recordPaymentA({
      caseId,
      amountCents: 20000,
      method: 'Cash',
      idempotencyKey: 'REISSUE-PENDING',
      quotationId: first.quotationId,
    });
    const second = await issueQuotationA({ caseId });
    const oldQuote = await db.collection('quotations').doc(first.quotationId as string).get();
    const newQuote = await db.collection('quotations').doc(second.quotationId as string).get();
    const oldPending = await db.collection('payments').doc(pending.paymentId as string).get();
    assert.equal((oldQuote.data() as { status: string }).status, 'expired');
    assert.equal((newQuote.data() as { totalPaidCents: number }).totalPaidCents, 100000);
    assert.equal((oldPending.data() as { status: string }).status, 'superseded');
    await assert.rejects(confirmPaymentA({ paymentId: pending.paymentId }), { code: 'failed-precondition' });
    await assert.rejects(recordPaymentA({
      caseId,
      amountCents: 30000,
      method: 'Cash',
      idempotencyKey: 'STALE-QUOTE',
      quotationId: first.quotationId,
    }), { code: 'failed-precondition' });
    const caseData = await db.collection('import_cases').doc(caseId).get();
    assert.equal((caseData.data() as { currentQuotationId: string }).currentQuotationId, second.quotationId);
   });

  it('increments quotationVersion on re-issue', async () => {
     const vehicleId = await createVehicleA({
       vinChassis: 'JHFAA11A000000004',

      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const q1 = await issueQuotationA({ caseId });
    const q2 = await issueQuotationA({ caseId });
    assert.equal(q1.version, 1);
    assert.equal(q2.version, 2);
    const snap = await db.collection('import_cases').doc(caseId).get();
    assert.equal((snap.data() as { quotationVersion: number }).quotationVersion, 2);
  });
});

describe('customer records and unsourced enquiries', () => {
  it('creates a customer without an auth account and retries without duplicating the record', async () => {
    const create = callAs(createCustomerRecord, STAFF_A);
    const input = { fullName: 'New Customer', phoneNumber: '+263771234567', idempotencyKey: 'customer-record-001' };
    const first = await create(input);
    const second = await create(input);
    assert.equal(first.customerId, second.customerId);
    assert.equal((await db.collection('customers').doc(first.customerId as string).get()).data()?.userId, undefined);
    await assert.rejects(create({ ...input, fullName: 'Different Customer' }), { code: 'already-exists' });
  });
  it('opens an enquiry before purchase and safely attaches a tenant-owned vehicle', async () => {
    const created = await createCaseA({ customerId: 'custA' });
    assert.equal(created.currentStage, 'enquiry');
    assert.equal((await db.collection('import_cases').doc(created.caseId as string).get()).data()?.vehicleId, '');
    const vehicle = await createVehicleA({ vinChassis: 'JHFAA11A000000026', make: 'Toyota', model: 'Aqua', year: 2022, category: 'sedan_station_wagon', purchasePriceCents: 500000 });
    const attach = callAs(attachCaseVehicle, STAFF_A);
    await attach({ caseId: created.caseId, vehicleId: vehicle.vehicleId });
    await attach({ caseId: created.caseId, vehicleId: vehicle.vehicleId });
    assert.equal((await db.collection('import_cases').doc(created.caseId as string).get()).data()?.vehicleId, vehicle.vehicleId);
    await assert.rejects(callAs(attachCaseVehicle, STAFF_B)({ caseId: created.caseId, vehicleId: vehicle.vehicleId }), { code: 'not-found' });
  });
  it('requires authenticated verified email before self-service tenant creation', async () => {
    await assert.rejects(registerAgency.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(registerAgency.run({ data: {}, auth: { uid: 'new-owner', token: {} } }), { code: 'failed-precondition' });
  });
});

describe('advanceImportStage (gates, sequencing, tenant scoping)', () => {
  it('advances only to the next enabled stage (R-12)', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000005',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
     const caseId = caseRes.caseId as string;
     await issueQuotationA({ caseId });

     await assert.rejects(advanceImportStageA({ caseId, toStage: 'payment_confirmed' }), {

      code: 'failed-precondition',
    });
    const res = await advanceImportStageA({ caseId, toStage: 'quotation' });
    assert.equal(res.toStage, 'quotation');
  });

  it('requires storage validation and human verification for stage documents', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000025',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const quote = await issueQuotationA({ caseId });
    await advanceImportStageA({ caseId, toStage: 'quotation' });
    const pay = await recordPaymentA({
      caseId,
      amountCents: quote.totalDueCents,
      method: 'Bank',
      providerRef: 'STORAGE-GATE-PAY',
      quotationId: quote.quotationId,
    });
    await confirmPaymentA({ paymentId: pay.paymentId });
    await advanceImportStageA({ caseId, toStage: 'payment_confirmed' });
    await advanceImportStageA({ caseId, toStage: 'vehicle_sourced' });
    const documentRef = db.collection('import_cases').doc(caseId).collection('documents').doc('storage-gate');
    await documentRef.set({
      companyId: 'A',
      caseId,
      docType: 'purchase_invoice',
      objectPath: `documents/A/${caseId}/purchase_invoice/storage-gate/invoice.pdf`,
      fileName: 'invoice.pdf',
      storageValid: false,
      verified: true,
      uploadedBy: 'staffA',
    });
    await assert.rejects(advanceImportStageA({ caseId, toStage: 'purchase_completed' }), {
      code: 'failed-precondition',
    });
    await documentRef.update({ storageValid: true });
    const result = await advanceImportStageA({ caseId, toStage: 'purchase_completed' });
    assert.equal(result.toStage, 'purchase_completed');
  });

  it('enforces the EAA gate before shipped for Japan-sourced vehicles (R-3)', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000006',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      sourceCountry: 'Japan',
      purchasePriceCents: 590000,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
     const caseId = caseRes.caseId as string;

     const quote = await issueQuotationA({ caseId });
     const pay = await recordPaymentA({
       caseId,
       amountCents: quote.totalDueCents,
       method: 'EcoCash',
       idempotencyKey: 'EAA-PAYMENT-1',
       quotationId: quote.quotationId,
     });
     await confirmPaymentA({ paymentId: pay.paymentId });
     await advanceImportStageA({ caseId, toStage: 'quotation' });
     await advanceImportStageA({ caseId, toStage: 'payment_confirmed' });

    await advanceImportStageA({ caseId, toStage: 'vehicle_sourced' });
    await addVerifiedDocument(caseId, 'purchase_invoice');
    await advanceImportStageA({ caseId, toStage: 'purchase_completed' });
     await addVerifiedDocument(caseId, 'export_certificate');
     await assert.rejects(advanceImportStageA({ caseId, toStage: 'export_processing' }), {
       code: 'failed-precondition',
     });
     await addVerifiedDocument(caseId, 'eaa_certificate');
     await advanceImportStageA({ caseId, toStage: 'export_processing' });

     await assert.rejects(advanceImportStageA({ caseId, toStage: 'shipped' }), {

      code: 'failed-precondition',
    });
    await addVerifiedDocument(caseId, 'eaa_certificate');
    await addVerifiedDocument(caseId, 'bill_of_lading');
    const res = await advanceImportStageA({ caseId, toStage: 'shipped' });
    assert.equal(res.toStage, 'shipped');
  });
});

describe('enquiry → delivered happy path (all gates, paid-in-full)', () => {
  it('completes the full pipeline', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000007',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      sourceCountry: 'Japan',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
     const caseId = caseRes.caseId as string;
     const quote = await issueQuotationA({ caseId });

     for (const toStage of ENQUIRY_TO_DELIVERED) {

      if (toStage === 'enquiry') continue;
      if (toStage === 'purchase_completed') await addVerifiedDocument(caseId, 'purchase_invoice');
       if (toStage === 'export_processing') {
         await addVerifiedDocument(caseId, 'export_certificate');
         await addVerifiedDocument(caseId, 'eaa_certificate');
       }

      if (toStage === 'shipped') {
        await addVerifiedDocument(caseId, 'eaa_certificate');
        await addVerifiedDocument(caseId, 'bill_of_lading');
      }
      if (toStage === 'customs_clearance') {
        for (const type of [
          'export_certificate',
          'bill_of_lading',
          'road_manifest',
          'condition_report',
          'eaa_certificate',
        ]) {
          await addVerifiedDocument(caseId, type);
        }
      }
       if (toStage === 'payment_confirmed') {
         const pay = await recordPaymentA({
           caseId,
           amountCents: quote.totalDueCents,
           method: 'EcoCash',
           providerRef: 'PR-READY-1',
           quotationId: quote.quotationId,
         });

        await confirmPaymentA({ paymentId: pay.paymentId });
      }
      const res = await advanceImportStageA({ caseId, toStage });
      assert.equal(res.toStage, toStage);
    }

    const caseSnap = await db.collection('import_cases').doc(caseId).get();
    assert.equal((caseSnap.data() as { currentStage: string }).currentStage, 'delivered');
    assert.equal((caseSnap.data() as { balanceDueCents: number }).balanceDueCents, 0);
  });
});

describe('verifyDocument', () => {
  it('requires valid storage, tenant ownership, and supports explicit unverify', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000026',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    const caseId = caseRes.caseId as string;
    const documentId = 'verify-callable-test';
    const ref = db.collection('import_cases').doc(caseId).collection('documents').doc(documentId);
    await ref.set({
      companyId: 'A',
      caseId,
      docType: 'purchase_invoice',
      objectPath: `documents/A/${caseId}/purchase_invoice/${documentId}/invoice.pdf`,
      fileName: 'invoice.pdf',
      storageValid: false,
      verified: false,
      uploadedBy: 'staffA',
    });
    await assert.rejects(verifyDocumentA({ caseId, documentId, verified: true }), {
      code: 'failed-precondition',
    });
    await ref.update({ storageValid: true });
    await assert.rejects(verifyDocumentB({ caseId, documentId, verified: true }), {
      code: 'permission-denied',
    });
    const verified = await verifyDocumentA({ caseId, documentId, verified: true });
    assert.equal(verified.verified, true);
    const unverified = await verifyDocumentA({ caseId, documentId, verified: false });
    assert.equal(unverified.verified, false);
  });
});

describe('recordPayment / confirmPayment (idempotency, no double credit)', () => {
  async function makeCase(): Promise<string> {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000008',
      make: 'Toyota',
      model: 'Corolla',
      year: 2001,
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      engineCc: 1800,
    });
    const caseRes = await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    return caseRes.caseId as string;
  }

  it('recordPayment with the same providerRef is idempotent (single doc)', async () => {
    const caseId = await makeCase();
    const quote = await issueQuotationA({ caseId });
    const p1 = await recordPaymentA({
      caseId,
      amountCents: 500000,
      method: 'EcoCash',
      providerRef: 'PR-1',
      quotationId: quote.quotationId,
    });
    const p2 = await recordPaymentA({
      caseId,
      amountCents: 500000,
      method: 'EcoCash',
      providerRef: 'PR-1',
      quotationId: quote.quotationId,
    });
    assert.equal(p1.paymentId, p2.paymentId);
    const snap = await db.collection('payments').doc(p1.paymentId as string).get();
    assert.equal(snap.exists, true);
  });

  it('concurrent pending confirmations cannot credit more than the remaining balance', async () => {
    const caseId = await makeCase();
    const quote = await issueQuotationA({ caseId });
    const first = await recordPaymentA({ caseId, quotationId: quote.quotationId, amountCents: quote.totalDueCents, method: 'Cash', idempotencyKey: 'parallel-pending-001' });
    const second = await recordPaymentA({ caseId, quotationId: quote.quotationId, amountCents: quote.totalDueCents, method: 'Bank', idempotencyKey: 'parallel-pending-002' });
    const confirmations = await Promise.allSettled([confirmPaymentA({ paymentId: first.paymentId }), confirmPaymentA({ paymentId: second.paymentId })]);
    assert.equal(confirmations.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(confirmations.filter((result) => result.status === 'rejected').length, 1);
    const stored = (await db.collection('quotations').doc(quote.quotationId as string).get()).data()!;
    assert.equal(stored.totalPaidCents, stored.totalDueCents);
  });

  it('collection guards recognise confirmed payments carried forward from an earlier quotation', async () => {
    const caseId = await makeCase();
    const quote = await issueQuotationA({ caseId });
    const payment = await recordPaymentA({ caseId, quotationId: quote.quotationId, amountCents: quote.totalDueCents, method: 'Bank', idempotencyKey: 'carried-forward-001' });
    await confirmPaymentA({ paymentId: payment.paymentId });
    await issueQuotationA({ caseId });
    await db.collection('import_cases').doc(caseId).update({ currentStage: 'registration_compliance' });
    const advanced = await advanceImportStageA({ caseId, toStage: 'ready_for_collection' });
    assert.equal(advanced.toStage, 'ready_for_collection');
  });

  it('rejects a mismatched retry for the same idempotency key', async () => {
    const caseId = await makeCase();
    const quote = await issueQuotationA({ caseId });
    const first = await recordPaymentA({
      caseId,
      amountCents: 50000,
      method: 'EcoCash',
      idempotencyKey: 'IDEMPOTENCY-MISMATCH',
      quotationId: quote.quotationId,
    });
    await assert.rejects(recordPaymentA({
      caseId,
      amountCents: 60000,
      method: 'EcoCash',
      idempotencyKey: 'IDEMPOTENCY-MISMATCH',
      quotationId: quote.quotationId,
    }), { code: 'already-exists' });
    const retry = await recordPaymentA({
      caseId,
      amountCents: 50000,
      method: 'EcoCash',
      idempotencyKey: 'IDEMPOTENCY-MISMATCH',
      quotationId: quote.quotationId,
    });
    assert.equal(retry.paymentId, first.paymentId);
     assert.equal(retry.status, 'pending');
   });

  it('confirms once; a second confirm is rejected (no double credit)', async () => {
     const caseId = await makeCase();

    const quote = await issueQuotationA({ caseId });
    const pay = await recordPaymentA({
      caseId,
      amountCents: quote.totalDueCents,
      method: 'Bank',
      providerRef: 'PR-2',
      quotationId: quote.quotationId,
    });
    const c1 = await confirmPaymentA({ paymentId: pay.paymentId });
    assert.equal(c1.status, 'confirmed');

    const quoteSnap = await db.collection('quotations').doc(quote.quotationId as string).get();
    assert.equal(
      (quoteSnap.data() as { totalPaidCents: number }).totalPaidCents,
      quote.totalDueCents,
    );
    const caseSnap = await db.collection('import_cases').doc(caseId).get();
    assert.equal((caseSnap.data() as { balanceDueCents: number }).balanceDueCents, 0);

    await assert.rejects(confirmPaymentA({ paymentId: pay.paymentId }), {
      code: 'failed-precondition',
    });
    const final = await db.collection('quotations').doc(quote.quotationId as string).get();
    assert.equal(
      (final.data() as { totalPaidCents: number }).totalPaidCents,
      quote.totalDueCents,
    );
  });

  it('cross-tenant confirm is denied', async () => {
    const caseId = await makeCase();
    const quote = await issueQuotationA({ caseId });
    const pay = await recordPaymentA({
      caseId,
      amountCents: 100000,
      method: 'Cash',
      providerRef: 'PR-3',
      quotationId: quote.quotationId,
    });
    await assert.rejects(confirmPaymentB({ paymentId: pay.paymentId }), {
      code: 'permission-denied',
    });
  });
});

describe('active membership enforcement', () => {
  it('rejects inactive staff users', async () => {
    await db.collection('users').doc('staffA').update({ isActive: false });
    await assert.rejects(createVehicleA({ vinChassis: 'INACTIVE1', year: 2020 }), {
      code: 'permission-denied',
    });
  });

  it('rejects staff callers when their company is inactive', async () => {
    await db.collection('companies').doc('A').update({ isActive: false });
    await assert.rejects(createVehicleA({ vinChassis: 'INACTIVE2', year: 2020 }), {
      code: 'permission-denied',
    });
  });
});

describe('linkCustomer', () => {
  it('rejects when neither userId nor email is provided (validates before touching auth)', async () => {
    await assert.rejects(
      linkCustomerA({ fullName: 'X', phoneNumber: '0771000009' }),
      { code: 'invalid-argument' },
    );
  });
});

describe('bootstrapCompany', () => {
  it('rejects missing required fields before touching auth or db', async () => {
    await assert.rejects(
      bootstrapCompanyA({}),
      { code: 'invalid-argument' },
    );
  });
});

describe('backfillVehicleCustomers', () => {
  it('links legacy vehicles (missing customerIds) and rejects staff callers', async () => {
    const vehicleId = await createVehicleA({
      vinChassis: 'JHFAA11A000000009',
      make: 'Toyota',
      model: 'Corolla',
      year: 2015,
      category: 'sedan_station_wagon',
    });
    await createCaseA({ customerId: 'custA', vehicleId: vehicleId.vehicleId });
    // Simulate a pre-backlink vehicle doc.
    await db.collection('vehicles').doc(vehicleId.vehicleId as string).update({ customerIds: [] });

    await assert.rejects(backfillAsStaff({}), { code: 'permission-denied' });
    await assert.rejects(backfillAsUnmarkedAdmin({}), { code: 'permission-denied' });
    const res = await backfillAsPlatform({});
    assert.equal(res.linked, 1);
    const snap = await db.collection('vehicles').doc(vehicleId.vehicleId as string).get();
    assert.deepEqual((snap.data() as { customerIds: string[] }).customerIds, ['custA']);
    // Idempotent re-run keeps a single entry.
    await backfillAsPlatform({});
    const again = await db.collection('vehicles').doc(vehicleId.vehicleId as string).get();
    assert.deepEqual((again.data() as { customerIds: string[] }).customerIds, ['custA']);
  });
});

describe('seed data serialization (strict Firestore client)', () => {
  it('legacy administrator refresh rejects email-only authority and unauthenticated callers', async () => {
    await assert.rejects(claimPlatformAdmin.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(claimPlatformAdmin.run({ data: {}, auth: { uid: 'email-only', token: { email: 'platform@test.dev', email_verified: true, app_role: 'admin' } } }), { code: 'permission-denied' });
  });
  it('DEFAULT_TAX_RATE_SET contains no undefined fields', () => {
    assert.equal(hasUndefined(DEFAULT_TAX_RATE_SET), false);
  });
});

it('public catalogue exposes only available published stock from active dealers and no private fields', async () => {
  const { publicVehicleCatalogue } = await import('../../src/dealership.ts');
  await db.doc('companies/catalogue-live').set({name:'Public Motors',slug:'public-motors',isActive:true,privateNote:'secret'});
  await db.doc('companies/catalogue-disabled').set({name:'Disabled',slug:'disabled',isActive:false});
  const fixture={companyId:'catalogue-live',title:'Toyota Aqua',location:'Harare',askingPriceCents:700000,photos:[],published:true,status:'available',vin:'PRIVATE',customerId:'PRIVATE',acquisitionCents:400000};
  await db.doc('dealer_stock/catalogue-available').set(fixture);
  await db.doc('dealer_stock/catalogue-sold').set({...fixture,status:'delivered'});
  await db.doc('dealer_stock/catalogue-private').set({...fixture,published:false});
  await db.doc('dealer_stock/catalogue-disabled').set({...fixture,companyId:'catalogue-disabled'});
  const result=await (publicVehicleCatalogue as unknown as CallableFn).run({data:{}});
  const rows=result.stock as Record<string,unknown>[];
  assert.equal(rows.length,1);
  assert.equal(rows[0].slug,'public-motors');
  assert.deepEqual(Object.keys(rows[0]).sort(),['id','title','location','askingPriceCents','photos','dealerName','slug','specs'].sort());
});

it('invitation history is owner scoped, preview omits identity and revocation blocks acceptance', async()=>{
  await db.doc('staff/staffA').update({role:'admin'});
  const owner={uid:'staffA',token:{app_role:'admin',company_id:'A'}};
  const created=await callAs(operations.createInvitation as unknown as CallableFn,owner)({email:'new@e2e.dev',role:'staff'});
  const preview=await (operations.invitationInfo as unknown as CallableFn).run({data:{token:created.token}});
  assert.deepEqual(Object.keys(preview).sort(),['agencyName','role','status','expiresAt'].sort());assert.equal(preview.status,'pending');
  const history=await callAs(operations.listInvitations as unknown as CallableFn,owner)({});const row=(history.invitations as {id:string;email:string}[])[0];assert.equal(row.email,'new@e2e.dev');
  await assert.rejects(callAs(operations.listInvitations as unknown as CallableFn,STAFF_B)({}),{code:'permission-denied'});
  await db.doc('staff/staffB').update({role:'admin'});
  await assert.rejects(callAs(operations.revokeInvitation as unknown as CallableFn,{uid:'staffB',token:{app_role:'admin',company_id:'B'}})({invitationId:row.id}),{code:'permission-denied'});
  await callAs(operations.revokeInvitation as unknown as CallableFn,owner)({invitationId:row.id});
  await callAs(operations.revokeInvitation as unknown as CallableFn,owner)({invitationId:row.id});
  assert.equal((await (operations.invitationInfo as unknown as CallableFn).run({data:{token:created.token}})).status,'revoked');
  await assert.rejects((operations.acceptInvitation as unknown as CallableFn).run({data:{token:created.token},auth:{uid:'unlinked-invite-user',token:{email:'new@e2e.dev',email_verified:true}}}),{code:'failed-precondition'});
});

it('bulk customer preview never writes, normalises phones, rejects invalid rows and skips repeated uploads',async()=>{
 const {bulkImportRecords}=await import('../../src/bulkImport.ts');const run=callAs(bulkImportRecords as unknown as CallableFn,{uid:'staffA',token:{app_role:'admin',company_id:'A'}});
 const rows=[{rowNumber:2,fullName:'Import Buyer',phoneNumber:'0771234567'},{rowNumber:3,fullName:'Invalid Buyer',phoneNumber:'771234567'},{rowNumber:4,fullName:'Import Buyer',phoneNumber:'+263771234567'}];
 const preview=await run({kind:'customers',mode:'preview',rows});assert.deepEqual((preview.results as {status:string}[]).map(r=>r.status),['ready','error','duplicate']);assert.equal((await db.collection('customers').where('fullName','==','Import Buyer').get()).size,0);
 const imported=await run({kind:'customers',mode:'commit',rows});assert.equal((imported.results as {status:string}[])[0].status,'imported');
 const saved=(await db.collection('customers').where('fullName','==','Import Buyer').get()).docs[0].data();assert.equal(saved.phoneNumber,'+263771234567');assert.equal(saved.userId,undefined);
 const repeated=await run({kind:'customers',mode:'commit',rows});assert.equal((repeated.results as {status:string}[])[0].status,'duplicate');assert.equal((await db.collection('customers').where('fullName','==','Import Buyer').get()).size,1);
 await assert.rejects(callAs(bulkImportRecords as unknown as CallableFn,STAFF_B)({kind:'customers',mode:'commit',rows}),{code:'permission-denied'});
});

it('bulk stock keeps unknown costs null, creates unpublished available stock atomically and never overwrites existing vehicles',async()=>{
 const {bulkImportRecords}=await import('../../src/bulkImport.ts');const run=callAs(bulkImportRecords as unknown as CallableFn,{uid:'staffA',token:{app_role:'admin',company_id:'A'}});
 const valid={rowNumber:2,vinChassis:'NHP10-1234567',make:'Toyota',model:'Aqua',year:'2020',category:'sedan_station_wagon',askingPrice:'7,500.25',location:'Harare',ownership:'owned',acquisitionCost:'',directCosts:'',costsComplete:'no'};
 const result=await run({kind:'stock',mode:'commit',rows:[valid,{...valid,rowNumber:3,vinChassis:'NHP10-1234568',costsComplete:'yes'},{...valid,rowNumber:4,vinChassis:'NHP10-1234569',askingPrice:'-100'}]});
 const records=result.results as {status:string;recordId:string}[];assert.deepEqual(records.map(r=>r.status),['imported','error','error']);
 const stock=(await db.doc(`dealer_stock/${records[0].recordId}`).get()).data()!;assert.equal(stock.askingPriceCents,750025);assert.equal(stock.published,false);assert.equal(stock.status,'available');
 const cost=(await db.doc(`dealer_costs/${records[0].recordId}`).get()).data()!;assert.equal(cost.acquisitionCents,null);assert.equal(cost.directCostsCents,null);assert.equal(cost.complete,false);
 const again=await run({kind:'stock',mode:'commit',rows:[{...valid,askingPrice:'9000'}]});assert.equal((again.results as {status:string}[])[0].status,'duplicate');assert.equal((await db.doc(`dealer_stock/${records[0].recordId}`).get()).data()!.askingPriceCents,750025);
 assert.equal((await db.collection('dealer_stock').get()).size,1);
});

it('bulk stock supports consignment settlement costs and rejects requests beyond batch limits',async()=>{
 const {bulkImportRecords}=await import('../../src/bulkImport.ts');const run=callAs(bulkImportRecords as unknown as CallableFn,{uid:'staffA',token:{app_role:'admin',company_id:'A'}});
 const row={vinChassis:'NHP10-3333333',make:'Toyota',model:'Aqua',year:'2020',category:'sedan_station_wagon',askingPrice:'USD 8000',location:'Harare',ownership:'consigned',acquisitionCost:'$7000',directCosts:'0',costsComplete:'yes'};
 const result=await run({kind:'stock',mode:'commit',rows:[row]});const id=(result.results as {recordId:string}[])[0].recordId;assert.equal((await db.doc(`dealer_costs/${id}`).get()).data()!.complete,true);assert.equal((await db.doc(`vehicles/${id}`).get()).data()!.purchasePriceCents,null);
 await assert.rejects(run({kind:'stock',mode:'commit',rows:Array(101).fill(row)}),{code:'invalid-argument'});
});


describe('subscription capacity and read-only access',()=>{
  async function managed(planId='solo',expired=false){const {Timestamp}=await import('firebase-admin/firestore');await db.doc('companies/A').update({ownerUserId:'staffA',subscription:{version:1,planId,status:'trial',accessUntil:Timestamp.fromMillis(Date.now()+(expired?-1:86400000))}});}
  it('concurrent stock imports cannot both claim the last slot; duplicate retry never consumes capacity',async()=>{
    await managed();for(let i=0;i<14;i++)await db.doc(`dealer_stock/existing${i}`).set({companyId:'A',vehicleId:`v${i}`,status:'available'});
    const importer=callAs((await import('../../src/bulkImport.ts')).bulkImportRecords as unknown as CallableFn,STAFF_A);
    const row=(vin:string)=>({vinChassis:vin,make:'Toyota',model:'Aqua',year:'2020',category:'sedan_station_wagon',askingPrice:'7000',location:'Harare'});
    const outcomes=await Promise.all(['NHP10-1234567','NHP10-7654321'].map(vin=>importer({kind:'stock',mode:'commit',rows:[row(vin)]})));
    const results=outcomes.flatMap(o=>o.results as {status:string;message?:string}[]);assert.equal(results.filter(r=>r.status==='imported').length,1);assert.equal(results.filter(r=>r.status==='error').length,1);assert.match(results.find(r=>r.status==='error')!.message!,/15 active vehicles/);
    const retry=await importer({kind:'stock',mode:'commit',rows:[row('NHP10-1234567'),row('NHP10-7654321')]});assert.equal((retry.results as {status:string}[]).filter(r=>r.status==='imported').length,0);
    const overview=await callAs((await import('../../src/subscriptions.ts')).subscriptionOverview as unknown as CallableFn,STAFF_A)({});assert.equal(overview.usedActiveVehicles,15);
  });
  it('case and acquisition creation share the stock allowance; customers do not use team seats',async()=>{
    await managed();for(let i=0;i<15;i++)await db.doc(`dealer_stock/existing${i}`).set({companyId:'A',vehicleId:`v${i}`,status:'available'});
    await assert.rejects(createCaseA({customerId:'custA'}),{code:'resource-exhausted'});
    const v=await createVehicleA({vinChassis:'NHP10-2233445',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon'});
    await assert.rejects(callAs((await import('../../src/dealerJourneys.ts')).createDealerAcquisition as unknown as CallableFn,STAFF_A)({vehicleId:v.vehicleId,supplier:'BE FORWARD',supplierReference:'BF123'}),{code:'resource-exhausted'});
    for(let i=0;i<10;i++)await callAs(createCustomerRecord,STAFF_A)({fullName:`Buyer ${i}`,phoneNumber:'+263771111111',idempotencyKey:`buyer-request-${i}`});
    await db.doc('dealer_stock/existing0').update({status:'sold'});assert.ok((await createCaseA({customerId:'custA'})).caseId);
  });
  it('staff invitation acceptance rechecks seats even when the invitation was issued earlier',async()=>{
    await managed();await db.doc('staff/extra').set({companyId:'A',isActive:true,role:'staff'});
    await assert.rejects(callAs(operations.createInvitation as unknown as CallableFn,STAFF_A)({email:'new@example.com',role:'staff'}),{code:'resource-exhausted'});
    const {createHash}=await import('node:crypto');const {Timestamp}=await import('firebase-admin/firestore');const token='a'.repeat(64);
    await db.doc(`invitations/${createHash('sha256').update(token).digest('hex')}`).set({companyId:'A',role:'staff',email:'new@example.com',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
    await assert.rejects(callAs(operations.acceptInvitation as unknown as CallableFn,{uid:'new',token:{email:'new@example.com',email_verified:true}})({token}),{code:'resource-exhausted'});
    assert.equal((await db.doc('staff/new').get()).exists,false);
  });
  it('expired owner can read, export and request renewal but cannot mutate business records or self-activate',async()=>{
    await managed('dealer',true);await db.doc('dealer_stock/private').set({companyId:'A',status:'available',photos:['https://secret.invalid/token']});await db.doc('dealer_costs/private').set({companyId:'A',acquisitionCents:12345});await db.doc('dealer_costs/foreign').set({companyId:'B',acquisitionCents:99999});
    const sub=await import('../../src/subscriptions.ts');assert.equal((await callAs(sub.subscriptionOverview as unknown as CallableFn,STAFF_A)({})).writable,false);
    const exported=await callAs(sub.exportAgencyRecords as unknown as CallableFn,STAFF_A)({collection:'dealer_costs'});assert.equal((exported.rows as any[]).length,1);assert.equal((exported.rows as any[])[0].acquisitionCents,12345);
    await assert.rejects(callAs(sub.exportAgencyRecords as unknown as CallableFn,STAFF_B)({collection:'dealer_costs'}),{code:'permission-denied'});
    await assert.rejects(callAs(sub.exportAgencyRecords as unknown as CallableFn,STAFF_A)({collection:'users'}),{code:'invalid-argument'});
    await callAs(sub.requestSubscriptionPlan as unknown as CallableFn,STAFF_A)({planId:'solo'});assert.equal((await db.doc('companies/A').get()).data()?.subscription.status,'trial');
    await assert.rejects(callAs(createCustomerRecord,STAFF_A)({fullName:'Blocked',phoneNumber:'+263771111111',idempotencyKey:'block'}),{code:'failed-precondition'});
    assert.equal((await reportA({})).cases,0);
  });
  it('downgrading retains history and blocks additional work above the allowance',async()=>{
    for(let i=0;i<16;i++)await db.doc(`dealer_stock/existing${i}`).set({companyId:'A',vehicleId:`v${i}`,status:'available'});
    await callAs(operations.setAgencyAccess as unknown as CallableFn,PLATFORM_A)({companyId:'A',planId:'solo',status:'active',accessUntil:Date.now()+86400000,invoiceReference:'I-1',paymentReference:'P-1'});
    assert.equal((await db.collection('dealer_stock').where('companyId','==','A').get()).size,16);await assert.rejects(createCaseA({customerId:'custA'}),{code:'resource-exhausted'});
  });
  it('renewal reminders are deduplicated for the owner and contain no customer information',async()=>{
    await managed();const maintenance=await import('../../src/subscriptionMaintenance.ts');const company=(await db.doc('companies/A').get()).data()!;
    await Promise.all([maintenance.remindCompany('A',company),maintenance.remindCompany('A',company)]);
    const notes=await db.collection('users/staffA/notifications').get();assert.equal(notes.size,1);assert.equal(notes.docs[0].data().payload.route,'/app/billing');
  });
});

describe('subscription commercial operations',()=>{
 it('platform reports separate support minutes and usage; tenant owners cannot change paid access',async()=>{
  const sub=await import('../../src/subscriptions.ts');const maintenance=await import('../../src/subscriptionMaintenance.ts');
  await callAs(maintenance.logAgencySupport as unknown as CallableFn,PLATFORM_A)({companyId:'A',minutes:20,reference:'TICKET-1'});
  await assert.rejects(callAs(maintenance.logAgencySupport as unknown as CallableFn,STAFF_A)({companyId:'A',minutes:20,reference:'BAD'}),{code:'permission-denied'});
  const report=await callAs(sub.platformSubscriptionReport as unknown as CallableFn,PLATFORM_A)({companyId:'A'});assert.equal(report.supportMinutes30Days,20);assert.equal(report.usedSeats,1);
  await assert.rejects(callAs(operations.setAgencyAccess as unknown as CallableFn,PLATFORM_A)({companyId:'A',planId:'dealer',status:'active',accessUntil:Date.now()+86400000}),{code:'invalid-argument'});
  await db.doc('staff/support-view').set({companyId:'A',role:'admin',isActive:true,isPlatformView:true});await db.doc('staff/member').set({companyId:'A',role:'staff',isActive:true});await db.doc('staff/member2').set({companyId:'A',role:'staff',isActive:true});
  await assert.rejects(callAs(operations.setAgencyAccess as unknown as CallableFn,PLATFORM_A)({companyId:'A',planId:'solo',status:'trial',accessUntil:Date.now()+86400000}),{code:'failed-precondition'});
  await db.doc('staff/member2').update({isActive:false});await callAs(operations.setAgencyAccess as unknown as CallableFn,PLATFORM_A)({companyId:'A',planId:'solo',status:'trial',accessUntil:Date.now()+86400000});
  assert.equal((await callAs(sub.subscriptionOverview as unknown as CallableFn,STAFF_A)({})).usedSeats,2);
 });
 it('expired subscriptions keep contact information public but suppress stale stock and new online enquiries',async()=>{
  const {Timestamp}=await import('firebase-admin/firestore');await db.doc('companies/A').update({subscription:{version:1,planId:'dealer',status:'trial',accessUntil:Timestamp.fromMillis(Date.now()-1)}});
  await db.doc('dealer_stock/stale').set({companyId:'A',vehicleId:'stale',status:'available',published:true,askingPriceCents:1});
  const dealer=await import('../../src/dealership.ts');const showroom=await (dealer.dealerShowroom as unknown as CallableFn).run({data:{slug:'a'}});assert.deepEqual(showroom.stock,[]);assert.equal(showroom.acceptsEnquiries,false);
  const catalogue=await (dealer.publicVehicleCatalogue as unknown as CallableFn).run({data:{}});assert.deepEqual(catalogue.stock,[]);
  await assert.rejects((dealer.enquireDealerShowroom as unknown as CallableFn).run({data:{slug:'a',name:'Buyer',phone:'+263771111111',preferences:'Toyota'},rawRequest:{ip:'127.0.0.1'}} as any),{code:'failed-precondition'});
 });
});

describe('subscription membership races',()=>{
 it('concurrent direct staff creation cannot consume the same last seat and cleans up the rejected account',{skip:!process.env.FIREBASE_AUTH_EMULATOR_HOST},async()=>{
  const {Timestamp}=await import('firebase-admin/firestore');const {getAuth}=await import('firebase-admin/auth');const {createStaff}=await import('../../src/bootstrap.ts');
  await db.doc('companies/A').update({subscription:{version:1,planId:'solo',status:'trial',accessUntil:Timestamp.fromMillis(Date.now()+86400000)}});
  const stamp=Date.now();const emails=[`seat-one-${stamp}@test.dev`,`seat-two-${stamp}@test.dev`];
  const results=await Promise.allSettled(emails.map(email=>callAs(createStaff as unknown as CallableFn,STAFF_A)({email,fullName:'New staff',role:'staff'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await db.collection('staff').where('companyId','==','A').get()).size,2);
  const authUsers=await Promise.allSettled(emails.map(email=>getAuth().getUserByEmail(email)));assert.equal(authUsers.filter(r=>r.status==='fulfilled').length,1);
 });
 it('a revoked platform operator cannot continue using a support-view membership',async()=>{
  await db.doc('staff/staffA').update({isPlatformView:true});
  await assert.rejects(reportA({}),{code:'permission-denied'});
 });
});

it('case next actions are audited and tenant-scoped',async()=>{
 const {setCaseNextAction}=await import('../../src/journeyAction.ts');
 const c=await createCaseA({customerId:'custA'});
 const save=callAs(setCaseNextAction as unknown as CallableFn,STAFF_A);
 await save({caseId:c.caseId,title:'Upload supplier invoice',responsible:'customer',dueDate:'2027-01-01'});
 assert.equal((await db.doc(`import_cases/${c.caseId}`).get()).data()?.nextAction.title,'Upload supplier invoice');
 await assert.rejects(callAs(setCaseNextAction as unknown as CallableFn,STAFF_B)({caseId:c.caseId,title:'Alter',responsible:'agency'}),{code:'not-found'});
 await assert.rejects(callAs(setCaseNextAction as unknown as CallableFn,{uid:'uA',token:{app_role:'customer',company_id:'A',customer_id:'custA'}})({caseId:c.caseId,title:'Alter',responsible:'agency'}),{code:'permission-denied'});
});
it('quotation scope is stored by version and expired prices cannot be accepted',async()=>{
 const v=await createVehicleA({vinChassis:'NHP10-8888765',make:'Toyota',model:'Aqua',year:2020,category:'sedan_station_wagon',purchasePriceCents:300000});
 const c=await createCaseA({customerId:'custA',vehicleId:v.vehicleId});
 const terms={route:'Durban to Harare',inclusions:'Sea freight recorded in breakdown',exclusions:'Registration',validUntil:new Date(Date.now()+86400000).toISOString().slice(0,10)};
 const q=await issueQuotationA({caseId:c.caseId,terms});
 assert.deepEqual((await db.doc(`quotations/${q.quotationId}`).get()).data()?.terms,terms);
 await db.doc(`quotations/${q.quotationId}`).update({'terms.validUntil':'2000-01-01'});
 await assert.rejects(callAs(operations.acceptQuotation as unknown as CallableFn,{uid:'uA',token:{app_role:'customer',company_id:'A',customer_id:'custA'}})({quotationId:q.quotationId}),{code:'failed-precondition'});
});
