// ============================================
// Bizaflow Telecom — Firestore Service
// ============================================

import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserRole, UserStatus, SystemStats } from './types';
import { CALL_RATES, detectOperator, isBZTNumber, normalizeExternalPhoneNumber } from './utils';
import { telecomPacks as fallbackPacks } from './data';

// ── Types matching Firestore documents ─────
export interface TelecomUserDoc {
  uid: string;
  name: string;
  email: string;
  telecomNumber: string;
  role: UserRole;
  status: UserStatus;
  balance: number;
  mustChangePassword: boolean;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
  approvedAt?: Timestamp | null;
  approvedBy?: string | null;
}

export interface TelecomContactDoc {
  id?: string;
  contactUid?: string;
  name: string;
  phone: string;
  isInternal: boolean;
  isFavorite: boolean;
  avatarColor: string;
  addedAt: Timestamp | ReturnType<typeof serverTimestamp>;
}

export interface TelecomCallDoc {
  id?: string;
  callerUserId?: string;
  callerTelecomNumber: string;
  targetUserId?: string;
  targetTelecomNumber: string;
  targetExternalNumber?: string;
  callType: 'internal_call' | 'external_call';
  direction: 'outgoing' | 'incoming';
  billingSource: 'pack' | 'bonus' | 'balance' | 'free';
  providerMode?: 'mock' | 'sip' | 'api' | 'real';
  providerName?: string;
  providerCallId?: string;
  externalRouteStatus?: string;
  externalResponse?: unknown;
  isRealTelephony?: boolean;
  startedAt: Timestamp | ReturnType<typeof serverTimestamp>;
  answeredAt?: Timestamp | ReturnType<typeof serverTimestamp> | null;
  endedAt: Timestamp | ReturnType<typeof serverTimestamp>;
  durationSeconds: number;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  duration: number;
  type: 'internal' | 'external';
  status: 'initiated' | 'ringing' | 'answered' | 'missed' | 'rejected' | 'cancelled' | 'completed' | 'failed';
  cost: number;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
}

interface TelecomCallRateConfigDoc {
  airtel?: number;
  mtn?: number;
  vodacom?: number;
  orange?: number;
  other?: number;
}

export interface TelecomPackDoc {
  packId: string;
  name: string;
  category: 'starter' | 'standard' | 'premium' | 'agent';
  price: number;
  durationDays: number;
  internalMinutes: number;
  externalMinutes: number;
  smsCount?: number;
  dataAmount?: number;
  description: string;
  isActive: boolean;
  color: string;
  popular?: boolean;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
}

export interface TelecomUserPackDoc {
  id?: string;
  userId: string;
  telecomNumber: string;
  packId: string;
  packName: string;
  category: 'starter' | 'standard' | 'premium' | 'agent';
  status: 'active' | 'expired' | 'cancelled' | 'exhausted';
  price: number;
  startAt: Timestamp | ReturnType<typeof serverTimestamp>;
  endAt: Timestamp;
  remainingInternalMinutes: number;
  remainingExternalMinutes: number;
  remainingSmsCount?: number;
  remainingDataAmount?: number;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
}

export interface PackAnalytics {
  topPacks: Array<{ packName: string; count: number }>;
  topSubscribers: Array<{ userId: string; telecomNumber: string; count: number }>;
}

export interface InternalCallPair {
  outgoingCallId: string;
  incomingCallId: string;
  callSessionId: string;
}

export interface TelecomDirectoryDoc {
  uid: string;
  name: string;
  telecomNumber: string;
  status: UserStatus;
  isCallable: boolean;
  updatedAt: Timestamp | ReturnType<typeof serverTimestamp>;
}

async function syncDirectoryEntry(uid: string): Promise<void> {
  const userSnap = await getDoc(doc(db, 'telecom_users', uid));
  const dirRef = doc(db, 'telecom_directory', uid);
  if (!userSnap.exists()) return;
  const userData = userSnap.data() as TelecomUserDoc;
  await setDoc(dirRef, {
    uid,
    name: userData.name,
    telecomNumber: userData.telecomNumber,
    status: userData.status,
    isCallable: userData.status === 'approved',
    updatedAt: serverTimestamp(),
  } satisfies TelecomDirectoryDoc, { merge: true });
}

export async function seedTelecomPacks(): Promise<number> {
  let upserted = 0;
  for (const pack of fallbackPacks) {
    const ref = doc(db, 'telecom_packs', pack.packId);
    await setDoc(ref, {
      packId: pack.packId,
      name: pack.name,
      category: pack.category,
      price: pack.price,
      durationDays: pack.durationDays,
      internalMinutes: pack.internalMinutes,
      externalMinutes: pack.externalMinutes,
      smsCount: pack.smsCount || 0,
      dataAmount: pack.dataAmount || 0,
      description: pack.description,
      isActive: true,
      color: pack.color,
      createdAt: serverTimestamp(),
    }, { merge: true });
    upserted++;
  }
  return upserted;
}

export async function seedTelecomDirectory(): Promise<number> {
  const usersSnap = await getDocs(collection(db, 'telecom_users'));
  let synced = 0;
  for (const d of usersSnap.docs) {
    const data = d.data() as TelecomUserDoc;
    await setDoc(doc(db, 'telecom_directory', d.id), {
      uid: d.id,
      name: data.name,
      telecomNumber: data.telecomNumber,
      status: data.status,
      isCallable: data.status === 'approved',
      updatedAt: serverTimestamp(),
    } satisfies TelecomDirectoryDoc, { merge: true });
    synced++;
  }
  return synced;
}

// =============================================
// SEQUENTIAL NUMBER GENERATOR
// =============================================

const COUNTER_DOC = doc(db, 'telecom_config', 'counter');

async function getNextTelecomNumber(): Promise<string> {
  const newNumber = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(COUNTER_DOC);
    let nextValue: number;

    if (!counterSnap.exists()) {
      nextValue = 10001;
      transaction.set(COUNTER_DOC, { lastNumber: 10001 });
    } else {
      const lastNumber = counterSnap.data().lastNumber as number;
      nextValue = lastNumber + 1;
      transaction.update(COUNTER_DOC, { lastNumber: nextValue });
    }

    return `BZT-${nextValue}`;
  });

  return newNumber;
}

// =============================================
// TELECOM USERS
// =============================================

/**
 * Create a new telecom user (regular signup — status: pending)
 */
export async function createTelecomUser(uid: string, name: string, email: string): Promise<TelecomUserDoc> {
  const telecomNumber = await getNextTelecomNumber();

  const userData: TelecomUserDoc = {
    uid,
    name,
    email,
    telecomNumber,
    role: 'user',
    status: 'pending',
    balance: 0,
    mustChangePassword: false,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'telecom_users', uid), userData);
  await syncDirectoryEntry(uid);
  return userData;
}

/**
 * Create CEO account (system only — status: approved)
 */
export async function createCEOAccount(uid: string, name: string, email: string): Promise<TelecomUserDoc> {
  const telecomNumber = await getNextTelecomNumber();

  const userData: TelecomUserDoc = {
    uid,
    name,
    email,
    telecomNumber,
    role: 'ceo',
    status: 'approved',
    balance: 1000,
    mustChangePassword: true,
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'telecom_users', uid), userData);
  await syncDirectoryEntry(uid);
  return userData;
}

/**
 * Get user profile by UID
 */
export async function getTelecomUser(uid: string): Promise<TelecomUserDoc | null> {
  const snap = await getDoc(doc(db, 'telecom_users', uid));
  if (!snap.exists()) return null;
  return { ...snap.data(), uid: snap.id } as TelecomUserDoc;
}

/**
 * Search for a user by telecom number
 */
export async function getUserByTelecomNumber(telecomNumber: string): Promise<TelecomUserDoc | null> {
  const normalized = telecomNumber.toUpperCase().trim();
  const fallbackLookup = async (): Promise<TelecomUserDoc | null> => {
    console.log('DIALER FIRESTORE ACTION', {
      operation: 'query/getDocs',
      collection: 'telecom_users',
      path: 'telecom_users (where telecomNumber == normalized, status == approved)',
      payload: { telecomNumber: normalized, status: 'approved' },
    });
    const qFallback = query(
      collection(db, 'telecom_users'),
      where('telecomNumber', '==', normalized),
      where('status', '==', 'approved')
    );
    const snapFallback = await getDocs(qFallback);
    if (snapFallback.empty) return null;
    const d = snapFallback.docs[0];
    // Auto-heal: resync entry in telecom_directory if missing
    await setDoc(doc(db, 'telecom_directory', d.id), {
      uid: d.id,
      name: d.data().name,
      telecomNumber: d.data().telecomNumber,
      status: d.data().status,
      isCallable: d.data().status === 'approved',
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ...d.data(), uid: d.id } as TelecomUserDoc;
  };

  try {
    console.log('DIALER FIRESTORE ACTION', {
      operation: 'query/getDocs',
      collection: 'telecom_directory',
      path: 'telecom_directory (where telecomNumber == normalized, isCallable == true)',
      payload: { telecomNumber: normalized },
    });
    const q = query(
      collection(db, 'telecom_directory'),
      where('telecomNumber', '==', normalized),
      where('isCallable', '==', true)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return fallbackLookup();
    }
    const d = snap.docs[0];
    return { ...d.data(), uid: d.id } as TelecomUserDoc;
  } catch (error) {
    console.warn('DIALER DIRECTORY FALLBACK', error);
    return fallbackLookup();
  }
}

/**
 * Update user balance
 */
export async function updateBalance(uid: string, amount: number): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), {
    balance: increment(amount),
  });
}

/**
 * Update user name
 */
export async function updateUserName(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), { name });
  await syncDirectoryEntry(uid);
}

/**
 * Clear mustChangePassword flag
 */
export async function clearMustChangePassword(uid: string): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), { mustChangePassword: false });
}

// =============================================
// ADMIN / CEO FUNCTIONS
// =============================================

/**
 * Get all telecom users (CEO only)
 */
export async function getAllUsers(): Promise<TelecomUserDoc[]> {
  const q = query(collection(db, 'telecom_users'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id } as TelecomUserDoc));
}

/**
 * Get users by status
 */
export async function getUsersByStatus(status: UserStatus): Promise<TelecomUserDoc[]> {
  const q = query(
    collection(db, 'telecom_users'),
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id } as TelecomUserDoc));
}

/**
 * Approve a user registration
 */
export async function approveUser(uid: string, ceoUid: string): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), {
    status: 'approved',
    balance: 5.00, // Welcome bonus on approval
    approvedAt: serverTimestamp(),
    approvedBy: ceoUid,
  });
  await syncDirectoryEntry(uid);
}

/**
 * Reject a user registration
 */
export async function rejectUser(uid: string, ceoUid: string): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), {
    status: 'rejected',
    approvedAt: serverTimestamp(),
    approvedBy: ceoUid,
  });
  await syncDirectoryEntry(uid);
}

/**
 * Suspend a user
 */
export async function suspendUser(uid: string): Promise<void> {
  await updateDoc(doc(db, 'telecom_users', uid), {
    status: 'suspended',
  });
  await syncDirectoryEntry(uid);
}

/**
 * Change user role (CEO only)
 */
export async function changeUserRole(uid: string, role: UserRole): Promise<void> {
  if (role === 'ceo') return; // Cannot assign CEO role
  await updateDoc(doc(db, 'telecom_users', uid), { role });
}

/**
 * Get system statistics (CEO dashboard)
 */
export async function getSystemStats(): Promise<SystemStats> {
  const usersSnap = await getDocs(collection(db, 'telecom_users'));
  const callsSnap = await getDocs(collection(db, 'telecom_calls'));
  const packsSnap = await getDocs(collection(db, 'telecom_user_packs'));
  const packTxSnap = await getDocs(query(collection(db, 'telecom_transactions'), where('type', '==', 'pack_purchase')));

  let totalUsers = 0;
  let pendingUsers = 0;
  let approvedUsers = 0;
  let rejectedUsers = 0;
  let suspendedUsers = 0;
  let totalBZTNumbers = 0;

  usersSnap.docs.forEach((d) => {
    const data = d.data();
    totalUsers++;
    if (data.telecomNumber) totalBZTNumbers++;
    switch (data.status) {
      case 'pending': pendingUsers++; break;
      case 'approved': approvedUsers++; break;
      case 'rejected': rejectedUsers++; break;
      case 'suspended': suspendedUsers++; break;
    }
  });

  let totalCalls = 0;
  let totalRevenue = 0;
  let totalInternalCalls = 0;
  let totalExternalCalls = 0;
  let missedCalls = 0;
  let failedCalls = 0;
  let activePacks = 0;
  let expiredPacks = 0;
  let packRevenue = 0;

  callsSnap.docs.forEach((d) => {
    const data = d.data();
    totalCalls++;
    totalRevenue += data.cost || 0;
    if (data.callType === 'internal_call' || data.type === 'internal') totalInternalCalls++;
    if (data.callType === 'external_call' || data.type === 'external') totalExternalCalls++;
    if (data.status === 'missed') missedCalls++;
    if (data.status === 'failed') failedCalls++;
  });

  packsSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.status === 'active') activePacks++;
    if (data.status === 'expired') expiredPacks++;
  });

  packTxSnap.docs.forEach((d) => {
    packRevenue += d.data().amount || 0;
  });

  return {
    totalUsers,
    pendingUsers,
    approvedUsers,
    rejectedUsers,
    suspendedUsers,
    totalCalls,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalBZTNumbers,
    totalPacksSold: packTxSnap.size,
    packRevenue: Math.round(packRevenue * 100) / 100,
    activePacks,
    expiredPacks,
    totalInternalCalls,
    totalExternalCalls,
    missedCalls,
    failedCalls,
  };
}

// =============================================
// PACKS
// =============================================

export async function getAvailablePacks(): Promise<TelecomPackDoc[]> {
  const q = query(collection(db, 'telecom_packs'), where('isActive', '==', true), orderBy('price', 'asc'));
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs.map((d) => ({ ...d.data(), packId: d.id } as TelecomPackDoc));
  }
  return fallbackPacks.map((p) => ({
    packId: p.packId,
    name: p.name,
    category: p.category,
    price: p.price,
    durationDays: p.durationDays,
    internalMinutes: p.internalMinutes,
    externalMinutes: p.externalMinutes,
    smsCount: p.smsCount,
    dataAmount: p.dataAmount,
    description: p.description,
    isActive: p.isActive,
    color: p.color,
    createdAt: serverTimestamp(),
  }));
}

export async function getUserPackHistory(uid: string): Promise<TelecomUserPackDoc[]> {
  const q = query(collection(db, 'telecom_user_packs'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TelecomUserPackDoc));
}

export async function getActiveUserPack(uid: string): Promise<TelecomUserPackDoc | null> {
  const q = query(
    collection(db, 'telecom_user_packs'),
    where('userId', '==', uid),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const activePack = { id: snap.docs[0].id, ...snap.docs[0].data() } as TelecomUserPackDoc;
  if (activePack.endAt && 'seconds' in activePack.endAt) {
    const endDate = new Date(activePack.endAt.seconds * 1000);
    if (Date.now() > endDate.getTime()) {
      await updateDoc(doc(db, 'telecom_user_packs', activePack.id as string), { status: 'expired' });
      return null;
    }
  }
  return activePack;
}

export async function purchaseTelecomPack(uid: string, pack: TelecomPackDoc): Promise<void> {
  if (!uid) throw new Error('Utilisateur non connecté');
  if (!pack.isActive) throw new Error('Pack indisponible');
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'telecom_users', uid);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('Utilisateur introuvable');
    const userData = userSnap.data();
    if (userData.status !== 'approved') throw new Error('Compte non approuvé');
    const balanceBefore = userData.balance || 0;
    if (balanceBefore < pack.price) throw new Error('Solde insuffisant');
    const balanceAfter = Math.round((balanceBefore - pack.price) * 100) / 100;

    const activeQ = query(collection(db, 'telecom_user_packs'), where('userId', '==', uid), where('status', '==', 'active'));
    const activeSnap = await getDocs(activeQ);
    activeSnap.docs.forEach((d) => {
      transaction.update(doc(db, 'telecom_user_packs', d.id), { status: 'cancelled' });
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + pack.durationDays);

    const userPackRef = doc(collection(db, 'telecom_user_packs'));
    transaction.set(userPackRef, {
      userId: uid,
      telecomNumber: userData.telecomNumber,
      packId: pack.packId,
      packName: pack.name,
      category: pack.category,
      status: 'active',
      price: pack.price,
      startAt: serverTimestamp(),
      endAt: Timestamp.fromDate(endDate),
      remainingInternalMinutes: pack.internalMinutes,
      remainingExternalMinutes: pack.externalMinutes,
      remainingSmsCount: pack.smsCount || 0,
      remainingDataAmount: pack.dataAmount || 0,
      createdAt: serverTimestamp(),
    });

    transaction.update(userRef, { balance: balanceAfter });

    const txRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(txRef, {
      userId: uid,
      type: 'pack_purchase',
      amount: pack.price,
      currency: 'USD',
      status: 'success',
      description: `Achat pack ${pack.name} (${pack.durationDays} jours)`,
      balanceBefore,
      balanceAfter,
      createdAt: serverTimestamp(),
      createdBy: uid,
      targetTelecomNumber: userData.telecomNumber,
    });
  });
}

export async function getPackAnalytics(): Promise<PackAnalytics> {
  const snap = await getDocs(collection(db, 'telecom_user_packs'));
  const byPack: Record<string, number> = {};
  const byUser: Record<string, { telecomNumber: string; count: number }> = {};

  snap.docs.forEach((d) => {
    const data = d.data();
    const packName = data.packName || 'Unknown';
    byPack[packName] = (byPack[packName] || 0) + 1;

    const uid = data.userId as string;
    if (!uid) return;
    if (!byUser[uid]) byUser[uid] = { telecomNumber: data.telecomNumber || '-', count: 0 };
    byUser[uid].count += 1;
  });

  const topPacks = Object.entries(byPack)
    .map(([packName, count]) => ({ packName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topSubscribers = Object.entries(byUser)
    .map(([userId, value]) => ({ userId, telecomNumber: value.telecomNumber, count: value.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { topPacks, topSubscribers };
}

// =============================================
// CONTACTS
// =============================================

export async function getContacts(uid: string): Promise<TelecomContactDoc[]> {
  const q = query(
    collection(db, 'telecom_contacts', uid, 'contacts'),
    orderBy('addedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TelecomContactDoc));
}

export async function addContactToFirestore(uid: string, contact: Omit<TelecomContactDoc, 'id' | 'addedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'telecom_contacts', uid, 'contacts'), {
    ...contact,
    addedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteContactFromFirestore(uid: string, contactId: string): Promise<void> {
  await deleteDoc(doc(db, 'telecom_contacts', uid, 'contacts', contactId));
}

export async function toggleFavoriteInFirestore(uid: string, contactId: string, isFavorite: boolean): Promise<void> {
  await updateDoc(doc(db, 'telecom_contacts', uid, 'contacts', contactId), { isFavorite });
}

// =============================================
// CALLS
// =============================================

export async function logCall(callData: Omit<TelecomCallDoc, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'telecom_calls'), {
    ...callData,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getCallHistory(telecomNumber: string): Promise<TelecomCallDoc[]> {
  const qFrom = query(
    collection(db, 'telecom_calls'),
    where('from', '==', telecomNumber),
    orderBy('createdAt', 'desc')
  );
  const snapFrom = await getDocs(qFrom);

  const qTo = query(
    collection(db, 'telecom_calls'),
    where('to', '==', telecomNumber),
    orderBy('createdAt', 'desc')
  );
  const snapTo = await getDocs(qTo);

  const calls: TelecomCallDoc[] = [];

  snapFrom.docs.forEach((d) => {
    calls.push({ id: d.id, ...d.data() } as TelecomCallDoc);
  });

  snapTo.docs.forEach((d) => {
    const data = d.data() as TelecomCallDoc;
    calls.push({ id: d.id, ...data, direction: 'incoming' } as TelecomCallDoc);
  });

  calls.sort((a, b) => {
    const aTime = a.createdAt && typeof a.createdAt === 'object' && 'seconds' in a.createdAt
      ? (a.createdAt as Timestamp).seconds : 0;
    const bTime = b.createdAt && typeof b.createdAt === 'object' && 'seconds' in b.createdAt
      ? (b.createdAt as Timestamp).seconds : 0;
    return bTime - aTime;
  });

  return calls;
}

// =============================================
// TRANSACTIONS
// =============================================

export interface TelecomTransactionDoc {
  id?: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>;
  createdBy?: string;
  sourceUserId?: string;
  targetUserId?: string;
  sourceTelecomNumber?: string;
  targetTelecomNumber?: string;
  linkedTransactionId?: string;
}

/**
 * Get user transactions
 */
export async function getUserTransactions(uid: string): Promise<TelecomTransactionDoc[]> {
  const q = query(
    collection(db, 'telecom_transactions'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TelecomTransactionDoc));
}

/**
 * Perform a recharge (atomic: update balance + create transaction)
 */
export async function performRecharge(uid: string, amount: number, description: string): Promise<void> {
  if (amount <= 0) throw new Error('Montant invalide');

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'telecom_users', uid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) throw new Error('Utilisateur introuvable');
    const userData = userSnap.data();
    const balanceBefore = userData.balance || 0;
    const balanceAfter = balanceBefore + amount;

    // Update balance
    transaction.update(userRef, { balance: balanceAfter });

    // Create transaction record
    const txRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(txRef, {
      userId: uid,
      type: 'recharge',
      amount,
      currency: 'USD',
      status: 'success',
      description,
      balanceBefore,
      balanceAfter,
      createdAt: serverTimestamp(),
      createdBy: uid,
    });
  });
}

/**
 * Perform a CEO recharge for another user (atomic: update balance + audit transaction)
 */
export async function performAdminRecharge(
  targetUid: string,
  amount: number,
  ceoUid: string,
  description: string,
): Promise<void> {
  if (!targetUid) throw new Error('Utilisateur invalide');
  if (!ceoUid) throw new Error('CEO invalide');
  if (amount <= 0 || Number.isNaN(amount)) throw new Error('Montant invalide');

  const roundedAmount = Math.round(amount * 100) / 100;

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'telecom_users', targetUid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) throw new Error('Utilisateur introuvable');
    const userData = userSnap.data();
    const balanceBefore = userData.balance || 0;
    const balanceAfter = Math.round((balanceBefore + roundedAmount) * 100) / 100;

    transaction.update(userRef, { balance: balanceAfter });

    const txRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(txRef, {
      userId: targetUid,
      type: 'admin_recharge',
      amount: roundedAmount,
      currency: 'USD',
      status: 'success',
      description,
      balanceBefore,
      balanceAfter,
      createdAt: serverTimestamp(),
      createdBy: ceoUid,
      targetUserId: targetUid,
      targetTelecomNumber: userData.telecomNumber || null,
    });
  });
}

/**
 * Perform a transfer (atomic: debit source + credit target + 2 transactions)
 */
export async function performTransfer(
  sourceUid: string,
  targetUid: string,
  amount: number,
  sourceTelecomNumber: string,
  targetTelecomNumber: string,
  sourceName: string,
  targetName: string,
): Promise<void> {
  if (!sourceUid) throw new Error('Utilisateur non connecté');
  if (amount <= 0 || Number.isNaN(amount)) throw new Error('Montant invalide');
  if (sourceUid === targetUid) throw new Error('Transfert vers soi-même interdit');
  const normalizedTargetNumber = targetTelecomNumber.toUpperCase().trim();
  const roundedAmount = Math.round(amount * 100) / 100;

  await runTransaction(db, async (transaction) => {
    const sourceRef = doc(db, 'telecom_users', sourceUid);
    const targetRef = doc(db, 'telecom_users', targetUid);

    const sourceSnap = await transaction.get(sourceRef);
    const targetSnap = await transaction.get(targetRef);

    if (!sourceSnap.exists()) throw new Error('Émetteur introuvable');
    if (!targetSnap.exists()) throw new Error('Destinataire introuvable');

    const sourceData = sourceSnap.data();
    const targetData = targetSnap.data();
    if (sourceData.status !== 'approved') throw new Error('Votre compte doit être approuvé');
    if (targetData.status !== 'approved') throw new Error('Le destinataire n’est pas actif');
    if ((targetData.telecomNumber || '').toUpperCase().trim() !== normalizedTargetNumber) {
      throw new Error('Destinataire invalide');
    }

    const sourceBalanceBefore = sourceData.balance || 0;
    const targetBalanceBefore = targetData.balance || 0;

    if (sourceBalanceBefore < roundedAmount) throw new Error('Solde insuffisant');

    const sourceBalanceAfter = Math.round((sourceBalanceBefore - roundedAmount) * 100) / 100;
    const targetBalanceAfter = Math.round((targetBalanceBefore + roundedAmount) * 100) / 100;

    // Update balances
    transaction.update(sourceRef, { balance: sourceBalanceAfter });
    transaction.update(targetRef, { balance: targetBalanceAfter });

    // Create outgoing transaction
    const outRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(outRef, {
      userId: sourceUid,
      type: 'transfer_out',
      amount: roundedAmount,
      currency: 'USD',
      status: 'success',
      description: `Transfert vers ${targetName} (${targetTelecomNumber})`,
      balanceBefore: sourceBalanceBefore,
      balanceAfter: sourceBalanceAfter,
      createdAt: serverTimestamp(),
      createdBy: sourceUid,
      sourceUserId: sourceUid,
      targetUserId: targetUid,
      sourceTelecomNumber,
      targetTelecomNumber,
    });

    // Create incoming transaction
    const inRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(inRef, {
      userId: targetUid,
      type: 'transfer_in',
      amount: roundedAmount,
      currency: 'USD',
      status: 'success',
      description: `Transfert reçu de ${sourceName} (${sourceTelecomNumber})`,
      balanceBefore: targetBalanceBefore,
      balanceAfter: targetBalanceAfter,
      createdAt: serverTimestamp(),
      createdBy: sourceUid,
      sourceUserId: sourceUid,
      targetUserId: targetUid,
      sourceTelecomNumber,
      targetTelecomNumber,
    });
  });
}

/**
 * Create a call charge transaction (atomic: debit + log transaction)
 */
export async function createCallChargeTransaction(
  uid: string,
  cost: number,
  targetNumber: string,
  targetName: string,
  duration: number,
  operatorName: string,
): Promise<void> {
  if (cost <= 0) return; // Internal calls are free

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'telecom_users', uid);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) throw new Error('Utilisateur introuvable');
    const userData = userSnap.data();
    const balanceBefore = userData.balance || 0;
    const balanceAfter = Math.max(0, balanceBefore - cost);

    transaction.update(userRef, { balance: balanceAfter });

    const txRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(txRef, {
      userId: uid,
      type: 'call_charge',
      amount: cost,
      currency: 'USD',
      status: 'success',
      description: `Appel ${operatorName} vers ${targetName} (${targetNumber}) — ${Math.floor(duration / 60)}m ${duration % 60}s`,
      balanceBefore,
      balanceAfter,
      createdAt: serverTimestamp(),
      createdBy: uid,
      targetTelecomNumber: targetNumber,
    });
  });
}

function isValidExternalPhoneNumber(targetNumber: string): boolean {
  const normalized = targetNumber.trim();
  if (isBZTNumber(normalized)) return false;
  return normalizeExternalPhoneNumber(normalized) !== null;
}

function resolveExternalRate(config: TelecomCallRateConfigDoc | undefined, operatorId: keyof typeof CALL_RATES): number {
  if (operatorId === 'internal') {
    return CALL_RATES.internal;
  }
  if (!config) return CALL_RATES[operatorId];
  const configuredRate = config[operatorId];
  if (typeof configuredRate === 'number' && configuredRate >= 0) return configuredRate;
  return CALL_RATES[operatorId];
}

export async function completeExternalCall(
  callerUid: string,
  targetNumber: string,
  durationSeconds: number,
  callStatus: 'completed' | 'missed' | 'failed' = 'completed',
  providerContext?: {
    providerMode?: 'mock' | 'sip' | 'api' | 'real';
    providerName?: string;
    providerCallId?: string;
    externalRouteStatus?: string;
    externalResponse?: unknown;
    isRealTelephony?: boolean;
  },
): Promise<{ cost: number; balanceAfter: number }> {
  if (!callerUid) throw new Error('Utilisateur non connecté');
  if (!isValidExternalPhoneNumber(targetNumber)) throw new Error('Numéro externe invalide');
  if (durationSeconds < 0) throw new Error('Durée invalide');
  const normalizedTargetNumber = normalizeExternalPhoneNumber(targetNumber);
  if (!normalizedTargetNumber) throw new Error('Numéro invalide');

  return runTransaction(db, async (transaction) => {
    const callerRef = doc(db, 'telecom_users', callerUid);
    const callerSnap = await transaction.get(callerRef);
    if (!callerSnap.exists()) throw new Error('Utilisateur introuvable');

    const callerData = callerSnap.data();
    if (callerData.status !== 'approved') throw new Error('Compte non approuvé');

    const operator = detectOperator(normalizedTargetNumber);
    const configRef = doc(db, 'telecom_config', 'call_rates');
    const configSnap = await transaction.get(configRef);
    const config = (configSnap.exists() ? configSnap.data() : undefined) as TelecomCallRateConfigDoc | undefined;
    const ratePerMinute = resolveExternalRate(config, operator.id);
    const billedMinutes = Math.ceil(durationSeconds / 60);
    const cost = Math.round(billedMinutes * ratePerMinute * 100) / 100;

    const balanceBefore = callerData.balance || 0;
    const bonusBefore = callerData.bonusBalance || 0;
    let remainingCost = callStatus === 'completed' ? cost : 0;
    let balanceAfter = balanceBefore;
    let bonusAfter = bonusBefore;
    let billingSource: 'pack' | 'bonus' | 'balance' | 'free' = 'balance';

    const activePackQuery = query(
      collection(db, 'telecom_user_packs'),
      where('userId', '==', callerUid),
      where('status', '==', 'active')
    );
    const activePackSnap = await getDocs(activePackQuery);

    if (!activePackSnap.empty) {
      const packDoc = activePackSnap.docs[0];
      const packData = packDoc.data();
      const packEndAt = packData.endAt as Timestamp | undefined;
      const isExpired = !!packEndAt && Date.now() > packEndAt.toDate().getTime();
      if (isExpired) {
        transaction.update(doc(db, 'telecom_user_packs', packDoc.id), { status: 'expired' });
      } else {
        const consumedMinutes = Math.ceil(durationSeconds / 60);
        const remainingExternal = packData.remainingExternalMinutes || 0;
        if (remainingExternal >= consumedMinutes) {
          remainingCost = 0;
          billingSource = 'pack';
          const after = remainingExternal - consumedMinutes;
          transaction.update(doc(db, 'telecom_user_packs', packDoc.id), {
            remainingExternalMinutes: after,
            status: after <= 0 ? 'exhausted' : 'active',
          });
        }
      }
    }

    if (remainingCost > 0 && bonusBefore > 0) {
      const usedBonus = Math.min(remainingCost, bonusBefore);
      bonusAfter = Math.round((bonusBefore - usedBonus) * 100) / 100;
      remainingCost = Math.round((remainingCost - usedBonus) * 100) / 100;
      if (usedBonus > 0) billingSource = remainingCost === 0 ? 'bonus' : 'balance';
    }
    if (remainingCost > 0) {
      if (remainingCost > balanceBefore) throw new Error('Solde insuffisant pour cet appel');
      balanceAfter = Math.round((balanceBefore - remainingCost) * 100) / 100;
    }

    transaction.update(callerRef, { balance: balanceAfter, bonusBalance: bonusAfter });

    const callRef = doc(collection(db, 'telecom_calls'));
    transaction.set(callRef, {
      callerUserId: callerUid,
      callerTelecomNumber: callerData.telecomNumber,
      targetTelecomNumber: normalizedTargetNumber,
      targetExternalNumber: normalizedTargetNumber,
      from: callerData.telecomNumber,
      to: normalizedTargetNumber,
      fromName: callerData.name,
      toName: operator.name,
      type: 'external',
      callType: 'external_call',
      direction: 'outgoing',
      duration: durationSeconds,
      durationSeconds,
      cost: remainingCost,
      billingSource,
      providerMode: providerContext?.providerMode || 'mock',
      providerName: providerContext?.providerName || 'MockVoiceProvider',
      providerCallId: providerContext?.providerCallId || null,
      externalRouteStatus: providerContext?.externalRouteStatus || 'simulated',
      externalResponse: providerContext?.externalResponse || null,
      isRealTelephony: providerContext?.isRealTelephony || false,
      status: callStatus,
      startedAt: serverTimestamp(),
      answeredAt: serverTimestamp(),
      endedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    const txRef = doc(collection(db, 'telecom_transactions'));
    transaction.set(txRef, {
      userId: callerUid,
      type: 'call_charge',
      amount: remainingCost,
      currency: 'USD',
      status: 'success',
      description: remainingCost > 0
        ? `Appel externe ${operator.name} vers ${normalizedTargetNumber} — ${billedMinutes} min`
        : `Appel externe ${operator.name} couvert par pack — ${billedMinutes} min`,
      balanceBefore,
      balanceAfter,
      createdAt: serverTimestamp(),
      createdBy: callerUid,
      targetTelecomNumber: normalizedTargetNumber,
      relatedCallId: callRef.id,
    });

    return { cost: remainingCost, balanceAfter };
  });
}

export async function consumeInternalPackMinutes(
  callerUid: string,
  callerNumber: string,
  callerName: string,
  targetNumber: string,
  targetName: string,
  durationSeconds: number,
  callStatus: 'completed' | 'missed' | 'failed' = 'completed',
  skipCallLog: boolean = false,
): Promise<void> {
  if (!callerUid) throw new Error('Utilisateur non connecté');
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'telecom_users', callerUid);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('Utilisateur introuvable');
    const userData = userSnap.data();
    if (userData.status !== 'approved') throw new Error('Compte non approuvé');

    let billingSource: 'pack' | 'free' = 'free';
    const activePackQuery = query(
      collection(db, 'telecom_user_packs'),
      where('userId', '==', callerUid),
      where('status', '==', 'active')
    );
    const activePackSnap = await getDocs(activePackQuery);
    if (!activePackSnap.empty) {
      const packDoc = activePackSnap.docs[0];
      const packData = packDoc.data();
      const packEndAt = packData.endAt as Timestamp | undefined;
      const isExpired = !!packEndAt && Date.now() > packEndAt.toDate().getTime();
      if (isExpired) {
        transaction.update(doc(db, 'telecom_user_packs', packDoc.id), { status: 'expired' });
      } else {
        const consumedMinutes = callStatus === 'completed' ? Math.ceil(durationSeconds / 60) : 0;
        const remaining = packData.remainingInternalMinutes || 0;
        if (remaining > 0) {
          const after = Math.max(0, remaining - consumedMinutes);
          billingSource = 'pack';
          transaction.update(doc(db, 'telecom_user_packs', packDoc.id), {
            remainingInternalMinutes: after,
            status: after <= 0 ? 'exhausted' : 'active',
          });
        }
      }
    }

    if (!skipCallLog) {
      const callRef = doc(collection(db, 'telecom_calls'));
      transaction.set(callRef, {
        callerUserId: callerUid,
        callerTelecomNumber: callerNumber,
        targetTelecomNumber: targetNumber,
        from: callerNumber,
        to: targetNumber,
        fromName: callerName,
        toName: targetName,
        type: 'internal',
        callType: 'internal_call',
        direction: 'outgoing',
        duration: durationSeconds,
        durationSeconds,
        cost: 0,
        billingSource,
        status: callStatus,
        startedAt: serverTimestamp(),
        answeredAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }
  });
}

export async function initiateInternalCall(
  callerUid: string,
  callerNumber: string,
  callerName: string,
  targetUid: string,
  targetNumber: string,
  targetName: string,
): Promise<InternalCallPair> {
  const callSessionId = `ics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outgoingRef = await addDoc(collection(db, 'telecom_calls'), {
    callerUserId: callerUid,
    callerTelecomNumber: callerNumber,
    targetUserId: targetUid,
    targetTelecomNumber: targetNumber,
    from: callerNumber,
    to: targetNumber,
    fromName: callerName,
    toName: targetName,
    type: 'internal',
    callType: 'internal_call',
    direction: 'outgoing',
    duration: 0,
    durationSeconds: 0,
    cost: 0,
    billingSource: 'free',
    status: 'ringing',
    linkedCallId: null,
    callSessionId,
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  const incomingRef = await addDoc(collection(db, 'telecom_calls'), {
    callerUserId: callerUid,
    callerTelecomNumber: callerNumber,
    targetUserId: targetUid,
    targetTelecomNumber: targetNumber,
    from: callerNumber,
    to: targetNumber,
    fromName: callerName,
    toName: targetName,
    type: 'internal',
    callType: 'internal_call',
    direction: 'incoming',
    duration: 0,
    durationSeconds: 0,
    cost: 0,
    billingSource: 'free',
    status: 'ringing',
    linkedCallId: outgoingRef.id,
    callSessionId,
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'telecom_calls', outgoingRef.id), {
    linkedCallId: incomingRef.id,
  });

  return {
    outgoingCallId: outgoingRef.id,
    incomingCallId: incomingRef.id,
    callSessionId,
  };
}

export async function answerInternalCallPair(callPair: InternalCallPair): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const outgoingRef = doc(db, 'telecom_calls', callPair.outgoingCallId);
    const incomingRef = doc(db, 'telecom_calls', callPair.incomingCallId);
    const payload = {
      status: 'answered',
      answeredAt: serverTimestamp(),
    };
    transaction.update(outgoingRef, payload);
    transaction.update(incomingRef, payload);
  });
}

export async function rejectInternalCallPair(callPair: InternalCallPair): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const outgoingRef = doc(db, 'telecom_calls', callPair.outgoingCallId);
    const incomingRef = doc(db, 'telecom_calls', callPair.incomingCallId);
    const payload = {
      status: 'rejected',
      endedAt: serverTimestamp(),
      duration: 0,
      durationSeconds: 0,
    };
    transaction.update(outgoingRef, payload);
    transaction.update(incomingRef, payload);
  });
}

export async function cancelInternalCallPair(callPair: InternalCallPair): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const outgoingRef = doc(db, 'telecom_calls', callPair.outgoingCallId);
    const incomingRef = doc(db, 'telecom_calls', callPair.incomingCallId);
    const payload = {
      status: 'cancelled',
      endedAt: serverTimestamp(),
      duration: 0,
      durationSeconds: 0,
    };
    transaction.update(outgoingRef, payload);
    transaction.update(incomingRef, payload);
  });
}

export async function completeInternalCallPair(
  callPair: InternalCallPair,
  durationSeconds: number,
  status: 'completed' | 'missed',
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const outgoingRef = doc(db, 'telecom_calls', callPair.outgoingCallId);
    const incomingRef = doc(db, 'telecom_calls', callPair.incomingCallId);
    const commonPayload = {
      status,
      duration: durationSeconds,
      durationSeconds,
      endedAt: serverTimestamp(),
      answeredAt: status === 'completed' ? serverTimestamp() : null,
    };
    transaction.update(outgoingRef, commonPayload);
    transaction.update(incomingRef, commonPayload);
  });
}
