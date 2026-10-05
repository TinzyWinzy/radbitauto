import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './db.ts';
import { contextFrom, requirePlatformCaller } from './claims.ts';
import { writeAudit, ts } from './audits.ts';

// Compatibility endpoint: grants no privilege unless the server-side operator
// membership already exists. Email strings alone never establish authority.
export const claimPlatformAdmin = onCall(async (request) => {
  const ctx = contextFrom(request);
  await requirePlatformCaller(ctx);
  await getAuth().setCustomUserClaims(ctx.uid, { app_role: 'platform_admin', platform_admin: true });
  await writeAudit({ actorId: ctx.uid, entityType: 'users', entityId: ctx.uid, action: 'platform.refresh' });
  return { appRole: 'platform_admin' };
});

export const assumeTenantRole = onCall<{
  companyId: string;
  role: 'staff' | 'admin' | 'customer';
  customerId?: string;
}>(async (request) => {
  const ctx = contextFrom(request);
  await requirePlatformCaller(ctx);
  const { companyId, role, customerId } = request.data;
  if (!companyId || !role) {
    throw new HttpsError('invalid-argument', 'companyId and role are required');
  }
  if (role !== 'staff' && role !== 'admin' && role !== 'customer') {
    throw new HttpsError('invalid-argument', 'role must be staff, admin or customer');
  }
  const companySnap = await db.collection('companies').doc(companyId).get();
  if (!companySnap.exists || companySnap.data()?.isActive !== true) {
    throw new HttpsError('not-found', 'company not found or inactive');
  }

  if (role === 'customer') {
    if (!customerId) {
      throw new HttpsError('invalid-argument', 'customerId is required for customer view');
    }
    const custSnap = await db.collection('customers').doc(customerId).get();
    const cust = custSnap.data() as { companyId?: string; isActive?: boolean; userId?: string } | undefined;
    if (!custSnap.exists || cust?.companyId !== companyId || cust.isActive !== true) {
      throw new HttpsError('not-found', 'customer not found in this company');
    }
    if (cust.userId) {
      const userSnap = await db.collection('users').doc(cust.userId).get();
      if (!userSnap.exists || userSnap.data()?.isActive !== true) {
        throw new HttpsError('failed-precondition', 'customer user is inactive');
      }
    }
    await getAuth().setCustomUserClaims(ctx.uid, {
      app_role: 'customer',
      company_id: companyId,
      customer_id: customerId,
      platform_admin: true,
    });
    await writeAudit({
      companyId,
      actorId: ctx.uid,
      entityType: 'users',
      entityId: ctx.uid,
      action: 'platform.assume',
      detail: { role, customerId },
    });
    return { appRole: 'customer', companyId, customerId };
  }

  await db.runTransaction(async txn => {
    const company = await txn.get(db.doc(`companies/${companyId}`));if(company.data()?.isActive!==true)throw new HttpsError('permission-denied','Agency unavailable');
    txn.set(db.doc(`staff/${ctx.uid}`), { companyId, role, isActive: true, isPlatformView:true, createdAt: ts() }, { merge: true });
  });
  await getAuth().setCustomUserClaims(ctx.uid, {
    app_role: role,
    company_id: companyId,
    platform_admin: true,
  });
  await writeAudit({
    companyId,
    actorId: ctx.uid,
    entityType: 'users',
    entityId: ctx.uid,
    action: 'platform.assume',
    detail: { role },
  });
  return { appRole: role, companyId };
});

export const backfillVehicleCustomers = onCall<{ limit?: number }>(async (request) => {
  const ctx = contextFrom(request);
  await requirePlatformCaller(ctx);
  const limit = Math.min(Math.max(request.data.limit ?? 500, 1), 1000);
  const snap = await db.collection('import_cases').limit(limit).get();
  let linked = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    const data = d.data() as { customerId?: string; vehicleId?: string };
    if (!data.customerId || !data.vehicleId) {
      skipped += 1;
      continue;
    }
    try {
      await db
        .collection('vehicles')
        .doc(data.vehicleId)
        .update({ customerIds: FieldValue.arrayUnion(data.customerId) });
      linked += 1;
    } catch {
      skipped += 1;
    }
  }
  await writeAudit({
    actorId: ctx.uid,
    entityType: 'vehicles',
    entityId: 'all',
    action: 'platform.backfillVehicleCustomers',
    detail: { scanned: snap.size, linked, skipped },
  });
  return { scanned: snap.size, linked, skipped };
});

export const leaveTenant = onCall(async (request) => {
  const ctx = contextFrom(request);
  await requirePlatformCaller(ctx);
  await getAuth().setCustomUserClaims(ctx.uid, {
    app_role: 'platform_admin',
    platform_admin: true,
  });
  await writeAudit({
    companyId: ctx.companyId,
    actorId: ctx.uid,
    entityType: 'users',
    entityId: ctx.uid,
    action: 'platform.leave',
    detail: {},
  });
  return { appRole: 'platform_admin' };
});
