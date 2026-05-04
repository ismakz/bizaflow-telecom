import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminProjectId() {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
}

function resolveCredential() {
  const projectId = getAdminProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }
  return applicationDefault();
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        projectId: getAdminProjectId(),
        credential: resolveCredential(),
      });

export const adminDb = getFirestore(adminApp);
