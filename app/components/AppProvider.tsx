'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { User, Contact, CallRecord, CallSimulationState } from '@/app/lib/types';
import LoadingShell from '@/app/components/LoadingShell';
import ToastStack, { type ToastItem } from '@/app/components/ToastStack';
import { onAuthChange, signOut as authSignOut } from '@/app/lib/auth';
import {
  getTelecomUser,
  getContacts as firestoreGetContacts,
  addContactToFirestore,
  deleteContactFromFirestore,
  toggleFavoriteInFirestore,
  getCallHistory,
  getUserByTelecomNumber,
  completeExternalCall,
  consumeInternalPackMinutes,
  initiateInternalCall,
  completeInternalCallPair,
  answerInternalCallPair,
  rejectInternalCallPair,
  cancelInternalCallPair,
  performRecharge,
} from '@/app/lib/firestore';
import {
  calculateCallCost,
  detectOperator,
  formatDuration,
  generateAvatarColor,
  timestampToISO,
  promiseWithTimeout,
} from '@/app/lib/utils';
import { db } from '@/app/lib/firebase';
import { getProviderRuntimeInfo, voiceProvider, type ProviderMode } from '@/app/lib/voiceProvider';

interface AppContextType {
  user: User | null;
  contacts: Contact[];
  calls: CallRecord[];
  callState: CallSimulationState;
  loading: boolean;
  authError: string | null;
  addContact: (contact: { name: string; phone: string; isInternal: boolean }) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  toggleFavorite: (id: string, currentValue: boolean) => Promise<void>;
  startCall: (contact: Contact) => void;
  endCall: () => void;
  answerIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => Promise<void>;
  estimateExternalCallCost: (targetNumber: string, minutes: number) => Promise<number>;
  rechargeCredit: (amount: number) => Promise<void>;
  refreshData: () => Promise<void>;
  logout: () => Promise<void>;
  showToast: (opts: { message: string; variant?: 'success' | 'error' | 'info' }) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// Route categories
const PUBLIC_PAGES = ['/login', '/seed'];
const STATUS_PAGES = ['/pending', '/rejected', '/suspended', '/change-password'];

function isPublicPage(path: string) { return PUBLIC_PAGES.includes(path); }
function isStatusPage(path: string) { return STATUS_PAGES.includes(path); }
function isCEOPage(path: string) { return path === '/ceo' || path.startsWith('/ceo/'); }

function getTargetRoute(userData: User, currentPath: string): string | null {
  if (userData.mustChangePassword) {
    return currentPath === '/change-password' ? null : '/change-password';
  }

  if (userData.status === 'pending' && currentPath !== '/pending') return '/pending';
  if (userData.status === 'rejected' && currentPath !== '/rejected') return '/rejected';
  if (userData.status === 'suspended' && currentPath !== '/suspended') return '/suspended';

  if (userData.status === 'approved') {
    if (userData.role === 'ceo' && isPublicPage(currentPath)) return '/ceo';
    if (userData.role !== 'ceo' && isPublicPage(currentPath)) return '/';
    if (userData.role !== 'ceo' && isCEOPage(currentPath)) return '/';
    if (isStatusPage(currentPath)) return userData.role === 'ceo' ? '/ceo' : '/';
    return null;
  }
  return null;
}

const PROFILE_FETCH_MS = 45_000;

export default function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const authListenerReadyRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallSimulationState>({
    active: false, phase: 'ringing', contact: null, startTime: 0, duration: 0, isInternal: false, direction: 'outgoing',
  });
  const [currentInternalCallIds, setCurrentInternalCallIds] = useState<{ outgoingCallId: string; incomingCallId: string; callSessionId: string } | null>(null);
  const [currentInternalCallRole, setCurrentInternalCallRole] = useState<'caller' | 'callee' | null>(null);
  /** Toujours à jour pour les handlers async (répondre / refuser) */
  const internalCallPairRef = useRef(currentInternalCallIds);
  const callActiveRef = useRef(false);
  useEffect(() => {
    internalCallPairRef.current = currentInternalCallIds;
  }, [currentInternalCallIds]);
  useEffect(() => {
    callActiveRef.current = callState.active;
  }, [callState.active]);
  const [externalProviderSession, setExternalProviderSession] = useState<{
    providerMode: ProviderMode;
    providerName: string;
    providerCallId?: string;
    externalRouteStatus?: string;
    externalResponse?: unknown;
    isRealTelephony: boolean;
  } | null>(null);

  const buildUserObject = useCallback((profile: Awaited<ReturnType<typeof getTelecomUser>>): User | null => {
    if (!profile) return null;
    return {
      uid: profile.uid, name: profile.name, email: profile.email,
      telecomNumber: profile.telecomNumber, role: profile.role, status: profile.status,
      balance: profile.balance, mustChangePassword: profile.mustChangePassword || false,
      createdAt: timestampToISO(profile.createdAt as { seconds: number; nanoseconds: number } | null),
      approvedAt: profile.approvedAt ? timestampToISO(profile.approvedAt as { seconds: number; nanoseconds: number }) : null,
      approvedBy: profile.approvedBy || null,
    };
  }, []);

  const toastIdRef = useRef(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const showToast = useCallback(
    (opts: { message: string; variant?: 'success' | 'error' | 'info' }) => {
      const id = ++toastIdRef.current;
      const variant = opts.variant ?? 'info';
      setToasts((prev) => [...prev, { id, message: opts.message, variant }]);
      window.setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast]
  );

  // Si Firebase Auth ne répond pas (config .env manquante, etc.), ne pas rester bloqué sur « Chargement… »
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!authListenerReadyRef.current) {
        setAuthError(
          'Initialisation trop lente ou impossible. Vérifiez NEXT_PUBLIC_FIREBASE_* dans .env.local et votre connexion.'
        );
        setLoading(false);
      }
    }, 18_000);
    return () => window.clearTimeout(t);
  }, []);

  // ── Auth listener (stable : pas de pathname dans les deps → évite de se désabonner à chaque navigation) ──
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      authListenerReadyRef.current = true;
      const path = pathnameRef.current;

      if (firebaseUser) {
        console.log('[Auth] ✅ Utilisateur connecté:', firebaseUser.uid, firebaseUser.email);
        setAuthUid(firebaseUser.uid);
        setAuthError(null);

        try {
          const profile = await promiseWithTimeout(
            getTelecomUser(firebaseUser.uid),
            PROFILE_FETCH_MS,
            'Chargement du profil Firestore'
          );
          console.log('[Firestore] Profil trouvé:', profile ? 'OUI' : 'NON');

          if (profile) {
            console.log('[Firestore] role:', profile.role, '| status:', profile.status, '| telecomNumber:', profile.telecomNumber);
            const userData = buildUserObject(profile);
            setUser(userData);
            setLoading(false);

            if (userData) {
              const target = getTargetRoute(userData, path);
              console.log('[Router] Route cible:', target || '(page actuelle OK)');
              if (target) router.push(target);
            }
          } else {
            // Profile doesn't exist in Firestore — user signed up but doc missing
            console.error('[Firestore] ❌ Document telecom_users/' + firebaseUser.uid + ' introuvable');
            setAuthError('Profil utilisateur introuvable. Veuillez vous réinscrire ou contacter l\'administration.');
            setUser(null);
            setLoading(false);
            // Don't stay stuck — redirect to login
            if (!isPublicPage(path)) {
              router.push('/login');
            }
          }
        } catch (err) {
          console.error('[Firestore] ❌ Erreur lecture profil:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setAuthError(
            msg.includes('délai dépassé')
              ? 'Le profil met trop de temps à charger (réseau ou Firestore). Réessayez ou vérifiez les règles / la connexion.'
              : 'Erreur de chargement du profil. Vérifiez votre connexion.'
          );
          setUser(null);
          setLoading(false);
          if (!isPublicPage(path)) {
            router.push('/login');
          }
        }
      } else {
        console.log('[Auth] ❌ Non connecté');
        setAuthUid(null);
        setUser(null);
        setContacts([]);
        setCalls([]);
        setAuthError(null);
        setLoading(false);
        if (!isPublicPage(path)) {
          router.push('/login');
        }
      }
    });

    return () => unsubscribe();
  }, [router, buildUserObject]);

  // ── Re-check routing on pathname change ──
  useEffect(() => {
    if (loading || !user) return;
    const target = getTargetRoute(user, pathname);
    if (target) router.push(target);
  }, [pathname, user, loading, router]);

  // ── Load data when approved ──
  useEffect(() => {
    if (!authUid || !user || user.status !== 'approved') return;
    const loadData = async () => {
      try {
        const rawContacts = await firestoreGetContacts(authUid);
        setContacts(rawContacts.map((c) => ({
          id: c.id || '', contactUid: c.contactUid, name: c.name, phone: c.phone,
          isInternal: c.isInternal, avatarColor: c.avatarColor || generateAvatarColor(),
          isFavorite: c.isFavorite || false,
          addedAt: timestampToISO(c.addedAt as { seconds: number; nanoseconds: number } | null),
        })));
        const rawCalls = await getCallHistory(user.telecomNumber);
        setCalls(rawCalls.map((c) => ({
          id: c.id || '',
          callerUserId: c.callerUserId,
          callerTelecomNumber: c.callerTelecomNumber || c.from,
          targetUserId: c.targetUserId,
          targetTelecomNumber: c.targetTelecomNumber || c.to,
          targetExternalNumber: c.targetExternalNumber,
          from: c.from, to: c.to, fromName: c.fromName, toName: c.toName,
          durationSeconds: c.durationSeconds || c.duration,
          type: (c.callType || (c.type === 'internal' ? 'internal_call' : 'external_call')),
          direction: (c.direction || (c.from === user.telecomNumber ? 'outgoing' : 'incoming')),
          status: c.status,
          cost: c.cost,
          billingSource: c.billingSource || (c.cost > 0 ? 'balance' : 'free'),
          providerMode: c.providerMode,
          providerName: c.providerName,
          providerCallId: c.providerCallId,
          externalRouteStatus: c.externalRouteStatus,
          isRealTelephony: c.isRealTelephony,
          startedAt: timestampToISO(c.startedAt as { seconds: number; nanoseconds: number } | null),
          answeredAt: timestampToISO(c.answeredAt as { seconds: number; nanoseconds: number } | null),
          endedAt: timestampToISO(c.endedAt as { seconds: number; nanoseconds: number } | null),
          createdAt: timestampToISO(c.createdAt as { seconds: number; nanoseconds: number } | null),
        })));
      } catch (err) { console.error('Error loading data:', err); }
    };
    loadData();
  }, [authUid, user]);

  // ── Refresh data ──
  const refreshData = useCallback(async () => {
    if (!authUid || !user) return;
    const profile = await getTelecomUser(authUid);
    const updatedUser = buildUserObject(profile);
    if (updatedUser) setUser(updatedUser);
    if (user.status === 'approved') {
      const rawContacts = await firestoreGetContacts(authUid);
      setContacts(rawContacts.map((c) => ({
        id: c.id || '', contactUid: c.contactUid, name: c.name, phone: c.phone,
        isInternal: c.isInternal, avatarColor: c.avatarColor || generateAvatarColor(),
        isFavorite: c.isFavorite || false,
        addedAt: timestampToISO(c.addedAt as { seconds: number; nanoseconds: number } | null),
      })));
      const rawCalls = await getCallHistory(user.telecomNumber);
      setCalls(rawCalls.map((c) => ({
        id: c.id || '',
        callerUserId: c.callerUserId,
        callerTelecomNumber: c.callerTelecomNumber || c.from,
        targetUserId: c.targetUserId,
        targetTelecomNumber: c.targetTelecomNumber || c.to,
        targetExternalNumber: c.targetExternalNumber,
        from: c.from, to: c.to, fromName: c.fromName, toName: c.toName,
        durationSeconds: c.durationSeconds || c.duration,
        type: (c.callType || (c.type === 'internal' ? 'internal_call' : 'external_call')),
        direction: (c.direction || (c.from === user.telecomNumber ? 'outgoing' : 'incoming')),
        status: c.status,
        cost: c.cost,
        billingSource: c.billingSource || (c.cost > 0 ? 'balance' : 'free'),
        providerMode: c.providerMode,
        providerName: c.providerName,
        providerCallId: c.providerCallId,
        externalRouteStatus: c.externalRouteStatus,
        isRealTelephony: c.isRealTelephony,
        startedAt: timestampToISO(c.startedAt as { seconds: number; nanoseconds: number } | null),
        answeredAt: timestampToISO(c.answeredAt as { seconds: number; nanoseconds: number } | null),
        endedAt: timestampToISO(c.endedAt as { seconds: number; nanoseconds: number } | null),
        createdAt: timestampToISO(c.createdAt as { seconds: number; nanoseconds: number } | null),
      })));
    }
  }, [authUid, user, buildUserObject]);

  const addContact = useCallback(async (contact: { name: string; phone: string; isInternal: boolean }) => {
    if (!authUid) return;
    try {
      let isInternal = contact.isInternal;
      let contactUid: string | undefined;
      const foundUser = await getUserByTelecomNumber(contact.phone);
      if (foundUser) { isInternal = true; contactUid = foundUser.uid; }
      await addContactToFirestore(authUid, {
        contactUid, name: contact.name, phone: contact.phone,
        isInternal, isFavorite: false, avatarColor: generateAvatarColor(),
      });
      await refreshData();
      showToast({ message: 'Contact ajouté', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Impossible d’ajouter le contact', variant: 'error' });
    }
  }, [authUid, refreshData, showToast]);

  const deleteContact = useCallback(async (id: string) => {
    if (!authUid) return;
    try {
      await deleteContactFromFirestore(authUid, id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast({ message: 'Contact supprimé', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Suppression impossible', variant: 'error' });
    }
  }, [authUid, showToast]);

  const toggleFavorite = useCallback(async (id: string, currentValue: boolean) => {
    if (!authUid) return;
    const next = !currentValue;
    try {
      await toggleFavoriteInFirestore(authUid, id, next);
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, isFavorite: next } : c)));
      showToast({
        message: next ? 'Ajouté aux favoris' : 'Retiré des favoris',
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Impossible de mettre à jour le favori', variant: 'error' });
    }
  }, [authUid, showToast]);

  const startCall = useCallback((contact: Contact) => {
    setCallState({ active: true, phase: 'ringing', contact, startTime: Date.now(), duration: 0, isInternal: contact.isInternal, direction: 'outgoing' });
    if (user && authUid && contact.isInternal && contact.contactUid) {
      void initiateInternalCall(
        authUid,
        user.telecomNumber,
        user.name,
        contact.contactUid,
        contact.phone,
        contact.name
      ).then((ids) => {
        internalCallPairRef.current = ids;
        setCurrentInternalCallIds(ids);
        setCurrentInternalCallRole('caller');
      }).catch((err) => console.error('Error initiating internal call:', err));
    }
    if (user && authUid && !contact.isInternal) {
      const runtime = getProviderRuntimeInfo();
      setExternalProviderSession({
        providerMode: runtime.mode,
        providerName: runtime.name,
        isRealTelephony: runtime.isRealTelephony,
        externalRouteStatus: 'initiated',
      });
      void voiceProvider.placeExternalCall({
        callerUserId: authUid,
        callerTelecomNumber: user.telecomNumber,
        callerName: user.name,
        targetExternalNumber: contact.phone,
      }).then((res) => {
        setExternalProviderSession({
          providerMode: res.providerMode,
          providerName: res.providerName,
          providerCallId: res.providerCallId,
          externalRouteStatus: res.externalRouteStatus,
          externalResponse: res.rawResponse,
          isRealTelephony: res.isRealTelephony,
        });
      }).catch((err) => {
        setExternalProviderSession({
          providerMode: runtime.mode,
          providerName: runtime.name,
          externalRouteStatus: 'failed',
          externalResponse: { error: String(err) },
          isRealTelephony: runtime.isRealTelephony,
        });
      });
    }
    if (!contact.isInternal) {
      setTimeout(() => {
        setCallState((prev) => prev.active ? { ...prev, phase: 'connected', startTime: Date.now() } : prev);
      }, 2000);
    }
  }, [user, authUid]);

  const answerIncomingCall = useCallback(async () => {
    const pair = internalCallPairRef.current;
    if (!pair?.outgoingCallId || !pair?.incomingCallId) return;
    try {
      await answerInternalCallPair(pair);
      setCallState((prev) => (prev.active ? { ...prev, phase: 'connected', startTime: Date.now() } : prev));
      showToast({ message: 'Appel accepté', variant: 'success' });
    } catch (err) {
      console.error('answerIncomingCall', err);
      showToast({ message: 'Impossible d’accepter l’appel', variant: 'error' });
    }
  }, [showToast]);

  const rejectIncomingCall = useCallback(async () => {
    const pair = internalCallPairRef.current;
    if (!pair?.outgoingCallId || !pair?.incomingCallId) return;
    try {
      await rejectInternalCallPair(pair);
      setCallState({ active: false, phase: 'ended', contact: null, startTime: 0, duration: 0, isInternal: false, direction: 'outgoing' });
      setCurrentInternalCallIds(null);
      setCurrentInternalCallRole(null);
      internalCallPairRef.current = null;
      await refreshData();
      showToast({ message: 'Appel refusé', variant: 'info' });
    } catch (err) {
      console.error('rejectIncomingCall', err);
      showToast({ message: 'Impossible de refuser l’appel', variant: 'error' });
    }
  }, [refreshData, showToast]);

  const endCall = useCallback(async () => {
    const currentState = callState;
    if (!currentState.active || !currentState.contact || !user) {
      setCallState((prev) => ({ ...prev, active: false, phase: 'ended' }));
      return;
    }
    const duration = currentState.phase === 'connected' ? Math.floor((Date.now() - currentState.startTime) / 1000) : 0;
    const cost = calculateCallCost(duration, currentState.isInternal, currentState.contact.phone);
    const finalStatus = currentState.phase === 'ringing' ? 'missed' : 'completed';
    const wasRinging = currentState.phase === 'ringing';
    const role = currentInternalCallRole;
    setCallState({ active: false, phase: 'ended', contact: null, startTime: 0, duration, isInternal: false });
    try {
      if (!authUid) throw new Error('Utilisateur non connecté');
      if (currentState.isInternal || cost <= 0) {
        if (currentInternalCallIds) {
          if (currentState.phase === 'ringing' && currentInternalCallRole === 'callee') {
            await rejectInternalCallPair(currentInternalCallIds);
          } else if (currentState.phase === 'ringing' && currentInternalCallRole === 'caller') {
            await cancelInternalCallPair(currentInternalCallIds);
          } else {
            await completeInternalCallPair(currentInternalCallIds, duration, finalStatus);
            if (currentInternalCallRole === 'caller') {
              await consumeInternalPackMinutes(
                authUid,
                user.telecomNumber,
                user.name,
                currentState.contact.phone,
                currentState.contact.name,
                duration,
                finalStatus,
                true
              );
            }
          }
        } else {
          await consumeInternalPackMinutes(
            authUid,
            user.telecomNumber,
            user.name,
            currentState.contact.phone,
            currentState.contact.name,
            duration,
            finalStatus,
            false
          );
        }
      } else {
        let providerMeta = externalProviderSession;
        if (providerMeta?.providerCallId) {
          try {
            const endRes = await voiceProvider.endExternalCall({
              providerCallId: providerMeta.providerCallId,
              reason: finalStatus === 'completed' ? 'completed' : 'missed',
            });
            providerMeta = {
              ...providerMeta,
              externalRouteStatus: endRes.externalRouteStatus,
              externalResponse: endRes.rawResponse,
            };
          } catch (err) {
            providerMeta = {
              ...(providerMeta || {
                providerMode: 'mock',
                providerName: 'MockVoiceProvider',
                isRealTelephony: false,
              }),
              externalRouteStatus: 'failed',
              externalResponse: { error: String(err) },
            };
          }
        }
        if (providerMeta?.isRealTelephony) {
          // Real calls are finalized and billed by provider webhook (idempotent server flow).
          console.log('External real call end requested; waiting webhook sync');
        } else {
          await completeExternalCall(authUid, currentState.contact.phone, duration, finalStatus, providerMeta || undefined);
        }
      }
      setCurrentInternalCallIds(null);
      setCurrentInternalCallRole(null);
      internalCallPairRef.current = null;
      setExternalProviderSession(null);
      await refreshData();

      if (wasRinging && role === 'caller') {
        showToast({ message: 'Appel annulé', variant: 'info' });
      } else if (finalStatus === 'completed' && duration > 0) {
        const timeLabel = formatDuration(duration);
        if (currentState.isInternal) {
          showToast({ message: `Appel BZT terminé · ${timeLabel}`, variant: 'success' });
        } else if (cost > 0) {
          showToast({
            message: `Appel terminé · ${timeLabel} (est. ~$${cost.toFixed(2)})`,
            variant: 'success',
          });
        } else {
          showToast({ message: `Appel terminé · ${timeLabel}`, variant: 'success' });
        }
      } else if (finalStatus === 'completed') {
        showToast({ message: 'Appel terminé', variant: 'success' });
      }
    } catch (err) {
      console.error('Error logging call:', err);
      showToast({ message: 'Erreur lors de l’enregistrement de l’appel', variant: 'error' });
    }
  }, [callState, user, authUid, refreshData, currentInternalCallIds, currentInternalCallRole, externalProviderSession, showToast]);

  // Appels entrants internes (sonnerie) — ref pour ne pas ignorer un appel à cause d’une closure périmée
  useEffect(() => {
    if (!authUid || !user || user.status !== 'approved') return;
    const q = query(
      collection(db, 'telecom_calls'),
      where('targetUserId', '==', authUid),
      where('callType', '==', 'internal_call'),
      where('direction', '==', 'incoming'),
      where('status', '==', 'ringing')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty || callActiveRef.current) return;
      const docSnap = snap.docs[0];
      const d = docSnap.data();
      const linkedOut = d.linkedCallId as string | undefined;
      if (!linkedOut) {
        console.error('[incoming call] linkedCallId manquant', docSnap.id);
        return;
      }
      const contact: Contact = {
        id: `incoming-${docSnap.id}`,
        contactUid: d.callerUserId,
        name: d.fromName || 'Appel entrant',
        phone: d.from || d.callerTelecomNumber,
        isInternal: true,
        avatarColor: '#06b6d4',
        isFavorite: false,
        addedAt: null,
      };
      const pair = {
        outgoingCallId: linkedOut,
        incomingCallId: docSnap.id,
        callSessionId: (d.callSessionId as string) || `sess-${docSnap.id}`,
      };
      internalCallPairRef.current = pair;
      setCallState({ active: true, phase: 'ringing', contact, startTime: Date.now(), duration: 0, isInternal: true, direction: 'incoming' });
      setCurrentInternalCallIds(pair);
      setCurrentInternalCallRole('callee');
    });
    return () => unsubscribe();
  }, [authUid, user]);

  // Real-time sync for active internal call transitions.
  useEffect(() => {
    if (!currentInternalCallIds) return;
    const primaryId =
      currentInternalCallRole === 'callee'
        ? currentInternalCallIds.incomingCallId
        : currentInternalCallIds.outgoingCallId;
    if (!primaryId) return;
    const unsubscribe = onSnapshot(doc(db, 'telecom_calls', primaryId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data) return;
      if (data.status === 'answered' && callState.active && callState.phase === 'ringing') {
        setCallState((prev) => prev.active ? { ...prev, phase: 'connected', startTime: Date.now() } : prev);
      }
      if (['rejected', 'cancelled', 'completed', 'missed', 'failed'].includes(data.status)) {
        setCallState((prev) => prev.active ? { ...prev, active: false, phase: 'ended' } : prev);
        setCurrentInternalCallIds(null);
        setCurrentInternalCallRole(null);
        internalCallPairRef.current = null;
        void refreshData();
      }
    });
    return () => unsubscribe();
  }, [currentInternalCallIds, currentInternalCallRole, callState.active, callState.phase, refreshData]);

  const estimateExternalCallCost = useCallback(async (targetNumber: string, minutes: number) => {
    if (minutes <= 0) return 0;
    const operator = detectOperator(targetNumber);
    const defaultRate = calculateCallCost(60, false, targetNumber);
    // calculateCallCost returns 1-minute cost with default local rates.
    // This is a fast UI estimate; final billed value is computed atomically server-side.
    const oneMinute = operator.id === 'internal' ? 0 : defaultRate;
    return Math.round(oneMinute * minutes * 100) / 100;
  }, []);

  const rechargeCredit = useCallback(async (amount: number) => {
    if (!authUid) return;
    if (amount <= 0) return;
    try {
      await performRecharge(authUid, amount, 'Recharge manuelle utilisateur');
      await refreshData();
      showToast({ message: `Recharge de $${amount.toFixed(2)} enregistrée`, variant: 'success' });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Recharge impossible';
      showToast({ message: msg, variant: 'error' });
    }
  }, [authUid, refreshData, showToast]);

  const logout = useCallback(async () => {
    setUser(null);
    setAuthError(null);
    await authSignOut();
  }, []);

  // Noop functions
  const noopAsync = useCallback(async () => {}, []);
  const noopContact = useCallback(async (_c: { name: string; phone: string; isInternal: boolean }) => {}, []);
  const noopId = useCallback(async (_id: string) => {}, []);
  const noopFav = useCallback(async (_id: string, _v: boolean) => {}, []);
  const noopCall = useCallback((_c: Contact) => {}, []);
  const noopEnd = useCallback(() => {}, []);
  const noopRecharge = useCallback(async (_n: number) => {}, []);
  const noopToast = useCallback((_opts: { message: string; variant?: 'success' | 'error' | 'info' }) => {}, []);

  const isReady = user && user.status === 'approved';

  const contextValue: AppContextType = {
    user, contacts, calls, callState, loading, authError,
    addContact: isReady ? addContact : noopContact,
    deleteContact: isReady ? deleteContact : noopId,
    toggleFavorite: isReady ? toggleFavorite : noopFav,
    startCall: isReady ? startCall : noopCall,
    endCall: isReady ? endCall : noopEnd,
    answerIncomingCall: isReady ? answerIncomingCall : noopAsync,
    rejectIncomingCall: isReady ? rejectIncomingCall : noopAsync,
    estimateExternalCallCost: isReady ? estimateExternalCallCost : async () => 0,
    rechargeCredit: isReady ? rechargeCredit : noopRecharge,
    refreshData: isReady ? refreshData : noopAsync,
    logout,
    showToast: isReady ? showToast : noopToast,
  };

  // ── Loading Screen ──
  if (loading) {
    return (
      <AppContext.Provider value={contextValue}>
        <LoadingShell />
      </AppContext.Provider>
    );
  }

  // ── Error Screen (profile not found / Firestore error) ──
  if (authError && !isPublicPage(pathname)) {
    return (
      <AppContext.Provider value={contextValue}>
        <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060b18', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ fontSize: '2rem', marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f87171', marginBottom: 8 }}>
              Erreur de connexion
            </div>
            <div style={{ fontSize: '0.8rem', color: '#4a5e7a', marginBottom: 20, lineHeight: 1.5 }}>
              {authError}
            </div>
            <button
              onClick={logout}
              style={{
                padding: '10px 24px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444', fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              Retour à la connexion
            </button>
          </div>
        </div>
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}
