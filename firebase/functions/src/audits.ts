import { FieldValue } from 'firebase-admin/firestore';
import { db } from './db.ts';

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

export function serverNow(): ReturnType<typeof FieldValue.serverTimestamp> {
  return FieldValue.serverTimestamp();
}