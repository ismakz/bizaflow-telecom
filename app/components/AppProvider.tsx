'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { User, Contact, CallRecord, CallSimulationState } from '@/app/lib/types';
import BizaflowLogo from '@/app/components/BizaflowLogo';
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
import { calculateCallCost, detectOperator, generateAvatarColor, timestampToISO } from '@/app/lib/utils';
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
  if (userData.mustChangePassword && currentPath !== '/change-password') return '/change-password';
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

export default function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentInternalCallIds, setCurrentInternalCallIds] = useState<{ outgoingCallId: string; incomingCallId: string; callSessionId: string } | null>(null);
  const [currentInternalCallRole, setCurrentInternalCallRole] = useState<'caller' | 'callee' | null>(null);
  const [externalProviderSession, setExternalProviderSession] = useState<{
    providerMode: ProviderMode;
    providerName: string;
    providerCallId?: string;
    externalRouteStatus?: string;
    externalResponse?: unknown;
    isRealTelephony: boolean;
  } | null>(null);

  const [callState, setCallState] = useState<CallSimulationState>({
    active: false, phase: 'ringing', contact: null, startTime: 0, duration: 0, isInternal: false, direction: 'outgoing',
  });

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

  // ── Auth listener ──
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        console.log('[Auth] ✅ Utilisateur connecté:', firebaseUser.uid, firebaseUser.email);
        setAuthUid(firebaseUser.uid);
        setAuthError(null);

        try {
          const profile = await getTelecomUser(firebaseUser.uid);
          console.log('[Firestore] Profil trouvé:', profile ? 'OUI' : 'NON');

          if (profile) {
            console.log('[Firestore] role:', profile.role, '| status:', profile.status, '| telecomNumber:', profile.telecomNumber);
            const userData = buildUserObject(profile);
            setUser(userData);
            setLoading(false);

            if (userData) {
              const target = getTargetRoute(userData, pathname);
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
            if (!isPublicPage(pathname)) {
              router.push('/login');
            }
          }
        } catch (err) {
          console.error('[Firestore] ❌ Erreur lecture profil:', err);
          setAuthError('Erreur de chargement du profil. Vérifiez votre connexion.');
          setUser(null);
          setLoading(false);
          if (!isPublicPage(pathname)) {
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
        if (!isPublicPage(pathname)) {
          router.push('/login');
        }
      }
    });

    return () => unsubscribe();
  }, [pathname, router, buildUserObject]);

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
    let isInternal = contact.isInternal;
    let contactUid: string | undefined;
    const foundUser = await getUserByTelecomNumber(contact.phone);
    if (foundUser) { isInternal = true; contactUid = foundUser.uid; }
    await addContactToFirestore(authUid, {
      contactUid, name: contact.name, phone: contact.phone,
      isInternal, isFavorite: false, avatarColor: generateAvatarColor(),
    });
    await refreshData();
  }, [authUid, refreshData]);

  const deleteContact = useCallback(async (id: string) => {
    if (!authUid) return;
    await deleteContactFromFirestore(authUid, id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, [authUid]);

  const toggleFavorite = useCallback(async (id: string, currentValue: boolean) => {
    if (!authUid) return;
    await toggleFavoriteInFirestore(authUid, id, !currentValue);
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c)));
  }, [authUid]);

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
    if (!currentInternalCallIds) return;
    await answerInternalCallPair(currentInternalCallIds);
    setCallState((prev) => prev.active ? { ...prev, phase: 'connected', startTime: Date.now() } : prev);
  }, [currentInternalCallIds]);

  const rejectIncomingCall = useCallback(async () => {
    if (!currentInternalCallIds) return;
    await rejectInternalCallPair(currentInternalCallIds);
    setCallState({ active: false, phase: 'ended', contact: null, startTime: 0, duration: 0, isInternal: false, direction: 'outgoing' });
    setCurrentInternalCallIds(null);
    setCurrentInternalCallRole(null);
    await refreshData();
  }, [currentInternalCallIds, refreshData]);

  const endCall = useCallback(async () => {
    const currentState = callState;
    if (!currentState.active || !currentState.contact || !user) {
      setCallState((prev) => ({ ...prev, active: false, phase: 'ended' }));
      return;
    }
    const duration = currentState.phase === 'connected' ? Math.floor((Date.now() - currentState.startTime) / 1000) : 0;
    const cost = calculateCallCost(duration, currentState.isInternal, currentState.contact.phone);
    const finalStatus = currentState.phase === 'ringing' ? 'missed' : 'completed';
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
      setExternalProviderSession(null);
      await refreshData();
    } catch (err) { console.error('Error logging call:', err); }
  }, [callState, user, authUid, refreshData, currentInternalCallIds, externalProviderSession]);

  // Real-time incoming ringing calls for the callee
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
      if (snap.empty || callState.active) return;
      const d = snap.docs[0].data();
      const contact: Contact = {
        id: `incoming-${snap.docs[0].id}`,
        contactUid: d.callerUserId,
        name: d.fromName || 'Appel entrant',
        phone: d.from || d.callerTelecomNumber,
        isInternal: true,
        avatarColor: '#06b6d4',
        isFavorite: false,
        addedAt: null,
      };
      setCallState({ active: true, phase: 'ringing', contact, startTime: Date.now(), duration: 0, isInternal: true, direction: 'incoming' });
      setCurrentInternalCallIds({
        outgoingCallId: d.linkedCallId || '',
        incomingCallId: snap.docs[0].id,
        callSessionId: d.callSessionId || `sess-${snap.docs[0].id}`,
      });
      setCurrentInternalCallRole('callee');
    });
    return () => unsubscribe();
  }, [authUid, user, callState.active]);

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
    await performRecharge(authUid, amount, 'Recharge manuelle utilisateur');
    await refreshData();
  }, [authUid, refreshData]);

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
  };

  // ── Loading Screen ──
  if (loading) {
    return (
      <AppContext.Provider value={contextValue}>
        <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060b18' }}>
          <div style={{ textAlign: 'center' }}>
            <BizaflowLogo size={66} />
            <div style={{ color: '#4a5e7a', fontSize: '0.75rem', marginTop: 8 }}>Chargement...</div>
          </div>
        </div>
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
    </AppContext.Provider>
  );
}
