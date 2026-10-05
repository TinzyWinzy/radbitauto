import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
const email = process.argv[2]?.trim().toLowerCase();
const displayName = process.argv[3]?.trim() || 'Platform Administrator';

if (!projectId || projectId.startsWith('demo-')) {
  throw new Error('Set GCLOUD_PROJECT to the production Firebase project');
}
if (!email) {
  throw new Error('Usage: node scripts/provision-platform-admin.mjs admin@example.com "Display Name"');
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, displayName });
  }

  const now = FieldValue.serverTimestamp();
  await db.collection('users').doc(user.uid).set(
    {
      email,
      fullName: user.displayName || displayName,
      phoneNumber: user.phoneNumber ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  await db.collection('platform_admins').doc(user.uid).set(
    {
      email,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  await auth.setCustomUserClaims(user.uid, {
    app_role: 'platform_admin',
    platform_admin: true,
  });
  await db.collection('audit_log').add({
    actorId: 'provisioning-script',
    entityType: 'platform_admins',
    entityId: user.uid,
    action: 'provision',
    detail: { email },
    createdAt: now,
  });

  console.log(JSON.stringify({ uid: user.uid, email, provisioned: true }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Platform administrator provisioning failed');
  process.exit(1);
});
