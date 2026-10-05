import * as functions from 'firebase-functions/v1';
import { db } from './db.ts';
import { ts } from './audits.ts';

export const onUserCreate = functions.auth.user().onCreate(async (userRecord) => {
  const ref = db.collection('users').doc(userRecord.uid);
  const existing = await ref.get();
  if (existing.exists) {
    return;
  }
  await ref.create({
    email: userRecord.email ?? '',
    fullName: userRecord.displayName ?? '',
    phoneNumber: userRecord.phoneNumber ?? null,
    isActive: true,
    createdAt: ts(),
  }).catch((error: { code?: number }) => {
    // Self-service onboarding may create the profile before this trigger arrives.
    if (error.code !== 6) throw error;
  });
});
