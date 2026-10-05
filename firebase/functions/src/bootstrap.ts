import { transactionWriteCheck } from './subscriptions.ts';
import { capacityCheck, trialSubscription } from './subscriptions.ts';
import { randomBytes } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from './db.ts';
import type { CustomerDoc } from './types.ts';
import { contextFrom, requireActiveUser, requireAdmin, requirePlatformCaller, requireStaff } from './claims.ts';
import { writeAudit, ts } from './audits.ts';
import { DEFAULT_TAX_RATE_SET, STAGES } from './constants.ts';

function lastTokenLower(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1]?.toLowerCase() ?? '';
}

async function ensureStageDefinitions(): Promise<void> {
  const batch = db.batch();
  let wrote = false;
  for (const [index, stage] of STAGES.entries()) {
    const ref = db.collection('stage_definitions').doc(stage.key);
    const snap = await ref.get();
    if (!snap.exists) {
      batch.set(ref, {
        label: stage.label,
        defaultPosition: index + 1,
        isDefaultEnabled: true,
      });
      wrote = true;
    }
  }
  if (wrote) {
    await batch.commit();
  }
}

async function seedDefaultTaxRateIfAbsent(): Promise<void> {
  const snap = await db
    .collection('config')
    .doc('tax_rates')
    .collection('sets')
    .where('scope', '==', 'all')
    .limit(1)
    .get();
  if (!snap.empty) {
    return;
  }
  await db
    .collection('config')
    .doc('tax_rates')
    .collection('sets')
    .add({
      ...DEFAULT_TAX_RATE_SET,
      createdAt: new Date().toISOString(),
    });
}

async function writeCompanyStages(companyId: string): Promise<void> {
  for (const [index, stage] of STAGES.entries()) {
    await db
      .collection('companies')
      .doc(companyId)
      .collection('stages')
      .doc(stage.key)
      .set({ position: index + 1, enabled: true });
  }
}

export const bootstrapCompany = onCall<{
  slug: string;
  name: string;
  casePrefix: string;
  contactWhatsapp: string;
  adminEmail: string;
  adminFullName: string;
  adminPhoneNumber?: string;
  primaryColor?: string;
  secondaryColor?: string;
  defaultPort?: 'Durban' | 'Beira' | 'Walvis Bay';
  currency?: string;
  paymentMethods?: string[];
}>(async (request) => {
  const ctx = contextFrom(request);
  await requirePlatformCaller(ctx);

  const { slug, name, casePrefix, contactWhatsapp, adminEmail, adminFullName } = request.data;
  if (!slug || !name || !casePrefix || !contactWhatsapp || !adminEmail || !adminFullName) {
    throw new HttpsError(
      'invalid-argument',
      'slug, name, casePrefix, contactWhatsapp, adminEmail, adminFullName are required',
    );
  }

  await ensureStageDefinitions();
  await seedDefaultTaxRateIfAbsent();

  const existingAdmin = await getAuth().getUserByEmail(adminEmail).catch(() => null);
  if (existingAdmin) {
    const existingStaff = await db.collection('staff').doc(existingAdmin.uid).get();
    const staffData = existingStaff.data() as { companyId?: string; role?: string; isActive?: boolean } | undefined;
    if (!existingStaff.exists || staffData?.isActive !== true || staffData.role !== 'admin' || !staffData.companyId) {
      throw new HttpsError('failed-precondition', 'existing account is not an active tenant administrator');
    }
    return { companyId: staffData.companyId, adminUid: existingAdmin.uid, tempPassword: null, alreadyExisting: true };
  }

  const companyRef = await db.collection('companies').add({
    slug,
    name,
    casePrefix,
    contactWhatsapp,
    primaryColor: request.data.primaryColor ?? '#1d4ed8',
    secondaryColor: request.data.secondaryColor ?? null,
    defaultPort: request.data.defaultPort ?? 'Durban',
    isActive: true,
    subscription: trialSubscription(),
    createdAt: ts(),
  });
  const companyId = companyRef.id;

  await db.collection('company_settings').doc(companyId).set({
    currency: 'USD',
    paymentMethods: request.data.paymentMethods ?? ['EcoCash', 'InnBucks', 'Bank'],
    updatedAt: ts(),
  });

  const tempPassword = randomBytes(9).toString('base64url');
  const userRecord = await getAuth().createUser({
    email: adminEmail,
    displayName: adminFullName,
    password: tempPassword,
    disabled: false,
  });

  await db.collection('users').doc(userRecord.uid).set({
    email: adminEmail,
    fullName: adminFullName,
    phoneNumber: request.data.adminPhoneNumber ?? null,
    isActive: true,
    createdAt: ts(),
  });
  await db.collection('staff').doc(userRecord.uid).set({
    companyId,
    role: 'admin',
    isActive: true,
    createdAt: ts(),
  });
  await companyRef.update({ownerUserId:userRecord.uid});
  await getAuth().setCustomUserClaims(userRecord.uid, {
    app_role: 'admin',
    company_id: companyId,
  });

  await writeCompanyStages(companyId);

  await writeAudit({
    companyId,
    actorId: ctx.uid,
    entityType: 'companies',
    entityId: companyId,
    action: 'bootstrap',
    detail: { slug: request.data.slug },
  });

  return { companyId, adminUid: userRecord.uid, tempPassword };
});

export const createStaff = onCall<{
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: 'staff' | 'admin';
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx);

  if (!['staff','admin'].includes(request.data.role)) throw new HttpsError('invalid-argument','Invalid staff role');
  const tempPassword = randomBytes(9).toString('base64url');
  const userRecord = await getAuth()
    .createUser({
      email: request.data.email,
      displayName: request.data.fullName,
      password: tempPassword,
      disabled: false,
    })
    .catch((err: { code?: string }) => {
      if (err?.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'an account already exists for this email');
      }
      throw err;
    });

  await db.collection('users').doc(userRecord.uid).set({
    email: request.data.email,
    fullName: request.data.fullName,
    phoneNumber: request.data.phoneNumber ?? null,
    isActive: true,
    createdAt: ts(),
  });
  try {
    await db.runTransaction(async txn => {
      const lock = await capacityCheck(txn, staff.companyId, { seat: true }); lock();
      txn.create(db.doc(`staff/${userRecord.uid}`), { companyId: staff.companyId, role: request.data.role, isActive: true, createdAt: ts() });
    });
  } catch (error) {
    await getAuth().deleteUser(userRecord.uid);
    await db.doc(`users/${userRecord.uid}`).delete();
    throw error;
  }
  await getAuth().setCustomUserClaims(userRecord.uid, {
    app_role: request.data.role,
    company_id: staff.companyId,
  });

  return { staffUid: userRecord.uid, tempPassword };
});

export const linkCustomer = onCall<{
  customerId?: string;
  userId?: string;
  email?: string;
  fullName: string;
  phoneNumber: string;
  whatsappRef?: string;
}>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireStaff(ctx);
  const { userId, email, fullName, phoneNumber, whatsappRef } = request.data;

  let targetUid: string;
  if (userId !== undefined && userId !== '') {
    targetUid = userId;
    await getAuth().getUser(targetUid).catch(() => {
      throw new HttpsError('not-found', 'auth user not found');
    });
  } else if (email !== undefined && email !== '') {
    targetUid = await getAuth()
      .getUserByEmail(email)
      .then((rec) => rec.uid)
      .catch(() => {
        throw new HttpsError('not-found', `no account found for ${email}`);
      });
  } else {
    throw new HttpsError('invalid-argument', 'provide userId or email');
  }

  const targetUser = await getAuth().getUser(targetUid);
  await requireActiveUser(targetUid);
  if (targetUser.disabled) {
    throw new HttpsError('permission-denied', 'auth user inactive');
  }

  const staffSnap = await db.collection('staff').doc(targetUid).get();
  if (staffSnap.exists) {
    throw new HttpsError('already-exists', 'user already has staff membership');
  }
  const platformSnap = await db.collection('platform_admins').doc(targetUid).get();
  if (platformSnap.exists) {
    throw new HttpsError('already-exists', 'user already has platform membership');
  }
  const targetClaims = targetUser.customClaims ?? {};
  if (
    targetClaims.app_role === 'staff' ||
    targetClaims.app_role === 'admin' ||
    targetClaims.app_role === 'platform_admin' ||
    targetClaims.platform_admin === true
  ) {
    throw new HttpsError('already-exists', 'user already has staff or platform membership');
  }

  const linked = await db.collection('customers').where('userId', '==', targetUid).get();
  const foreign = linked.docs.find((d) => d.data()?.companyId !== staff.companyId);
  if (foreign) {
    throw new HttpsError('already-exists', 'user is already linked to another company');
  }
  const existing = linked.docs.find((d) => d.data()?.companyId === staff.companyId);
  const requestedRecord = request.data.customerId ? await db.collection('customers').doc(request.data.customerId).get() : null;
  if (requestedRecord && (!requestedRecord.exists || requestedRecord.data()?.companyId !== staff.companyId || requestedRecord.data()?.isActive !== true)) throw new HttpsError('not-found', 'customer record not found for this tenant');
  if (requestedRecord?.data()?.userId && requestedRecord.data()!.userId !== targetUid) throw new HttpsError('already-exists', 'customer record already has account access');
  if (existing && requestedRecord && existing.id !== requestedRecord.id) throw new HttpsError('already-exists', 'account is linked to another customer record');
  const customerData = {
    companyId: staff.companyId,
    userId: targetUid,
    fullName,
    lastNameLower: lastTokenLower(fullName),
    phoneNumber,
    whatsappRef,
    isActive: true,
    updatedAt: ts(),
  };
  const customerRef: DocumentReference = existing?.ref ?? requestedRecord?.ref ?? db.collection('customers').doc();
  const action = existing || requestedRecord ? 'link.repair' : 'link';
  await db.runTransaction(async (txn) => {
    await transactionWriteCheck(txn, staff.companyId);
    const [record, memberships, currentStaff, currentPlatform, profile] = await Promise.all([
      txn.get(customerRef), txn.get(db.collection('customers').where('userId', '==', targetUid)),
      txn.get(db.collection('staff').doc(targetUid)), txn.get(db.collection('platform_admins').doc(targetUid)),
      txn.get(db.collection('users').doc(targetUid)),
    ]);
    if (currentStaff.exists || currentPlatform.exists || !profile.exists || profile.data()?.isActive !== true) throw new HttpsError('permission-denied', 'account membership changed before linking');
    if (memberships.docs.some((doc) => doc.id !== customerRef.id)) throw new HttpsError('already-exists', 'account already belongs to another customer record');
    if (record.exists && (record.data()?.companyId !== staff.companyId || record.data()?.isActive !== true || (record.data()?.userId && record.data()?.userId !== targetUid))) throw new HttpsError('permission-denied', 'customer record changed before linking');
    if (record.exists) txn.update(customerRef, customerData);
    else txn.create(customerRef, { ...customerData, createdAt: ts() } satisfies CustomerDoc);
    txn.update(profile.ref, { fullName, phoneNumber });
    txn.create(db.collection('audit_log').doc(), { companyId: staff.companyId, actorId: ctx.uid, entityType: 'customers', entityId: customerRef.id, action, detail: { userId: targetUid }, createdAt: ts() });
  });

  await getAuth().setCustomUserClaims(targetUid, {
    app_role: 'customer',
    company_id: staff.companyId,
    customer_id: customerRef.id,
  });

  return { customerId: customerRef.id };
});

export const deactivateAccount = onCall<{ userId: string }>(async (request) => {
  const ctx = contextFrom(request);
  const staff = await requireAdmin(ctx, true);
  const targetUid = request.data.userId;
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'userId is required');
  }

  const targetUser = await getAuth().getUser(targetUid).catch(() => null);
  if (!targetUser) {
    throw new HttpsError('not-found', 'auth user not found');
  }
  const targetUserSnap = await db.collection('users').doc(targetUid).get();
  if (!targetUserSnap.exists || targetUserSnap.data()?.isActive !== true) {
    throw new HttpsError('not-found', 'active user profile not found');
  }
  const targetStaff = await db.collection('staff').doc(targetUid).get();
  if (targetStaff.exists && targetStaff.data()?.companyId !== staff.companyId) {
    throw new HttpsError('permission-denied', 'target user belongs to another tenant');
  }
  if (targetStaff.exists && targetStaff.data()?.role === 'admin') {
    const tenantStaff = await db
      .collection('staff')
      .where('companyId', '==', staff.companyId)
      .get();
    const activeAdmins = tenantStaff.docs.filter(
      (document) => document.data()?.role === 'admin' && document.data()?.isActive === true,
    );
    if (activeAdmins.length <= 1) {
      throw new HttpsError('failed-precondition', 'the last active tenant administrator cannot be deactivated');
    }
  }
  if ((await db.collection('platform_admins').doc(targetUid).get()).exists) {
    throw new HttpsError('permission-denied', 'platform accounts cannot be deactivated by a tenant admin');
  }
  const targetCustomers = await db.collection('customers').where('userId', '==', targetUid).get();
  if (
    targetCustomers.docs.some((d) => d.data()?.companyId !== staff.companyId) ||
    (!targetStaff.exists && targetCustomers.empty)
  ) {
    throw new HttpsError('permission-denied', 'target user is not a member of this tenant');
  }

  await db.collection('users').doc(targetUid).update({ isActive: false });
  if (targetStaff.exists) {
    await targetStaff.ref.update({ isActive: false });
  }
  for (const customer of targetCustomers.docs) {
    await customer.ref.update({ isActive: false });
  }
  await getAuth().setCustomUserClaims(targetUid, {});
  await targetUserRecordDisable(targetUid);
  await writeAudit({
    companyId: staff.companyId,
    actorId: ctx.uid,
    entityType: 'users',
    entityId: targetUid,
    action: 'deactivate',
    detail: { disabledAuth: true, clearedClaims: true },
  });
  return { userId: targetUid, isActive: false };
});

async function targetUserRecordDisable(uid: string): Promise<void> {
  await getAuth().updateUser(uid, { disabled: true });
}

export const ensureBaseline = onCall(async (request) => {
  const ctx = contextFrom(request);
  await requireAdmin(ctx);
  await ensureStageDefinitions();
  await seedDefaultTaxRateIfAbsent();
  return { stageDefinitions: STAGES.length, taxRateSeeded: true };
});
