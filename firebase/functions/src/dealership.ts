import { validateStockSpecs, stockSpecsProjection } from './publicStock.ts';
import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck, subscriptionState } from './subscriptions.ts';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireStaff } from './claims.ts';
import { ts } from './audits.ts';
import { createHash } from 'node:crypto';

export function text(value: unknown, field: string, optional = false): string {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > 1500) throw new HttpsError('invalid-argument', `${field} is required (maximum 1500 characters)`);
  return value.trim();
}
export function cents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000000000) throw new HttpsError('invalid-argument', 'Use nonnegative USD cents');
  return value;
}
export function id(value: unknown): string {
  const result = text(value, 'Record');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(result)) throw new HttpsError('invalid-argument', 'Invalid record');
  return result;
}
export function leadRef(docId: string): string {
  return docId.slice(0, 8).toUpperCase();
}
export function owned(data: FirebaseFirestore.DocumentData | undefined, companyId: string) {
  if (!data || data.companyId !== companyId) throw new HttpsError('not-found', 'Record unavailable');
  return data;
}

export const dealershipWorkspace = onCall(async request => {
  const staff = await requireStaff(contextFrom(request), true);
  const result: Record<string, unknown> = {};
  for (const collection of ['dealer_leads', 'dealer_stock', 'dealer_sales', 'dealer_acquisitions']) {
    if(collection === 'dealer_acquisitions' && staff.role !== 'admin') {result[collection]=[];continue;}
    const snap = await db.collection(collection).where('companyId', '==', staff.companyId).get();
    result[collection] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  if (staff.role === 'admin') {
    const costs = await db.collection('dealer_costs').where('companyId', '==', staff.companyId).get();
    result.dealer_costs = costs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  return result;
});

export const saveDealerLead = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const ref = d.leadId ? db.collection('dealer_leads').doc(id(d.leadId)) : db.collection('dealer_leads').doc();
  const interest = text(d.interest, 'Interest');
  if (!['stock', 'import', 'either'].includes(interest)) throw new HttpsError('invalid-argument', 'Choose stock or import interest');
  const status = d.status ?? 'new';
  if (!['new', 'contacted', 'viewing', 'won', 'lost'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid lead status');
  const followUp = text(d.followUp, 'Follow-up', true);
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) throw new HttpsError('invalid-argument', 'Use a follow-up date');
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const old = await tx.get(ref);
    if (d.leadId) owned(old.data(), staff.companyId);
    const assignedTo=d.assignedTo ? id(d.assignedTo) : old.data()?.assignedTo ?? ctx.uid;
    const assignee=await tx.get(db.doc(`staff/${assignedTo}`));if(assignee.data()?.companyId!==staff.companyId||assignee.data()?.isActive!==true)throw new HttpsError('invalid-argument','Choose an active team member');
    tx.set(ref, { companyId: staff.companyId, name: text(d.name, 'Name'), phone: text(d.phone, 'Phone'), interest, status,
      budgetCents: cents(d.budgetCents ?? 0), preferences: text(d.preferences, 'Preferences', true), followUp,
      assignedTo, updatedAt: ts(), createdAt: old.data()?.createdAt ?? ts() }, {merge:true});
  });
  return { leadId: ref.id };
});

export const addDealerStock = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const vehicleId = id(d.vehicleId); const ref = db.collection('dealer_stock').doc(vehicleId);
  const askingPriceCents = cents(d.askingPriceCents);
  const ownership = d.ownership ?? 'owned';
  if (!['owned', 'consigned'].includes(ownership)) throw new HttpsError('invalid-argument', 'Invalid ownership');
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [vehicle, stock, acquisition] = await Promise.all([tx.get(db.collection('vehicles').doc(vehicleId)), tx.get(ref), tx.get(db.collection('dealer_acquisitions').doc(vehicleId))]);
    const v = owned(vehicle.data(), staff.companyId);
    if (v.customerIds?.length) throw new HttpsError('failed-precondition', 'This vehicle is assigned to a customer import; it cannot be listed as dealer stock');
    if (stock.exists) throw new HttpsError('already-exists', 'Vehicle already in stock');
    if (acquisition.exists) throw new HttpsError('failed-precondition','Transfer this acquisition from its preparation stage');
    const lock = await capacityCheck(tx, staff.companyId, { vehicleKey: `vehicle:${vehicleId}` }); lock();
    tx.set(ref, { companyId: staff.companyId, vehicleId, title: `${v.year} ${v.make} ${v.model}`, vin: v.vinChassisUpper,
      askingPriceCents, ownership, photos: v.photos ?? [], location: text(d.location, 'Location'), status: 'available', activeSaleId: null, createdAt: ts(), updatedAt: ts() });
    tx.update(vehicle.ref,{allocation:'dealer_stock'});
    tx.set(db.collection('dealer_costs').doc(vehicleId), { companyId: staff.companyId, acquisitionCents: cents(d.acquisitionCents), directCostsCents: cents(d.directCostsCents ?? 0), complete: d.costsComplete === true, updatedAt: ts() });
    tx.set(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'dealer_stock', entityId: vehicleId, action: 'create', createdAt: ts() });
  });
  return { stockId: ref.id };
});

export const reserveDealerStock = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const stockRef = db.collection('dealer_stock').doc(id(d.stockId)); const saleRef = db.collection('dealer_sales').doc();
  const customerId = id(d.customerId); const agreedPriceCents = cents(d.agreedPriceCents);
  if (!agreedPriceCents) throw new HttpsError('invalid-argument', 'Agreed price must be positive');
  const expiry = Date.parse(text(d.expiresAt, 'Reservation expiry'));
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new HttpsError('invalid-argument', 'Reservation expiry must be in the future');
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [stock, customer, company] = await Promise.all([tx.get(stockRef), tx.get(db.collection('customers').doc(customerId)),tx.get(db.collection('companies').doc(staff.companyId))]);
    const s = owned(stock.data(), staff.companyId); const c = owned(customer.data(), staff.companyId);
    if (c.isActive !== true) throw new HttpsError('failed-precondition', 'Customer inactive');
    if (s.status !== 'available' || s.activeSaleId) throw new HttpsError('failed-precondition', 'Vehicle already reserved or sold');
    if (agreedPriceCents < s.askingPriceCents && staff.role !== 'admin') throw new HttpsError('permission-denied', 'Owner approval required for a discount');
    tx.set(saleRef, { companyId: staff.companyId, stockId: stockRef.id, customerId, customerName: c.fullName, customerPhone:c.phoneNumber ?? '', title: s.title, vin:s.vin ?? '', photos:s.photos ?? [],
      agreedPriceCents, paidCents: 0, status: 'reserved', documentNumber: `${company.data()?.casePrefix ?? 'SALE'}-S-${saleRef.id}`, expiresAt: new Date(expiry).toISOString(), terms: text(d.terms, 'Sale terms'), createdAt: ts(), updatedAt: ts() });
    tx.update(stockRef, { status: 'reserved', activeSaleId: saleRef.id, updatedAt: ts() });
    tx.set(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'dealer_sales', entityId: saleRef.id, action: 'reserve', createdAt: ts() });
  });
  return { saleId: saleRef.id };
});

export const updateDealerSale = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const saleRef = db.collection('dealer_sales').doc(id(d.saleId));
  const action = text(d.action, 'Action');
  if (!['payment', 'refund', 'cancel', 'handover'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid action');
  const entryRef = db.collection('dealer_sale_entries').doc(`${saleRef.id}_${id(d.requestId)}`);
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const [saleSnap, entrySnap] = await Promise.all([tx.get(saleRef), tx.get(entryRef)]);
    const s = owned(saleSnap.data(), staff.companyId);
    if (entrySnap.exists) {
      const previous = entrySnap.data()!;
      if (previous.action !== action || previous.amountCents !== (d.amountCents ?? 0)) throw new HttpsError('already-exists', 'Request key already used');
      return;
    }
    const stockRef = db.collection('dealer_stock').doc(s.stockId); const stock = owned((await tx.get(stockRef)).data(), staff.companyId);
    let paidCents = s.paidCents; let status = s.status;
    const amountCents = ['payment', 'refund'].includes(action) ? cents(d.amountCents) : 0;
    const evidence = text(d.evidence, 'Payment reference or handover/cancellation acknowledgement');
    if (action === 'payment') {
      if (s.status !== 'reserved' || Date.parse(s.expiresAt) <= Date.now()) throw new HttpsError('failed-precondition', 'Reservation expired or closed; cancel it before rebooking');
      if (!amountCents || paidCents + amountCents > s.agreedPriceCents) throw new HttpsError('failed-precondition', 'Payment exceeds outstanding balance');
      paidCents += amountCents;
    }
    if (action === 'refund') {
      if (!amountCents || amountCents > paidCents || s.status === 'delivered') throw new HttpsError('failed-precondition', 'Invalid refund; delivered sales require a return process');
      paidCents -= amountCents;
    }
    if (action === 'cancel') {
      if (s.status !== 'reserved' || paidCents !== 0) throw new HttpsError('failed-precondition', 'Refund the confirmed balance before cancelling');
      if (stock.activeSaleId !== saleRef.id) throw new HttpsError('failed-precondition', 'Reservation mismatch');
      status = 'cancelled'; tx.update(stockRef, { status: 'available', activeSaleId: null, updatedAt: ts() });
    }
    if (action === 'handover') {
      if (s.status !== 'reserved' || paidCents !== s.agreedPriceCents || stock.activeSaleId !== saleRef.id) throw new HttpsError('failed-precondition', 'Full payment and active reservation required');
      status = 'delivered'; tx.update(stockRef, { status: 'sold', updatedAt: ts() });
    }
    tx.update(saleRef, { paidCents, status, updatedAt: ts() });
    tx.set(entryRef, { companyId: staff.companyId, saleId: saleRef.id, customerId: s.customerId, action, amountCents, evidence, actorId: ctx.uid, createdAt: ts() });
    tx.set(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'dealer_sales', entityId: saleRef.id, action, detail: { amountCents, evidence }, createdAt: ts() });
  });
  return { saleId: saleRef.id };
});

export const publishDealerStock = onCall(async request => {
  const ctx = contextFrom(request); const staff = await requireStaff(ctx); const d = request.data;
  const ref = db.collection('dealer_stock').doc(id(d.stockId));
  const description = text(d.description, 'Description', true);
  const publicSpecs = d.publicSpecs === undefined ? undefined : validateStockSpecs(d.publicSpecs);
  const photos = d.photos ?? [];
  if (!Array.isArray(photos) || photos.length > 8 || photos.some(p => typeof p !== 'string' || p.length > 2000 || !(/^https:\/\//.test(p) || process.env.FIREBASE_STORAGE_EMULATOR_HOST && /^http:\/\/127\.0\.0\.1:9199\//.test(p)))) throw new HttpsError('invalid-argument', 'Use up to eight HTTPS photo links');
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, staff.companyId);
    const s = owned((await tx.get(ref)).data(),staff.companyId);
    if (d.published === true && s.status !== 'available') throw new HttpsError('failed-precondition','Only available stock can be published');
    tx.update(ref,{published:d.published === true,description,photos,...(publicSpecs === undefined ? {} : {publicSpecs}),updatedAt:ts()});
  });
  return {stockId:ref.id};
});

async function showroomCompany(slug: unknown) {
  const normalized = text(slug,'Dealer address');
  if (!/^[a-z0-9-]{1,100}$/.test(normalized)) throw new HttpsError('invalid-argument','Invalid dealer address');
  const result = await db.collection('companies').where('slug','==',normalized).limit(1).get();
  const company = result.docs[0];
  if (!company || company.data().isActive !== true) throw new HttpsError('not-found','Showroom unavailable');
  return company;
}
async function publicSpecsFor(stock: FirebaseFirestore.QueryDocumentSnapshot[]) {
  if (!stock.length) return new Map();
  const vehicles = await db.getAll(...stock.map(s => db.doc(`vehicles/${s.id}`)));
  return new Map(stock.map((s,i) => [s.id,stockSpecsProjection(s.data(),vehicles[i].data()?.companyId === s.data().companyId ? vehicles[i].data() : {})]));
}
export const dealerShowroom = onCall(async request => {
  const company = await showroomCompany(request.data.slug); const c = company.data();
  const stock = await db.collection('dealer_stock').where('companyId','==',company.id).limit(100).get();
  const specs = await publicSpecsFor(stock.docs);
  return {name:c.name,slug:c.slug,whatsapp:c.contactWhatsapp,limited:stock.size===100,acceptsEnquiries:subscriptionState(c.subscription).writable,stock:stock.docs.filter(doc => subscriptionState(c.subscription).writable && doc.data().published === true && doc.data().status === 'available').map(doc => {
    const s = doc.data();
    return {id:doc.id,title:s.title,location:s.location,askingPriceCents:s.askingPriceCents,description:s.description ?? '',photos:s.photos ?? [],specs:specs.get(doc.id) ?? {}};
  })};
});

// Only intentionally published, currently available stock enters public discovery.
// Explicit projection keeps tenant operations and buyer records private.
export const publicVehicleCatalogue = onCall(async () => {
  const stock = await db.collection('dealer_stock').where('published','==',true).limit(100).get();
  const specs = await publicSpecsFor(stock.docs);
  const ids = [...new Set(stock.docs.map(s => s.data().companyId).filter(v => typeof v === 'string'))];
  const companies = await Promise.all(ids.map(companyId => db.doc(`companies/${companyId}`).get()));
  const publicCompanies = new Map(companies.filter(c => c.exists && c.data()?.isActive === true && subscriptionState(c.data()?.subscription).writable && /^[a-z0-9-]{1,100}$/.test(c.data()?.slug ?? '')).map(c => [c.id,c.data()!]));
  return { stock: stock.docs.flatMap(doc => {
    const s=doc.data(); const company=publicCompanies.get(s.companyId);
    if(!company || s.status !== 'available') return [];
    return [{id:doc.id,title:s.title,location:s.location,askingPriceCents:s.askingPriceCents,photos:s.photos ?? [],dealerName:company.name,slug:company.slug,specs:specs.get(doc.id) ?? {}}];
  }), limited: stock.size === 100 };
});

export const enquireDealerShowroom = onCall(async request => {
  const d = request.data; const company = await showroomCompany(d.slug);
  const name = text(d.name,'Name'); const phone = text(d.phone,'Phone'); const preferences = text(d.preferences,'Vehicle request');
  const interest = d.interest ?? 'either';
  if (!['stock','import','either'].includes(interest)) throw new HttpsError('invalid-argument','Invalid interest');
  const budgetCents = cents(d.budgetCents ?? 0);
  const stockId = d.stockId ? id(d.stockId) : undefined;
  const hour = Math.floor(Date.now()/3600000);
  const key = createHash('sha256').update(`${company.id}|${request.rawRequest.ip}|${hour}`).digest('hex');
  const throttle = db.collection('dealer_enquiry_limits').doc(key); const lead = db.collection('dealer_leads').doc();
  await db.runTransaction(async tx => {
    await transactionWriteCheck(tx, company.id);
    const selected = stockId ? owned((await tx.get(db.doc(`dealer_stock/${stockId}`))).data(),company.id) : undefined;
    if (selected && (selected.published !== true || selected.status !== 'available')) throw new HttpsError('failed-precondition','This vehicle is no longer available. Contact the dealer for alternatives.');
    if (stockId && interest !== 'stock') throw new HttpsError('invalid-argument','A selected stock enquiry must use stock interest');
    const current = (await tx.get(throttle)).data()?.count ?? 0;
    if (current >= 10) throw new HttpsError('resource-exhausted','Too many enquiries. Contact the dealer on WhatsApp.');
    tx.set(throttle,{count:current+1,expiresAt:new Date((hour+2)*3600000)});
    tx.set(lead,{companyId:company.id,name,phone,preferences,interest,budgetCents,status:'new',followUp:'',source:'showroom',...(stockId ? {stockId,stockTitle:selected!.title} : {}),createdAt:ts(),updatedAt:ts()});
  });
  return {received:true};
});
