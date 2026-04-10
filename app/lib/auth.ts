// ============================================
// Bizaflow Telecom — Auth Service
// ============================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './firebase';
import { createTelecomUser, getTelecomUser } from './firestore';

/**
 * Register a new user and create their Firestore telecom profile
 */
export async function signUp(email: string, password: string, name: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Update display name
  await updateProfile(user, { displayName: name });

  // Create telecom profile in Firestore
  await createTelecomUser(user.uid, name, email);

  return user;
}

/**
 * Sign in an existing user
 */
export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign out
 */
export async function signOut() {
  await firebaseSignOut(auth);
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user telecom profile
 */
export async function getCurrentUserProfile(uid: string) {
  return getTelecomUser(uid);
}
