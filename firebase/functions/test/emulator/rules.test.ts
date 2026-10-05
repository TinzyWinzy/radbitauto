import { before, after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-vehicle-import';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let env: RulesTestEnvironment;

before(async () => {
  const rulesText = await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: FIRESTORE_HOST, port: FIRESTORE_PORT, rules: rulesText },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

async function seed(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const companyA = db.collection('companies').doc('A');
    const companyB = db.collection('companies').doc('B');
    await companyA.set({ name: 'Tenant A', casePrefix: 'A', isActive: true });
    await companyB.set({ name: 'Tenant B', casePrefix: 'B', isActive: true });
    await companyA.collection('stages').doc('enquiry').set({ position: 1, enabled: true });
    await companyA.collection('meta').doc('counter').set({ lastSeq: 2 });

    const staff = db.collection('staff');
    await staff.doc('staffA').set({ companyId: 'A', role: 'admin', isActive: true });
    await staff.doc('staffB').set({ companyId: 'B', role: 'staff', isActive: true });
    await db.collection('users').doc('staffA').set({ isActive: true });
    await db.collection('users').doc('staffB').set({ isActive: true });
    await db.collection('users').doc('platform').set({ isActive: true });
    await db.collection('platform_admins').doc('platform').set({ isActive: true });

    const customers = db.collection('customers');
    await customers.doc('custA').set({
      companyId: 'A',
      userId: 'uA',
      fullName: 'Cust A',
      lastNameLower: 'cust a',
      phoneNumber: '0771000001',
      isActive: true,
    });
    await customers.doc('custB').set({
      companyId: 'B',
      userId: 'uB',
      fullName: 'Cust B',
      lastNameLower: 'cust b',
      phoneNumber: '0771000002',
      isActive: true,
    });
    await db.collection('users').doc('uA').set({ isActive: true });
    await db.collection('users').doc('uB').set({ isActive: true });

    const vehicles = db.collection('vehicles');
    await vehicles.doc('vA').set({
      companyId: 'A',
      customerIds: ['custA'],
      vinChassisUpper: 'JHFAA11A000000021',
      year: 2001,
      make: 'Toyota',
      model: 'Corolla',
      category: 'sedan_station_wagon',
      purchasePriceCents: 590000,
      sourceCountry: 'Japan',
      isCommercial: false,
    });
    await vehicles.doc('vB').set({
      companyId: 'B',
      customerIds: ['custB'],
      vinChassisUpper: 'JHFAA11A000000022',
      year: 2015,
      make: 'Nissan',
      model: 'Navara',
      category: 'double_cab',
      purchasePriceCents: 700000,
      sourceCountry: 'Japan',
      isCommercial: false,
    });

    const cases = db.collection('import_cases');
    await cases.doc('caseA').set({
      caseNum: 'A0001',
      companyId: 'A',
      customerId: 'custA',
      vehicleId: 'vA',
      currentStage: 'enquiry',
      balanceDueCents: 0,
      quotationVersion: 0,
    });
    await cases.doc('caseB').set({
      caseNum: 'B0001',
      companyId: 'B',
      customerId: 'custB',
      vehicleId: 'vB',
      currentStage: 'enquiry',
      balanceDueCents: 0,
      quotationVersion: 0,
    });

    const quotations = db.collection('quotations');
    await quotations.doc('qA').set({
      companyId: 'A',
      caseId: 'caseA',
      version: 1,
      totalDueCents: 1161630,
      totalPaidCents: 0,
      status: 'issued',
      vatCents: 128030,
    });
    await quotations.doc('qB').set({
      companyId: 'B',
      caseId: 'caseB',
      version: 1,
      totalDueCents: 100000,
      totalPaidCents: 0,
      status: 'issued',
    });

    const payments = db.collection('payments');
    await payments.doc('payB').set({
      companyId: 'B',
      caseId: 'caseB',
      quotationId: 'qB',
      amountCents: 50000,
      method: 'EcoCash',
      status: 'confirmed',
    });

    const audits = db.collection('audit_log');
    await audits
      .doc('auA')
      .set({ companyId: 'A', action: 'create', entityType: 'vehicles', entityId: 'vA' });
    await audits
      .doc('auB')
      .set({ companyId: 'B', action: 'create', entityType: 'vehicles', entityId: 'vB' });

    const taxSets = db.collection('config').doc('tax_rates').collection('sets');
    await taxSets.doc('seed').set({
      scope: 'all',
      effectiveFrom: '2024-01-01',
      vatPct: 15.5,
      dutyRates: { sedan_station_wagon: 40, double_cab: 60 },
    });
  });
}

function staffA() {
  return env.authenticatedContext('staffA', {
    email: 'a@tenant.example',
    app_role: 'admin',
    company_id: 'A',
  });
}

function staffB() {
  return env.authenticatedContext('staffB', {
    email: 'b@tenant.example',
    app_role: 'staff',
    company_id: 'B',
  });
}

function platformAdmin() {
  return env.authenticatedContext('platform', {
    email: 'platform@example.com',
    app_role: 'platform_admin',
    platform_admin: true,
  });
}

function customerA() {
  return env.authenticatedContext('uA', {
    email: 'cust.a@example.com',
    app_role: 'customer',
    company_id: 'A',
    customer_id: 'custA',
  });
}

it('supplier purchase records are readable only by agency staff and writable only through functions', async () => {
  await assertSucceeds(staffA().firestore().doc('import_cases/caseA/supplier/details').get());
  await assertFails(staffB().firestore().doc('import_cases/caseA/supplier/details').get());
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('import_cases/caseA/supplier/details').set({ companyId: 'A', purchaseReference: 'PRIVATE-INVOICE' });
  });
  await assertSucceeds(staffA().firestore().doc('import_cases/caseA/supplier/details').get());
  await assertFails(staffB().firestore().doc('import_cases/caseA/supplier/details').get());
  await assertFails(customerA().firestore().doc('import_cases/caseA/supplier/details').get());
  await assertFails(staffA().firestore().doc('import_cases/caseA/supplier/details').update({ purchaseReference: 'forged' }));
});

it('staff can list empty case subcollections without tenant filters while other agencies cannot', async () => {
  for (const name of ['documents', 'tracking', 'stage_updates']) {
    await assertSucceeds(staffA().firestore().collection(`import_cases/caseA/${name}`).get());
    await assertFails(staffB().firestore().collection(`import_cases/caseA/${name}`).get());
  }
});

describe('tenant isolation (Firestore rules)', () => {
  it('admin A can read own company, denied company B', async () => {
    const db = staffA().firestore();
    await assertSucceeds(db.doc('companies/A').get());
    await assertFails(db.doc('companies/B').get());
  });

  it('staff B cannot read company A documents', async () => {
    const db = staffB().firestore();
    await assertFails(db.doc('companies/A').get());
    await assertFails(db.doc('import_cases/caseA').get());
    await assertFails(db.doc('vehicles/vA').get());
  });

  it('staff list of companies fails when a cross-tenant doc is a candidate', async () => {
    const db = staffA().firestore();
    await assertFails(db.collection('companies').get());
  });

  it('staff can list companies restricted to own tenant doc ids', async () => {
    const db = staffA().firestore();
    const snap = await db
      .collection('companies')
      .where('__name__', '==', 'A')
      .get();
    assert.equal(snap.size, 1);
    assert.equal(snap.docs[0].id, 'A');
  });

  it('boundary financial data is denied across tenants', async () => {
    const db = staffA().firestore();
    await assertFails(db.doc('payments/payB').get());
    await assertFails(db.doc('quotations/qB').get());
    await assertFails(db.doc('customers/custB').get());
    await assertFails(db.doc('vehicles/vB').get());
    await assertFails(db.doc('audit_log/auB').get());
  });

  it('unauthenticated access is denied everywhere', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.doc('companies/A').get());
    await assertFails(db.doc('config/tax_rates/sets/seed').get());
    await assertFails(db.doc('import_cases/caseA').get());
  });

  it('customer sees only own case and its quotation', async () => {
    const db = customerA().firestore();
    await assertSucceeds(db.doc('import_cases/caseA').get());
    await assertSucceeds(db.doc('quotations/qA').get());
    await assertFails(db.doc('import_cases/caseB').get());
    await assertFails(db.doc('quotations/qB').get());
  });

  it('customer can get own vehicle by ID (CaseDetail path) but not others or via list', async () => {
    const db = customerA().firestore();
    await assertSucceeds(db.doc('vehicles/vA').get());
    await assertFails(db.doc('vehicles/vB').get());
    await assertFails(db.collection('vehicles').get());
    await assertFails(
      db.collection('vehicles').where('companyId', '==', 'A').get(),
    );
  });

  it('staff keeps tenant-scoped vehicle get/list', async () => {
    const db = staffA().firestore();
    await assertSucceeds(db.doc('vehicles/vA').get());
    await assertSucceeds(
      db.collection('vehicles').where('companyId', '==', 'A').get(),
    );
    await assertFails(db.doc('vehicles/vB').get());
  });
});

describe('RPC-only financial/workflow writes', () => {
  it('direct import_cases create is denied (functions only)', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('import_cases').doc('hack1').set({
        caseNum: 'A9999',
        companyId: 'A',
        customerId: 'custA',
        vehicleId: 'vA',
        currentStage: 'enquiry',
        balanceDueCents: 0,
        quotationVersion: 99,
      }),
    );
  });

  it('direct quotations/payments/audit_log/stage_updates writes are denied', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('quotations').doc('hack1').set({ companyId: 'A', totalDueCents: 1 }),
    );
    await assertFails(
      db.collection('payments').doc('hack1').set({ companyId: 'A', status: 'confirmed' }),
    );
    await assertFails(
      db.collection('audit_log').doc('hack1').set({ companyId: 'A', action: 'fabricate' }),
    );
    await assertFails(
      db
        .collection('import_cases')
        .doc('caseA')
        .collection('stage_updates')
        .doc('hack1')
        .set({ companyId: 'A', caseId: 'caseA', stageKey: 'delivered', status: 'completed' }),
    );
  });

  it('config tax sets: staff read-only, platform-only global writes', async () => {
    await assertSucceeds(staffA().firestore().doc('config/tax_rates/sets/seed').get());
    await assertFails(customerA().firestore().doc('config/tax_rates/sets/seed').get());

    const adminDb = staffA().firestore();
    await assertFails(
      adminDb.collection('config').doc('tax_rates').collection('sets').doc('next').set({
        scope: 'all',
        effectiveFrom: '2026-01-01',
        vatPct: 15.5,
        dutyRates: { sedan_station_wagon: 40 },
      }),
    );
    await assertSucceeds(
      platformAdmin().firestore().collection('config').doc('tax_rates').collection('sets').doc('next').set({
        scope: 'all',
        effectiveFrom: '2026-01-01',
        vatPct: 15.5,
        dutyRates: { sedan_station_wagon: 40 },
      }),
    );
  });
});

describe('permitted staff writes stay tenant-scoped', () => {
  it('staff cannot write vehicles directly', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('vehicles').doc('vNew').set({
        companyId: 'A',
        vinChassisUpper: 'JHFAA11A000000023',
        year: 2020,
        make: 'Honda',
        model: 'Fit',
        category: 'sedan_station_wagon',
        purchasePriceCents: 400000,
      }),
    );
    await assertFails(db.collection('vehicles').doc('vA').update({ make: 'Changed' }));
  });

  it('staff can create only pending case document rows with server-owned fields absent', async () => {
    const db = staffA().firestore();
    const documentId = 'purchase_invoice_0123456789abcdef';
    const base = {
      companyId: 'A',
      caseId: 'caseA',
      docType: 'purchase_invoice',
      objectPath: `documents/A/caseA/purchase_invoice/${documentId}/new.pdf`,
      fileName: 'new.pdf',
      verified: false,
      storageValid: false,
      uploadedBy: 'staffA',
      createdAt: new Date(),
    };
    const ref = db.collection('import_cases').doc('caseA').collection('documents').doc(documentId);
    await assertSucceeds(ref.set(base));
    await assertFails(ref.update({ verified: true }));
    await assertFails(ref.update({ storageValid: true }));
    await assertFails(ref.update({ objectPath: 'documents/A/caseA/purchase_invoice/other/new.pdf' }));
    await assertFails(ref.delete());
  });

  it('rejects forged verification, storage validity, URLs, and reassignment', async () => {
    const db = staffA().firestore();
    const base = {
      companyId: 'A',
      caseId: 'caseA',
      docType: 'purchase_invoice',
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_0123456789abcdef/hack.pdf',
      fileName: 'hack.pdf',
      verified: false,
      storageValid: false,
      uploadedBy: 'staffA',
      createdAt: new Date(),
    };
    const documents = db.collection('import_cases').doc('caseA').collection('documents');
    await assertFails(documents.doc('purchase_invoice_1111111111111111').set({
      ...base,
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_1111111111111111/hack.pdf',
      verified: true,
    }));
    await assertFails(documents.doc('purchase_invoice_2222222222222222').set({
      ...base,
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_2222222222222222/hack.pdf',
      storageValid: true,
    }));
    await assertFails(documents.doc('purchase_invoice_3333333333333333').set({
      ...base,
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_3333333333333333/hack.pdf',
      downloadUrl: 'https://example.com/file',
    }));
    await assertFails(documents.doc('purchase_invoice_4444444444444444').set({
      ...base,
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_4444444444444444/hack.pdf',
      storageValidatedAt: new Date(),
    }));
    await assertFails(documents.doc('purchase_invoice_5555555555555555').set({
      ...base,
      objectPath: 'documents/A/caseA/purchase_invoice/purchase_invoice_5555555555555555/hack.pdf',
      companyId: 'B',
    }));
  });

  it('staff cannot write customers or memberships directly', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('customers').doc('cHack').set({ companyId: 'A', userId: 'uB', isActive: true }),
    );
    await assertFails(
      db.collection('staff').doc('sHack').set({ companyId: 'A', role: 'staff', isActive: true }),
    );
  });

  it('admin can manage own stage configuration, not others', async () => {
    const db = staffA().firestore();
    await assertSucceeds(
      db.collection('companies').doc('A').collection('stages').doc('quotation').set({
        position: 2,
        enabled: true,
      }),
    );
    await assertFails(
      db.collection('companies').doc('B').collection('stages').doc('quotation').set({
        position: 2,
        enabled: true,
      }),
    );
  });

  it('enquiries are scoped to the creating customer tenant', async () => {
    const db = customerA().firestore();
    await assertSucceeds(
      db.collection('enquiries').add({
        companyId: 'A',
        customerId: 'custA',
        direction: 'inbound',
        message: 'Hello',
        status: 'open',
      }),
    );
    await assertFails(
      db.collection('enquiries').add({
        companyId: 'B',
        customerId: 'custA',
        direction: 'inbound',
        message: 'cross-tenant',
        status: 'open',
      }),
    );
    const crossQuery = db
      .collection('import_cases')
      .where('companyId', '==', 'B')
      .where('customerId', '==', 'custA');
    await assertFails(crossQuery.get());
  });

  it('inactive users and companies lose access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection('users').doc('staffA').update({ isActive: false });
    });
    await assertFails(staffA().firestore().doc('companies/A').get());

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection('users').doc('staffA').update({ isActive: true });
      await db.collection('companies').doc('A').update({ isActive: false });
    });
    await assertFails(staffA().firestore().doc('vehicles/vA').get());
  });

  it('staff cannot write tracking under another tenant case', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('import_cases').doc('caseB').collection('tracking').doc('hack1').set({
        companyId: 'A',
        caseId: 'caseB',
        location: 'injected',
      }),
    );
  });

  it('staff cannot create documents under another tenant case', async () => {
    const db = staffA().firestore();
    await assertFails(
      db.collection('import_cases').doc('caseB').collection('documents').doc('hack1').set({
        companyId: 'A',
        caseId: 'caseB',
        docType: 'eaa_certificate',
        objectPath: 'gs://bucket/fake.pdf',
        verified: true,
      }),
    );
  });
});

describe('subscription client write boundaries',()=>{
 it('an active managed plan permits normal tenant settings and tracking writes',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('companies/A').update({subscription:{version:1,planId:'solo',status:'active',accessUntil:new Date(Date.now()+86400000)}});});
  const db=staffA().firestore();await assertSucceeds(db.doc('companies/A').update({name:'Active dealer'}));await assertSucceeds(db.doc('companies/A/stages/enquiry').update({enabled:true}));await assertSucceeds(db.doc('import_cases/caseA/tracking/active').set({companyId:'A',caseId:'caseA',location:'Harare'}));
 });
 it('expiry retains tenant reads and denies direct changes to tracking, settings, stages and subscription',async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('companies/A').update({subscription:{version:1,planId:'solo',status:'trial',accessUntil:new Date(Date.now()-86400000)}});});
  const db=staffA().firestore();await assertSucceeds(db.doc('import_cases/caseA').get());await assertSucceeds(db.doc('companies/A').get());
  await assertFails(db.doc('companies/A').update({'subscription.status':'active'}));await assertFails(db.doc('companies/A').update({name:'Changed'}));await assertFails(db.doc('companies/A/stages/enquiry').update({enabled:false}));
  await assertFails(db.doc('import_cases/caseA/tracking/expiry').set({companyId:'A',caseId:'caseA',location:'Harare'}));
 });
});

it('subscription payment references are not readable by customer or staff database clients',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('agency_billing/A').set({companyId:'A',invoiceReference:'PRIVATE-INVOICE',paymentReference:'PRIVATE-BANK'});});
 await assertFails(staffA().firestore().doc('agency_billing/A').get());
 const customer=env.authenticatedContext('uA',{app_role:'customer',company_id:'A',customer_id:'custA'});await assertFails(customer.firestore().doc('agency_billing/A').get());
});
