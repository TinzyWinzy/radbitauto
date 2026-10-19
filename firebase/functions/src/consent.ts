import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './db.ts';
import { contextFrom } from './claims.ts';
import { ts } from './audits.ts';
import type { CompanyId, ConsentDoc, ConsentPurpose } from './types.ts';

export const CONSENT_COLLECTION = 'consents';

/** Notice version the consent text represents. Bump when the notice materially changes. */
export const NOTICE_VERSION = '2026-10-01';

const ACCOUNT_PURPOSES: ConsentPurpose[] = ['terms', 'privacy'];

export interface ConsentRecordInput {
  purpose: ConsentPurpose;
  version: string;
  granted: boolean;
  method: ConsentDoc['method'];
  source?: string;
  subjectUserId?: string;
  customerId?: string;
  companyId?: CompanyId;
}

/** Builds an immutable consent record for writing inside a batch or transaction. */
export function consentRecord(input: ConsentRecordInput): ConsentDoc {
  return {
    purpose: input.purpose,
    version: input.version,
    granted: input.granted,
    method: input.method,
    ...(input.source ? { source: input.source } : {}),
    ...(input.subjectUserId ? { subjectUserId: input.subjectUserId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.companyId ? { companyId: input.companyId } : {}),
    createdAt: ts(),
  };
}

export function consentCollection(): FirebaseFirestore.CollectionReference {
  return db.collection(CONSENT_COLLECTION);
}

export const recordConsent = onCall<{ purposes?: ConsentPurpose[]; version?: string; source?: string }>(async (request) => {
  const ctx = contextFrom(request);
  const version =
    typeof request.data.version === 'string' && request.data.version.length > 0 && request.data.version.length <= 40
      ? request.data.version
      : NOTICE_VERSION;
  const purposes = request.data.purposes ?? ACCOUNT_PURPOSES;
  if (!Array.isArray(purposes) || purposes.length === 0 || purposes.some((purpose) => !ACCOUNT_PURPOSES.includes(purpose))) {
    throw new HttpsError('invalid-argument', 'Unknown consent purpose');
  }
  const source =
    typeof request.data.source === 'string' && request.data.source.length > 0 && request.data.source.length <= 40
      ? request.data.source
      : 'web';

  const userRef = db.collection('users').doc(ctx.uid);
  const profile = await userRef.get();
  const batch = db.batch();
  for (const purpose of purposes) {
    batch.set(consentCollection().doc(), consentRecord({ purpose, version, granted: true, method: 'signup_checkbox', source, subjectUserId: ctx.uid }));
  }
  // Cache the accepted version on the profile only when it already exists, so this
  // callable never races the account-creation trigger into a partial profile.
  if (profile.exists) {
    batch.set(userRef, { consent: { termsVersion: version, privacyVersion: version, consentedAt: ts() } }, { merge: true });
  }
  await batch.commit();
  return { recorded: purposes.length, version };
});
