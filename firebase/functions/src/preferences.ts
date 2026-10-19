import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom, requireActiveUser } from './claims.ts';
import { resolveNotificationPrefs } from './notificationPolicy.ts';
import type { NotificationPrefs } from './types.ts';

export const updateNotificationPrefs = onCall<Partial<NotificationPrefs>>(async (request) => {
  const ctx = contextFrom(request);
  await requireActiveUser(ctx.uid);
  const data = request.data ?? {};
  const allowed: (keyof NotificationPrefs)[] = ['email', 'whatsapp', 'sms', 'marketing'];
  const patch: Partial<NotificationPrefs> = {};
  for (const key of allowed) {
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `Preference ${key} must be true or false`);
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) throw new HttpsError('invalid-argument', 'No notification preferences provided');
  await db.collection('users').doc(ctx.uid).set({ notificationPrefs: patch }, { merge: true });
  const stored = (await db.collection('users').doc(ctx.uid).get()).data()?.notificationPrefs;
  return { notificationPrefs: resolveNotificationPrefs(stored) };
});
