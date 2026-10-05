import { trialSubscription } from './subscriptions.ts';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { db } from './db.ts';
import { contextFrom } from './claims.ts';
import { ts } from './audits.ts';
import { STAGES } from './constants.ts';
import { stageEnabledFor, validateAgencyRegistration } from './agencyConfig.ts';
import type { AgencyRegistration } from './agencyConfig.ts';

export const registerAgency = onCall<AgencyRegistration>(async (request) => {
  const ctx = contextFrom(request);
  if (request.auth?.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before creating an agency');
  if (ctx.platformAdmin || ctx.appRole === 'customer' || ctx.appRole === 'staff') throw new HttpsError('permission-denied', 'This account already has a different membership');
  let config: AgencyRegistration;
  try { config = validateAgencyRegistration(request.data); }
  catch (error) { throw new HttpsError('invalid-argument', (error as Error).message); }

  const companyId = createHash('sha256').update(`agency-owner:${ctx.uid}`).digest('hex');
  await db.runTransaction(async (txn) => {
    const userRef = db.collection('users').doc(ctx.uid);
    const staffRef = db.collection('staff').doc(ctx.uid);
    const companyRef = db.collection('companies').doc(companyId);
    const slugRef = db.collection('company_slugs').doc(config.slug);
    const [user, membership, platform, customers, company, slug, existingSlugs] = await Promise.all([
      txn.get(userRef), txn.get(staffRef), txn.get(db.collection('platform_admins').doc(ctx.uid)),
      txn.get(db.collection('customers').where('userId', '==', ctx.uid)),
      txn.get(companyRef), txn.get(slugRef), txn.get(db.collection('companies').where('slug', '==', config.slug)),
    ]);
    if ((user.exists && user.data()?.isActive !== true) || platform.exists || !customers.empty) {
      throw new HttpsError('permission-denied', 'This account cannot create an agency');
    }
    if (membership.exists) {
      if (membership.data()?.companyId === companyId && membership.data()?.role === 'admin' && membership.data()?.isActive === true && company.data()?.ownerUserId === ctx.uid && company.data()?.slug === config.slug && company.data()?.isActive === true) return;
      throw new HttpsError('already-exists', 'This account already belongs to an agency');
    }
    if (ctx.companyId || ctx.appRole || company.exists) throw new HttpsError('permission-denied', 'Account membership requires administrator review');
    if (slug.exists || !existingSlugs.empty) throw new HttpsError('already-exists', 'That agency address is already in use');
    const now = ts();
    txn.set(companyRef, { ...config, ownerUserId: ctx.uid, isActive: true, subscription: trialSubscription(), createdAt: now });
    txn.create(slugRef, { companyId });
    if (!user.exists) txn.create(userRef, { email: request.auth!.token.email ?? '', fullName: request.auth!.token.name ?? '', isActive: true, createdAt: now });
    txn.create(staffRef, { companyId, role: 'admin', isActive: true, createdAt: now });
    txn.create(db.collection('company_settings').doc(companyId), { currency: 'USD', paymentMethods: ['EcoCash', 'InnBucks', 'Bank', 'Cash'], updatedAt: now });
    txn.create(companyRef.collection('meta').doc('counter'), { lastSeq: 0 });
    for (const [index, stage] of STAGES.entries()) {
      txn.create(companyRef.collection('stages').doc(stage.key), { position: index + 1, enabled: stageEnabledFor(config.operationMode, stage.key) });
    }
    txn.create(db.collection('audit_log').doc(), { companyId, actorId: ctx.uid, entityType: 'companies', entityId: companyId, action: 'self_register', detail: { slug: config.slug, operationMode: config.operationMode }, createdAt: now });
  });
  // Retrying after a token-service failure repairs claims without creating a second tenant.
  await getAuth().setCustomUserClaims(ctx.uid, { app_role: 'admin', company_id: companyId });
  return { companyId };
});
