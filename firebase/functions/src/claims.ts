import { subscriptionState } from './subscriptionPolicy.ts';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import type { AppRole, CompanyId, PlatformAdminDoc, StaffDoc, UserDoc } from './types.ts';

export interface AuthContext {
  uid: string;
  appRole?: string;
  companyId?: string;
  customerId?: string;
  platformAdmin: boolean;
}

export function contextFrom(request: CallableRequest): AuthContext {
  if (request.auth === undefined || request.auth === null) {
    throw new HttpsError('unauthenticated', 'not authenticated');
  }
  return {
    uid: request.auth.uid,
    appRole: request.auth.token.app_role as string | undefined,
    companyId: request.auth.token.company_id as string | undefined,
    customerId: request.auth.token.customer_id as string | undefined,
    platformAdmin: request.auth.token.platform_admin === true,
  };
}

export function assertStaff(ctx: AuthContext): void {
  if (ctx.appRole !== 'staff' && ctx.appRole !== 'admin') {
    throw new HttpsError('permission-denied', 'staff only');
  }
}

export function assertAdmin(ctx: AuthContext): void {
  if (ctx.appRole !== 'admin' || !ctx.companyId) {
    throw new HttpsError('permission-denied', 'admin only');
  }
}

export function assertTenant(ctx: AuthContext, companyId: CompanyId): void {
  if (ctx.companyId === undefined || ctx.companyId !== companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }
}

export async function requireActiveUser(uid: string): Promise<UserDoc> {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'user profile not found');
  }
  const user = snap.data() as UserDoc;
  if (user.isActive !== true) {
    throw new HttpsError('permission-denied', 'user profile inactive');
  }
  return user;
}

export async function requirePlatformCaller(ctx: AuthContext): Promise<PlatformAdminDoc> {
  if (ctx.platformAdmin !== true) {
    throw new HttpsError('permission-denied', 'platform admin only');
  }
  await requireActiveUser(ctx.uid);
  const snap = await db.collection('platform_admins').doc(ctx.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'platform membership not found');
  }
  const membership = snap.data() as PlatformAdminDoc;
  if (membership.isActive !== true) {
    throw new HttpsError('permission-denied', 'platform membership inactive');
  }
  return membership;
}

export async function requireStaff(ctx: AuthContext, readOnly = false): Promise<StaffDoc> {
  assertStaff(ctx);
  await requireActiveUser(ctx.uid);
  const snap = await db.collection('staff').doc(ctx.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'staff profile not found');
  }
  const staff = snap.data() as StaffDoc;
  if (staff.isActive !== true) {
    throw new HttpsError('permission-denied', 'staff profile inactive');
  }
  if (!ctx.companyId || staff.companyId !== ctx.companyId) {
    throw new HttpsError('permission-denied', 'not authorized for this tenant');
  }
  if (staff.isPlatformView === true) await requirePlatformCaller(ctx);
  const companySnap = await db.collection('companies').doc(staff.companyId).get();
  if (!companySnap.exists || companySnap.data()?.isActive !== true) {
    throw new HttpsError('permission-denied', 'company inactive or unavailable');
  }
  if (!readOnly && !subscriptionState(companySnap.data()?.subscription).writable) throw new HttpsError('failed-precondition', 'Subscription is read-only. Renew from Billing; existing records remain available.');
  return staff;
}

export async function requireAdmin(ctx: AuthContext, readOnly = false): Promise<StaffDoc> {
  const staff = await requireStaff(ctx, readOnly);
  if (staff.role !== 'admin') {
    throw new HttpsError('permission-denied', 'admin only');
  }
  return staff;
}

export function isStaff(context: AuthContext): boolean {
  return context.appRole === 'staff' || context.appRole === 'admin';
}

export type { AppRole };
