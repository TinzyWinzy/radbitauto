import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const enabled=!!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
initializeApp({projectId:'demo-vehicle-import'});
const db=getFirestore();
const {attachVehiclePhoto}=await import('../../src/dealerJourneys.ts');
const auth={uid:'photo-owner',token:{app_role:'admin',company_id:'photo-company'}};

test('registered vehicle photos are tenant scoped, deduplicated, audited and read-only on expiry',{skip:!enabled},async()=>{
  const company=db.doc('companies/photo-company');
  await company.set({isActive:true,subscription:{version:1,planId:'dealer',status:'active',accessUntil:new Date(Date.now()+86400000)}});
  await db.doc('users/photo-owner').set({isActive:true});
  await db.doc('staff/photo-owner').set({isActive:true,companyId:'photo-company',role:'admin'});
  const vehicle=db.doc('vehicles/photo-vehicle');await vehicle.set({companyId:'photo-company'});
  const path='stock-photos/photo-company/photo-vehicle/abcdefghijklm';
  await getStorage().bucket('studio-285787437-bc95b.firebasestorage.app').file(path).save(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZ8AAAAASUVORK5CYII=','base64'),{contentType:'image/png'});
  const request:any={auth,data:{vehicleId:'photo-vehicle',path}};
  const first=await attachVehiclePhoto.run(request);await attachVehiclePhoto.run(request);
  assert.deepEqual((await vehicle.get()).data()?.photos,[first.url]);
  const audits=await db.collection('audit_log').where('entityId','==','photo-vehicle').get();
  assert.equal(audits.docs.filter(doc=>doc.data().action==='attach_photo').length,1);
  await db.doc('vehicles/other-photo-vehicle').set({companyId:'another-company'});
  await assert.rejects(attachVehiclePhoto.run({...request,data:{vehicleId:'other-photo-vehicle',path:'stock-photos/photo-company/other-photo-vehicle/abcdefghijklm'}}));
  await company.update({'subscription.accessUntil':new Date(Date.now()-86400000)});
  await assert.rejects(attachVehiclePhoto.run(request));
  assert.deepEqual((await vehicle.get()).data()?.photos,[first.url]);
});
