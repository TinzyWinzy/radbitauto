import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
const enabled=!!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
let env: RulesTestEnvironment;
before(async()=>{if(!enabled)return;env=await initializeTestEnvironment({projectId:'demo-vehicle-import',firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../../../firestore.rules',import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:9199,rules:await readFile(new URL('../../../storage.rules',import.meta.url),'utf8')}});});
after(async()=>{if(enabled)await env.cleanup();});
test('active subscription permits uploads; expiry permits file reads but denies new uploads',{skip:!enabled},async()=>{
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await db.doc('companies/storage-sub').set({isActive:true,subscription:{version:1,planId:'dealer',status:'active',accessUntil:new Date(Date.now()+86400000)}});await db.doc('users/storage-staff').set({isActive:true});await db.doc('staff/storage-staff').set({companyId:'storage-sub',role:'admin',isActive:true});await db.doc('dealer_stock/storage-stock').set({companyId:'storage-sub'});await db.doc('import_cases/storage-case').set({companyId:'storage-sub'});});
  const ctx=env.authenticatedContext('storage-staff',{app_role:'admin',company_id:'storage-sub'});const storage=ctx.storage();
  const photo=storage.ref('stock-photos/storage-sub/storage-stock/abcdefghijk');
  await assertSucceeds(Promise.resolve(photo.put(new Uint8Array([1,2,3]),{contentType:'image/png'})));
  await assertSucceeds(Promise.resolve(storage.ref('documents/storage-sub/storage-case/purchase_invoice/abcdefghijk/invoice.pdf').put(new Uint8Array([1,2,3]),{contentType:'application/pdf'})));
  await env.withSecurityRulesDisabled(async ctx=>{await ctx.firestore().doc('companies/storage-sub').update({'subscription.accessUntil':new Date(Date.now()-86400000)});});
  await assertSucceeds(photo.getMetadata());
  await assertFails(Promise.resolve(storage.ref('stock-photos/storage-sub/storage-stock/newabcdefghijk').put(new Uint8Array([1,2,3]),{contentType:'image/png'})));
  await assertFails(Promise.resolve(storage.ref('payment-proofs/storage-sub/storage-case/Bank/abcdefghijk').put(new Uint8Array([1,2,3]),{contentType:'image/png'})));
});
