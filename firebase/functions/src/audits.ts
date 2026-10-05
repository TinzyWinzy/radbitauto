import { FieldValue } from 'firebase-admin/firestore';
import { db } from './db.ts';
import type { NotificationDoc } from './types.ts';

export function ts(): FieldValue {
  return FieldValue.serverTimestamp();
}

export async function writeAudit(input: {
  companyId?: string;
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await db.collection('audit_log').add({
    companyId: input.companyId ?? null,
    actorId: input.actorId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    detail: input.detail ?? {},
    createdAt: ts(),
  });
}

export async function notifyCaseUpdate(input: {
  caseId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const caseSnap = await db.collection('import_cases').doc(input.caseId).get();
  if (!caseSnap.exists) {
    return;
  }
  const caseDoc = caseSnap.data();
  const caseData = caseDoc as Record<string, any> | undefined;
  if (caseData === undefined) {
    return;
  }
  const customerSnap = await db.collection('customers').doc(caseData.customerId).get();
  if (!customerSnap.exists) {
    return;
  }
  const customerData = customerSnap.data() as Record<string, any> | undefined;
  const userId = customerData === undefined ? undefined : (customerData.userId as string | undefined);
  if (userId === undefined || userId === null || userId === '') {
    return;
  }
  const notification: NotificationDoc = {
    companyId: caseData.companyId,
    caseId: input.caseId,
    type: input.type,
    title: input.title,
    body: input.body,
    payload: { caseRef: caseData.caseNum, stage: caseData.currentStage, ...(input.payload ?? {}) },
    createdAt: ts(),
  };
  await db.collection('users').doc(userId).collection('notifications').add(notification);
}

export async function bestEffortNotify(input: {
  caseId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await notifyCaseUpdate(input);
  } catch {
    return;
  }
}

export function serverNow(): ReturnType<typeof FieldValue.serverTimestamp> {
  return FieldValue.serverTimestamp();
}