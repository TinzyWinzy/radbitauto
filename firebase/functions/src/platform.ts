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
