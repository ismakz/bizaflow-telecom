// ============================================
// Bizaflow Telecom — Firebase Configuration
// ============================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { isFirebasePublicConfigComplete } from '@/app/lib/env';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  if (!isFirebasePublicConfigComplete()) {
    console.warn(
      '[Firebase] Variables NEXT_PUBLIC_FIREBASE_* incomplètes. Vérifiez .env.local (voir README).'
    );
  } else {
    console.log('[Firebase] Config OK — projet:', firebaseConfig.projectId);
  }
}

// Initialize Firebase (prevent duplicate initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
