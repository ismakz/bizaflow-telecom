'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { useApp } from '@/app/components/AppProvider';
import {
  acceptInternalCall,
  addCallIceCandidate,
  conversationIdFor,
  declineInternalCall,
  endInternalCall,
  markInternalCallMissed,
  markMessageAsRead,
  saveCallerOffer,
  saveReceiverAnswer,
  sendInternalMessage,
  startInternalCall,
  subscribeCallSignal,
  subscribeConversationMessages,
  subscribeIncomingMessages,
  subscribeIncomingInternalCalls,
  subscribeInternalCall,
  subscribeInternalUsers,
  subscribeRecentInternalCalls,
  subscribeUserConversations,
  touchUserPresence,
  type InternalTelecomUser,
  type TelecomConversation,
  type TelecomInternalCall,
  type TelecomMessage,
} from '@/app/lib/internalTelecom';
import { auth } from '@/app/lib/firebase';
import { onForegroundPushMessage, registerPushToken } from '@/app/lib/pushNotifications';
import { formatDuration, formatTime, getInitials } from '@/app/lib/utils';

const statusLabels = {
  online: 'En ligne',
  offline: 'Hors ligne',
  busy: 'Occupé',
  in_call: 'En appel',
} as const;

type RtcRole = 'caller' | 'receiver';
type CallUiStatus = 'idle' | 'ringing' | 'connecting' | 'connected' | 'failed' | 'ended';

const statusColors = {
  online: '#10b981',
  offline: '#64748b',
  busy: '#f59e0b',
  in_call: '#06b6d4',
} as const;

const callUiStatusLabels = {
  idle: 'Inactif',
  ringing: 'Sonnerie',
  connecting: 'Connexion',
  connected: 'Connecté',
  failed: 'Échec',
  ended: 'Terminé',
} as const;

const cardStyle = {
  background: 'rgba(255,255,255,0.035)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
} satisfies React.CSSProperties;

export default function InternalTelecomPage() {
  const { user, showToast } = useApp();
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<InternalTelecomUser[]>([]);
  const [conversations, setConversations] = useState<TelecomConversation[]>([]);
  const [messages, setMessages] = useState<TelecomMessage[]>([]);
  const [recentCalls, setRecentCalls] = useState<TelecomInternalCall[]>([]);
  const [incomingCalls, setIncomingCalls] = useState<TelecomInternalCall[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [search, setSearch] = useState('');
  const [activeCall, setActiveCall] = useState<TelecomInternalCall | null>(null);
  const [callNotice, setCallNotice] = useState('');
  const [callUiStatus, setCallUiStatus] = useState<CallUiStatus>('idle');
  const [rtcWarning, setRtcWarning] = useState('');
  const [rtcLogs, setRtcLogs] = useState<string[]>([]);
  const [microphoneOk, setMicrophoneOk] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const [localTrackCount, setLocalTrackCount] = useState(0);
  const [iceState, setIceState] = useState<RTCIceConnectionState>('new');
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [signalingState, setSignalingState] = useState<RTCSignalingState>('stable');
  const [remoteStreamReceived, setRemoteStreamReceived] = useState(false);
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const [offerWritten, setOfferWritten] = useState(false);
  const [offerReceived, setOfferReceived] = useState(false);
  const [answerWritten, setAnswerWritten] = useState(false);
  const [answerReceived, setAnswerReceived] = useState(false);
  const [localCandidateCount, setLocalCandidateCount] = useState(0);
  const [remoteCandidateCount, setRemoteCandidateCount] = useState(0);
  const [audioPlayStatus, setAudioPlayStatus] = useState('En attente');
  const [lastWebRtcError, setLastWebRtcError] = useState('');
  const [ringtoneBlocked, setRingtoneBlocked] = useState(false);
  const [ringtoneActive, setRingtoneActive] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [showIncomingCallModal, setShowIncomingCallModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [sending, setSending] = useState(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorRef = useRef<OscillatorNode | null>(null);
  const ringtoneGainRef = useRef<GainNode | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalUnsubscribeRef = useRef<(() => void) | null>(null);
  const processedCandidateKeysRef = useRef<Set<string>>(new Set());
  const callerAnswerAppliedRef = useRef(false);
  const receiverOfferAppliedRef = useRef(false);
  const receiverAnswerSentRef = useRef(false);
  const activeCallRef = useRef<TelecomInternalCall | null>(null);
  const incomingMessagesInitializedRef = useRef(false);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const incomingMessagesPermissionToastShownRef = useRef(false);
  const conversationMessagesPermissionToastShownRef = useRef(false);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const addRtcLog = useCallback((message: string) => {
    const stamped = `${new Date().toLocaleTimeString()} - ${message}`;
    console.log(`[Bizaflow WebRTC] ${message}`);
    setRtcLogs((current) => [stamped, ...current].slice(0, 12));
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    const remoteAudio = remoteAudioRef.current || (document.getElementById('remoteAudio') as HTMLAudioElement | null);
    if (!remoteAudio) {
      setRtcWarning('Element audio distant introuvable.');
      setLastWebRtcError('Element audio distant introuvable');
      return;
    }
    remoteAudio.srcObject = stream;
    remoteAudio.muted = false;
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute('playsinline', 'true');
    remoteAudio.volume = 1;
    setRemoteStreamReceived(true);
    setRemoteTrackCount(stream.getAudioTracks().length || stream.getTracks().length);
    setAudioPlayStatus('Lecture demandee');
    void remoteAudio.play().then(() => {
      setAudioPlayStatus('Lecture OK');
      setLastWebRtcError('');
    }).catch((error: unknown) => {
      console.error('Erreur audio:', error);
      setAudioPlayStatus('Bloquee');
      setLastWebRtcError(error instanceof Error ? error.message : String(error));
      setRtcWarning('Cliquez sur Relancer audio si le navigateur bloque la lecture.');
    });
  }, []);

  const replayRemoteAudio = useCallback(() => {
    const remoteAudio = remoteAudioRef.current || (document.getElementById('remoteAudio') as HTMLAudioElement | null);
    if (!remoteAudio?.srcObject) {
      setRtcWarning('Aucun flux audio distant disponible pour le moment.');
      return;
    }
    remoteAudio.muted = false;
    remoteAudio.volume = 1;
    setAudioPlayStatus('Relance demandee');
    void remoteAudio.play().then(() => {
      setRtcWarning('');
      setAudioPlayStatus('Lecture OK');
      setLastWebRtcError('');
      addRtcLog('remote audio play retried');
    }).catch((error: unknown) => {
      console.error('Erreur audio:', error);
      setAudioPlayStatus('Bloquee');
      setLastWebRtcError(error instanceof Error ? error.message : String(error));
      setRtcWarning('Lecture audio encore bloquee par le navigateur.');
    });
  }, [addRtcLog]);

  const playMessageSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = ringtoneContextRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      window.setTimeout(() => {
        try {
          oscillator.stop();
        } catch {
          // Browser audio cleanup can fail if already closed.
        }
      }, 140);
    } catch {
      // Notification sound is best-effort; toast remains visible.
    }
  }, []);

  const stopIncomingRing = useCallback(() => {
    console.log('Stopping ringtone');
    try {
      ringtoneOscillatorRef.current?.stop();
    } catch {
      // ignore cleanup errors
    } finally {
      ringtoneOscillatorRef.current = null;
      setRingtoneActive(false);
    }
  }, []);

  const playIncomingRing = useCallback(async () => {
    if (typeof window === 'undefined' || ringtoneOscillatorRef.current) return;
    console.log('Starting ringtone');
    try {
      const ctx = ringtoneContextRef.current;
      if (!ctx) {
        setRingtoneBlocked(true);
        console.log('Ringtone blocked by browser');
        return;
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 740;
      gain.gain.value = 1;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      ringtoneOscillatorRef.current = oscillator;
      ringtoneGainRef.current = gain;
      setRingtoneActive(true);
      setRingtoneBlocked(false);
      console.log('Ringtone playing');
    } catch {
      console.log('Ringtone blocked by browser');
      setRingtoneBlocked(true);
      setRingtoneActive(false);
    }
  }, []);

  const enableNotificationsAndRingtone = useCallback(async () => {
    if (!user || typeof window === 'undefined') return;
    setActivationBusy(true);
    setActivationError('');
    try {
      console.log(`Notification permission: ${Notification.permission}`);
    } catch {
      console.log('Notification permission: unsupported');
    }
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !ringtoneContextRef.current) {
        ringtoneContextRef.current = new AudioCtx();
      }
      if (ringtoneContextRef.current?.state === 'suspended') {
        await ringtoneContextRef.current.resume().catch(() => undefined);
      }
      const result = await registerPushToken(user.uid);
      if ('serviceWorker' in navigator) {
        const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (swReg) console.log('Service worker registered');
      }
      if (result.ok) {
        setAlertsEnabled(true);
        console.log('Push token saved');
        playMessageSound();
        setNotificationStatus('Notifications et sonnerie activées');
        showToast({ message: 'Notifications et sonnerie activées', variant: 'success' });
        setShowActivationModal(false);
        window.localStorage.setItem('telecom_alerts_enabled', 'true');
      } else if (result.reason === 'VAPID_KEY_NOT_CONFIGURED') {
        const msg = 'Configuration push incomplète. Contactez l’administrateur.';
        setNotificationStatus(msg);
        setActivationError(msg);
      } else {
        const denied = result.reason === 'NOTIFICATION_PERMISSION_DENIED' || result.permission === 'denied';
        const msg = denied
          ? 'Votre navigateur bloque les notifications. Cliquez sur le cadenas près de l’adresse du site, puis autorisez Notifications.'
          : 'Configuration push incomplète. Contactez l’administrateur.';
        setNotificationStatus(msg);
        setActivationError(msg);
      }
    } catch {
      const msg = 'Configuration push incomplète. Contactez l’administrateur.';
      setNotificationStatus(msg);
      setActivationError(msg);
    } finally {
      setActivationBusy(false);
    }
  }, [playMessageSound, showToast, user]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.uid === selectedUserId) || null,
    [contacts, selectedUserId]
  );
  const selectedConversationId = user && selectedUserId ? conversationIdFor(user.uid, selectedUserId) : '';

  useEffect(() => {
    const userFromUrl = searchParams.get('user');
    if (userFromUrl) {
      setSelectedUserId(userFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    void touchUserPresence(user.uid, 'online');
    const setOffline = () => {
      void touchUserPresence(user.uid, 'offline');
    };
    window.addEventListener('beforeunload', setOffline);
    return () => {
      window.removeEventListener('beforeunload', setOffline);
      void touchUserPresence(user.uid, 'offline');
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setNotificationStatus('Cliquez sur "Activer notifications et sonnerie" pour recevoir les alertes message/appel.');
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('telecom_alerts_enabled') === 'true';
    const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
    const enabled = stored && granted;
    setAlertsEnabled(enabled);
    setShowActivationModal(!enabled);
  }, [user]);

  useEffect(() => {
    let unsubscribe = () => {};
    void onForegroundPushMessage((payload) => {
      console.log('Foreground message received', payload);
      if (payload.type === 'internal_message') {
        if (payload.messageId && notifiedMessageIdsRef.current.has(payload.messageId)) return;
        if (payload.messageId) notifiedMessageIdsRef.current.add(payload.messageId);
        if (payload.senderId) setSelectedUserId((current) => current || payload.senderId || '');
        showToast({ message: payload.body || 'Nouveau message Bizaflow', variant: 'info' });
        playMessageSound();
        return;
      }
      setCallNotice(payload.body || 'Appel entrant');
      console.log('Incoming call detected');
      setShowIncomingCallModal(true);
      void playIncomingRing();
      vibrateIncomingCall();
    }).then((unsub) => {
      unsubscribe = unsub;
    });
    return () => unsubscribe();
  }, [playIncomingRing, playMessageSound, showToast]);

  useEffect(() => {
    if (!user) return;
    if (user.status !== 'approved') {
      console.warn('[Listener skip] subscribeIncomingMessages user not approved', {
        currentUserUid: user.uid,
        telecomNumber: user.telecomNumber,
        status: user.status,
      });
      return;
    }
    incomingMessagesInitializedRef.current = false;
    console.log('[Listener subscribe] incoming_messages', {
      listener: 'subscribeIncomingMessages',
      collection: 'telecom_messages',
      query: { receiverId: user.uid },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsub = subscribeIncomingMessages(
      user.uid,
      (items) => {
        if (!incomingMessagesInitializedRef.current) {
          items.forEach((item) => notifiedMessageIdsRef.current.add(item.id));
          incomingMessagesInitializedRef.current = true;
          return;
        }
        const fresh = items
          .filter((item) => !notifiedMessageIdsRef.current.has(item.id))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        fresh.forEach((message) => {
          notifiedMessageIdsRef.current.add(message.id);
          const sender = contacts.find((contact) => contact.uid === message.senderId);
          const senderName = sender?.name || 'Contact Bizaflow';
          const preview = message.body.length > 90 ? `${message.body.slice(0, 87)}...` : message.body;
          showToast({ message: `${senderName}: ${preview}`, variant: 'info' });
          playMessageSound();
        });
      },
      (error) => {
        console.error('[Listener error] subscribeIncomingMessages', {
          collection: 'telecom_messages',
          query: { receiverId: user.uid },
          currentUserUid: user.uid,
          telecomNumber: user.telecomNumber,
          error,
        });
        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          if (!incomingMessagesPermissionToastShownRef.current) {
            incomingMessagesPermissionToastShownRef.current = true;
            setNotificationStatus('Accès messages interne refusé. Vérifiez les permissions de votre compte.');
          }
        }
      }
    );
    return () => unsub();
  }, [contacts, playMessageSound, showToast, user]);

  useEffect(() => {
    if (!user) return;
    console.log('[Listener subscribe] internal_users', {
      listener: 'subscribeInternalUsers',
      collection: 'telecom_users + telecom_presence',
      query: { status: 'approved' },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsubUsers = subscribeInternalUsers(user.uid, (items) => {
      setContacts(items);
      setSelectedUserId((current) => current || items[0]?.uid || '');
    });
    console.log('[Listener subscribe] user_conversations', {
      listener: 'subscribeUserConversations',
      collection: 'telecom_conversations',
      query: { participantIdsArrayContains: user.uid },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsubConversations = subscribeUserConversations(user.uid, setConversations);
    console.log('[Listener subscribe] incoming_internal_calls', {
      listener: 'subscribeIncomingInternalCalls',
      collection: 'telecom_internal_calls',
      query: { receiverId: user.uid, status: 'ringing' },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsubIncoming = subscribeIncomingInternalCalls(user.uid, setIncomingCalls);
    console.log('[Listener subscribe] recent_internal_calls', {
      listener: 'subscribeRecentInternalCalls',
      collection: 'telecom_internal_calls',
      query: { participantsArrayContains: user.uid },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsubCalls = subscribeRecentInternalCalls(user.uid, setRecentCalls);
    return () => {
      unsubUsers();
      unsubConversations();
      unsubIncoming();
      unsubCalls();
    };
  }, [user]);

  useEffect(() => {
    if (!selectedConversationId || !user) {
      setMessages([]);
      return;
    }
    console.log('[Listener subscribe] conversation_messages', {
      listener: 'subscribeConversationMessages',
      collection: 'telecom_messages',
      query: { conversationId: selectedConversationId },
      currentUserUid: user.uid,
      telecomNumber: user.telecomNumber,
    });
    const unsub = subscribeConversationMessages(
      selectedConversationId,
      (items) => {
        setMessages(items);
        void markMessageAsRead(selectedConversationId, user.uid);
      },
      (error) => {
        console.error('[Listener error] subscribeConversationMessages', {
          collection: 'telecom_messages',
          query: { conversationId: selectedConversationId },
          currentUserUid: user.uid,
          telecomNumber: user.telecomNumber,
          error,
        });
        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          if (!conversationMessagesPermissionToastShownRef.current) {
            conversationMessagesPermissionToastShownRef.current = true;
            setNotificationStatus('Accès conversation refusé. Vérifiez les permissions de ce chat.');
          }
          return;
        }
        showToast({ message: 'Lecture des messages impossible', variant: 'error' });
      }
    );
    return () => unsub();
  }, [selectedConversationId, showToast, user]);

  const cleanupWebRtc = useCallback((nextStatus: CallUiStatus = 'idle') => {
    signalUnsubscribeRef.current?.();
    signalUnsubscribeRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    processedCandidateKeysRef.current.clear();
    callerAnswerAppliedRef.current = false;
    receiverOfferAppliedRef.current = false;
    receiverAnswerSentRef.current = false;
    setMicrophoneOk(false);
    setMicrophoneError('');
    setLocalTrackCount(0);
    setIceState('new');
    setConnectionState('new');
    setSignalingState('stable');
    setRemoteStreamReceived(false);
    setRemoteTrackCount(0);
    setOfferWritten(false);
    setOfferReceived(false);
    setAnswerWritten(false);
    setAnswerReceived(false);
    setLocalCandidateCount(0);
    setRemoteCandidateCount(0);
    setAudioPlayStatus('En attente');
    setLastWebRtcError('');
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.muted = false;
    }
    remoteStreamRef.current = null;
    setCallUiStatus(nextStatus);
  }, []);

  useEffect(() => {
    if (!incomingCalls[0]) return;
    setActiveCall(incomingCalls[0]);
    setCallNotice(`${incomingCalls[0].callerName} vous appelle`);
    console.log('Incoming call detected');
    setShowIncomingCallModal(true);
    void playIncomingRing();
    vibrateIncomingCall();
  }, [incomingCalls, playIncomingRing]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') return;
    const timer = window.setTimeout(() => {
      void markInternalCallMissed(activeCall);
      setCallNotice('Appel manqué');
      setActiveCall(null);
      setShowIncomingCallModal(false);
      stopIncomingRing();
      cleanupWebRtc('ended');
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [activeCall, cleanupWebRtc, stopIncomingRing]);

  useEffect(() => {
    if (!activeCall?.id) return;
    console.log('[Listener subscribe] internal_call', {
      listener: 'subscribeInternalCall',
      collection: 'telecom_internal_calls',
      query: { id: activeCall.id },
      currentUserUid: user?.uid,
      telecomNumber: user?.telecomNumber,
    });
    const unsub = subscribeInternalCall(activeCall.id, (freshCall) => {
      if (!freshCall) return;
      setActiveCall(freshCall);
      if (freshCall.status === 'accepted' && freshCall.callerId === user?.uid) {
        setCallNotice('Appel accepté. Connexion audio en cours...');
        setCallUiStatus((current) => current === 'connected' ? current : 'connecting');
      }
      if (['declined', 'missed', 'completed', 'failed'].includes(freshCall.status)) {
        setCallNotice(
          freshCall.status === 'declined' ? 'Appel refusé' :
          freshCall.status === 'missed' ? 'Pas de réponse' :
          freshCall.status === 'failed' ? 'Appel en échec' :
          'Appel terminé'
        );
        cleanupWebRtc('ended');
        setShowIncomingCallModal(false);
        stopIncomingRing();
        void touchUserPresence(user?.uid || '', 'online');
      }
    });
    return () => unsub();
  }, [activeCall?.id, cleanupWebRtc, stopIncomingRing, user?.uid]);

  useEffect(() => {
    if (!['failed', 'disconnected'].includes(iceState)) return;
    const timer = window.setTimeout(() => {
      if (peerConnectionRef.current && ['failed', 'disconnected'].includes(peerConnectionRef.current.iceConnectionState)) {
        setRtcWarning('Connexion audio impossible sur ce réseau. Serveur TURN requis.');
        setLastWebRtcError('Connexion audio impossible sur ce réseau. Serveur TURN requis.');
      }
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [iceState]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.telecomNumber, contact.role]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [contacts, search]);

  const unreadFor = useCallback(
    (contactId: string) => {
      const conversation = conversations.find((item) => item.id === (user ? conversationIdFor(user.uid, contactId) : ''));
      return user ? conversation?.unreadCountByUser?.[user.uid] || 0 : 0;
    },
    [conversations, user]
  );

  const getLocalAudioStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('MICROPHONE_NOT_SUPPORTED');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Micro OK', stream);
      localStreamRef.current = stream;
      setMicrophoneOk(true);
      setMicrophoneError('');
      setLocalTrackCount(stream.getAudioTracks().length || stream.getTracks().length);
      addRtcLog('microphone granted');
      return stream;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MICROPHONE_PERMISSION_DENIED';
      setMicrophoneError(message);
      setLastWebRtcError(message);
      throw new Error('MICROPHONE_PERMISSION_DENIED');
    }
  }, [addRtcLog]);

  const createPeerConnection = useCallback(async (callId: string, role: RtcRole) => {
    const stream = await getLocalAudioStream();
    peerConnectionRef.current?.close();
    processedCandidateKeysRef.current.clear();
    callerAnswerAppliedRef.current = false;
    receiverOfferAppliedRef.current = false;
    receiverAnswerSentRef.current = false;

    const peerConnection = new RTCPeerConnection({ iceServers: getWebRtcIceServers() });
    peerConnectionRef.current = peerConnection;
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    setIceState(peerConnection.iceConnectionState);
    setConnectionState(peerConnection.connectionState);
    setSignalingState(peerConnection.signalingState);
    addRtcLog('peer connection created');

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
      addRtcLog('local track added');
    });

    peerConnection.ontrack = (event) => {
      addRtcLog('remote track received');
      console.log('Remote stream reçu', event.streams);
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      remoteStreamRef.current.addTrack(event.track);
      const remoteStream = event.streams[0] || remoteStreamRef.current;
      attachRemoteStream(remoteStream);
    };

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      console.log('ICE envoyé', event.candidate);
      setLocalCandidateCount((current) => current + 1);
      addRtcLog('ICE candidate sent');
      void addCallIceCandidate(callId, role, event.candidate.toJSON()).catch(() => {
        setLastWebRtcError('ICE candidate send failed');
        addRtcLog('ICE candidate send failed');
      });
    };

    peerConnection.onconnectionstatechange = () => {
      setConnectionState(peerConnection.connectionState);
      addRtcLog(`connectionState: ${peerConnection.connectionState}`);
      if (peerConnection.connectionState === 'connected') {
        setCallUiStatus('connected');
        setCallNotice('Appel connecté');
      }
      if (['failed', 'disconnected'].includes(peerConnection.connectionState)) {
        setCallUiStatus('failed');
        setLastWebRtcError('WebRTC failed/disconnected');
        setRtcWarning('Connexion audio impossible sur ce réseau. Serveur TURN requis.');
      }
    };

    peerConnection.onsignalingstatechange = () => {
      setSignalingState(peerConnection.signalingState);
      addRtcLog(`signalingState: ${peerConnection.signalingState}`);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE state:', peerConnection.iceConnectionState);
      setIceState(peerConnection.iceConnectionState);
      addRtcLog(`iceConnectionState: ${peerConnection.iceConnectionState}`);
      if (['failed', 'disconnected'].includes(peerConnection.iceConnectionState)) {
        setCallUiStatus('failed');
        setRtcWarning('Connexion audio impossible sur ce réseau. Serveur TURN requis.');
      }
    };

    return peerConnection;
  }, [addRtcLog, attachRemoteStream, getLocalAudioStream]);

  const addRemoteCandidates = useCallback(async (candidates: RTCIceCandidateInit[]) => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection?.remoteDescription) return;
    for (const candidate of candidates) {
      const key = `${candidate.candidate || ''}:${candidate.sdpMid || ''}:${candidate.sdpMLineIndex ?? ''}`;
      if (!candidate.candidate || processedCandidateKeysRef.current.has(key)) continue;
      processedCandidateKeysRef.current.add(key);
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        setRemoteCandidateCount((current) => current + 1);
        addRtcLog('ICE candidate received');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastWebRtcError(message);
        addRtcLog('ICE candidate add failed');
      }
    }
  }, [addRtcLog]);

  const subscribeCallerSignal = useCallback((callId: string) => {
    signalUnsubscribeRef.current?.();
    signalUnsubscribeRef.current = subscribeCallSignal(callId, async (signal) => {
      if (!signal) return;
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return;
      if (signal.receiverAnswer && !callerAnswerAppliedRef.current) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.receiverAnswer));
        callerAnswerAppliedRef.current = true;
        setAnswerReceived(true);
        addRtcLog('answer received');
        setCallUiStatus('connecting');
      }
      await addRemoteCandidates(signal.receiverCandidates || []);
    });
  }, [addRemoteCandidates, addRtcLog]);

  const subscribeReceiverSignal = useCallback((callId: string) => {
    signalUnsubscribeRef.current?.();
    signalUnsubscribeRef.current = subscribeCallSignal(callId, async (signal) => {
      if (!signal) return;
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) return;
      if (signal.callerOffer && !receiverOfferAppliedRef.current) {
        addRtcLog('offer received');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.callerOffer));
        receiverOfferAppliedRef.current = true;
        setOfferReceived(true);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await saveReceiverAnswer(callId, answer);
        receiverAnswerSentRef.current = true;
        setAnswerWritten(true);
        addRtcLog('answer created');
        setCallUiStatus('connecting');
      }
      await addRemoteCandidates(signal.callerCandidates || []);
    });
  }, [addRemoteCandidates, addRtcLog]);

  const sendMessage = useCallback(async () => {
    if (!user || !selectedContact || sending) return;
    setSending(true);
    try {
      const messageId = await sendInternalMessage({
        senderId: user.uid,
        receiverId: selectedContact.uid,
        body: messageBody,
      });
      void sendInternalMessagePush(messageId);
      setMessageBody('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Message impossible';
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        showToast({ message: 'Permission refusée: vous ne pouvez pas écrire ce message.', variant: 'error' });
      } else {
        showToast({ message: explainError(message), variant: 'error' });
      }
    } finally {
      setSending(false);
    }
  }, [messageBody, selectedContact, sending, showToast, user]);

  const callSelected = useCallback(async () => {
    if (!user || !selectedContact) return;
    if (selectedContact.presenceStatus === 'offline') {
      showToast({ message: 'Utilisateur hors ligne', variant: 'error' });
      return;
    }
    if (selectedContact.presenceStatus === 'in_call' || selectedContact.presenceStatus === 'busy') {
      showToast({ message: 'Utilisateur déjà occupé', variant: 'error' });
      return;
    }

    try {
      setRtcWarning('');
      setRtcLogs([]);
      setCallUiStatus('connecting');
      await getLocalAudioStream();
      const callId = await startInternalCall({
        callerId: user.uid,
        receiverId: selectedContact.uid,
        callerName: user.name,
        receiverName: selectedContact.name,
      });
      setCallNotice('Appel lancé. Session audio interne prête pour WebRTC.');
      setActiveCall({
        id: callId,
        callerId: user.uid,
        receiverId: selectedContact.uid,
        callerName: user.name,
        receiverName: selectedContact.name,
        status: 'ringing',
        startedAt: null,
        answeredAt: null,
        endedAt: null,
        durationSeconds: 0,
        createdAt: null,
        updatedAt: null,
      });
      const peerConnection = await createPeerConnection(callId, 'caller');
      subscribeCallerSignal(callId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await saveCallerOffer(callId, offer);
      setOfferWritten(true);
      addRtcLog('offer created');
      setCallNotice('Appel lancé. En attente de réponse...');
      setCallUiStatus('ringing');
      await sendIncomingCallPush(callId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Appel impossible';
      showToast({ message: explainError(message), variant: 'error' });
      cleanupWebRtc('failed');
    }
  }, [addRtcLog, cleanupWebRtc, createPeerConnection, getLocalAudioStream, selectedContact, showToast, subscribeCallerSignal, user]);

  const acceptCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      setRtcWarning('');
      setCallUiStatus('connecting');
      await getLocalAudioStream();
      await createPeerConnection(activeCall.id, 'receiver');
      subscribeReceiverSignal(activeCall.id);
      await acceptInternalCall(activeCall, user.uid);
      setActiveCall({ ...activeCall, status: 'accepted' });
      stopIncomingRing();
      setCallNotice('Appel accepté. Connexion audio en cours...');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Acceptation impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, createPeerConnection, getLocalAudioStream, showToast, stopIncomingRing, subscribeReceiverSignal, user]);

  const declineCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      await declineInternalCall(activeCall, user.uid);
      setCallNotice('Appel refusé');
      setActiveCall(null);
      setShowIncomingCallModal(false);
      stopIncomingRing();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refus impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, showToast, stopIncomingRing, user]);

  const endCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      await endInternalCall(activeCall, user.uid);
      setCallNotice('Appel terminé');
      setActiveCall(null);
      setShowIncomingCallModal(false);
      stopIncomingRing();
      void touchUserPresence(user.uid, 'online');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fin appel impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, showToast, stopIncomingRing, user]);

  if (!user) return null;

  return (
    <div className="page-container telecom-page-container" style={{ paddingBottom: 92 }}>
      <div className="glow-bg" />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="page-header" style={{ marginBottom: 4 }}>
            <span className="page-header-gradient">Telecom interne</span>
          </h1>
          <p style={{ margin: 0, color: '#4a5e7a', fontSize: '0.78rem' }}>
            Chat et appels Bizaflow à Bizaflow, sans minutes externes
          </p>
        </div>
        <div style={{ ...cardStyle, padding: '8px 12px', color: '#10b981', fontSize: '0.72rem', fontWeight: 800 }}>
          Interne gratuit
        </div>
      </div>

      {callNotice && (
        <div style={{ ...cardStyle, padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(6,182,212,0.12)', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
            CALL
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{callNotice}</div>
            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
              Les appels internes n’utilisent pas Telnyx/Twilio.
            </div>
          </div>
          {activeCall?.status === 'ringing' && (
            <button onClick={stopIncomingRing} style={secondaryButtonStyle}>Couper</button>
          )}
          {activeCall?.status === 'ringing' && ringtoneBlocked && (
            <button onClick={enableNotificationsAndRingtone} style={secondaryButtonStyle}>Activer notifications et sonnerie</button>
          )}
          {activeCall?.status === 'ringing' && activeCall.receiverId === user.uid && (
            <>
              <button onClick={acceptCall} className="btn-primary" style={{ width: 'auto', padding: '9px 12px' }}>Accepter</button>
              <button onClick={declineCall} style={dangerButtonStyle}>Refuser</button>
            </>
          )}
          {activeCall && activeCall.status !== 'ringing' && (
            <button onClick={endCall} style={dangerButtonStyle}>Terminer</button>
          )}
        </div>
      )}

      {notificationStatus && (
        <div style={{ ...cardStyle, padding: '9px 12px', marginBottom: 12, color: notificationStatus.startsWith('Notifications activ') ? '#10b981' : '#f59e0b', fontSize: '0.76rem' }}>
          {notificationStatus}
        </div>
      )}

      {showActivationModal && (
        <div style={activationModalBackdropStyle}>
          <div style={activationModalStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.03rem' }}>Activez les appels et notifications Bizaflow Telecom</h2>
            <p style={{ margin: '0 0 14px', color: '#cbd5e1', fontSize: '0.86rem', lineHeight: 1.45 }}>
              Pour recevoir les appels, messages et sonneries même en arrière-plan, autorisez les notifications.
              {' '}Pour une activation 100% automatique comme WhatsApp, une application mobile native Android/iOS sera nécessaire.
            </p>
            {activationError && (
              <div style={{ ...cardStyle, padding: '8px 10px', marginBottom: 12, color: '#f59e0b', fontSize: '0.78rem' }}>
                {activationError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={enableNotificationsAndRingtone}
                className="btn-primary"
                style={{ width: 'auto', padding: '10px 14px', opacity: activationBusy ? 0.7 : 1 }}
                disabled={activationBusy}
              >
                {activationBusy ? 'Activation...' : 'Activer maintenant'}
              </button>
              {activationError && (
                <button onClick={enableNotificationsAndRingtone} style={secondaryButtonStyle} disabled={activationBusy}>
                  Réessayer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 10, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: '0.74rem', color: alertsEnabled ? '#10b981' : '#94a3b8', fontWeight: 700 }}>
          {alertsEnabled ? 'Alertes actives' : 'Alertes inactives'}
        </div>
        <button onClick={enableNotificationsAndRingtone} style={secondaryButtonStyle}>Activer notifications et sonnerie</button>
      </div>

      {showIncomingCallModal && activeCall?.receiverId === user.uid && activeCall.status === 'ringing' && (
        <div style={incomingModalBackdropStyle}>
          <div style={incomingModalStyle}>
            <div style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 6 }}>Appel entrant</div>
            <div style={{ color: '#cbd5e1', marginBottom: 14 }}>{activeCall.callerName} vous appelle</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={acceptCall} className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }}>Accepter</button>
              <button onClick={declineCall} style={dangerButtonStyle}>Refuser</button>
            </div>
          </div>
        </div>
      )}

      {(activeCall || callUiStatus !== 'idle' || rtcWarning || rtcLogs.length > 0) && (
        <section style={{ ...cardStyle, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: rtcWarning || rtcLogs.length > 0 ? 10 : 0 }}>
            <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 800 }}>WebRTC</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 24,
              padding: '3px 9px',
              borderRadius: 999,
              background: callUiStatus === 'connected' ? 'rgba(16,185,129,0.14)' : callUiStatus === 'failed' ? 'rgba(239,68,68,0.14)' : 'rgba(6,182,212,0.12)',
              color: callUiStatus === 'connected' ? '#10b981' : callUiStatus === 'failed' ? '#f87171' : '#06b6d4',
              fontSize: '0.72rem',
              fontWeight: 900,
            }}>
              {callUiStatusLabels[callUiStatus]}
            </span>
            {activeCall?.id && (
              <span style={{ color: '#64748b', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                {activeCall.id}
              </span>
            )}
            <button onClick={replayRemoteAudio} style={{ ...secondaryButtonStyle, padding: '6px 9px', fontSize: '0.68rem' }}>
              Relancer audio
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 8, marginBottom: rtcWarning || rtcLogs.length > 0 ? 10 : 0 }}>
            <DebugPill label="Micro local" value={microphoneOk ? 'OK' : (microphoneError ? 'Erreur' : 'En attente')} ok={microphoneOk} warn={!!microphoneError} />
            <DebugPill label="Local tracks" value={String(localTrackCount)} ok={localTrackCount > 0} />
            <DebugPill label="Remote stream" value={remoteStreamReceived ? 'Recu' : 'Non recu'} ok={remoteStreamReceived} />
            <DebugPill label="Remote tracks" value={String(remoteTrackCount)} ok={remoteTrackCount > 0} />
            <DebugPill label="ICE state" value={iceState} ok={iceState === 'connected' || iceState === 'completed'} warn={iceState === 'checking'} />
            <DebugPill label="Connection" value={connectionState} ok={connectionState === 'connected'} warn={connectionState === 'connecting'} />
            <DebugPill label="Signaling" value={signalingState} ok={signalingState === 'stable'} warn={signalingState !== 'stable'} />
            <DebugPill label="Offer written" value={offerWritten ? 'yes' : 'no'} ok={offerWritten} />
            <DebugPill label="Offer received" value={offerReceived ? 'yes' : 'no'} ok={offerReceived} />
            <DebugPill label="Answer written" value={answerWritten ? 'yes' : 'no'} ok={answerWritten} />
            <DebugPill label="Answer received" value={answerReceived ? 'yes' : 'no'} ok={answerReceived} />
            <DebugPill label="Local ICE" value={String(localCandidateCount)} ok={localCandidateCount > 0} />
            <DebugPill label="Remote ICE" value={String(remoteCandidateCount)} ok={remoteCandidateCount > 0} />
            <DebugPill label="Audio play" value={audioPlayStatus} ok={audioPlayStatus === 'Lecture OK'} warn={audioPlayStatus === 'Bloquee'} />
            <DebugPill label="Sonnerie" value={ringtoneActive ? 'Active' : ringtoneBlocked ? 'Bloquee' : 'Inactive'} ok={ringtoneActive} warn={ringtoneBlocked} />
            <DebugPill label="Remote stream" value={remoteStreamReceived ? 'Reçu' : 'En attente'} ok={remoteStreamReceived} />
          </div>
          {lastWebRtcError && (
            <div style={{ color: '#f87171', fontSize: '0.72rem', marginBottom: 10 }}>
              Derniere erreur WebRTC: {lastWebRtcError}
            </div>
          )}
          {rtcWarning && (
            <div style={{ color: '#f59e0b', fontSize: '0.76rem', marginBottom: rtcLogs.length > 0 ? 10 : 0 }}>
              {rtcWarning}
            </div>
          )}
          {rtcLogs.length > 0 && (
            <div style={{
              display: 'grid',
              gap: 4,
              maxHeight: 150,
              overflow: 'auto',
              padding: 10,
              borderRadius: 10,
              background: 'rgba(2,6,23,0.38)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {rtcLogs.map((log) => (
                <div key={log} style={{ color: '#94a3b8', fontSize: '0.68rem', fontFamily: 'monospace', lineHeight: 1.35 }}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="internal-telecom-grid">
        <section style={{ ...cardStyle, padding: 12, minHeight: 520 }}>
          <input
            className="input-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, BZT, rôle..."
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredContacts.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: 24, fontSize: '0.82rem' }}>
                Aucun utilisateur interne actif
              </div>
            ) : filteredContacts.map((contact) => {
              const unread = unreadFor(contact.uid);
              const active = contact.uid === selectedUserId;
              return (
                <button
                  key={contact.uid}
                  onClick={() => setSelectedUserId(contact.uid)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    padding: 10, borderRadius: 10, cursor: 'pointer',
                    border: active ? '1px solid rgba(6,182,212,0.35)' : '1px solid rgba(255,255,255,0.06)',
                    background: active ? 'rgba(6,182,212,0.09)' : 'rgba(255,255,255,0.025)',
                    color: '#e2e8f0',
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(6,182,212,0.12)', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0 }}>
                    {getInitials(contact.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                      {unread > 0 && <span style={badgeStyle}>{unread}</span>}
                    </div>
                    <div style={{ color: '#06b6d4', fontSize: '0.68rem', fontFamily: 'monospace' }}>{contact.telecomNumber}</div>
                    <div style={{ color: statusColors[contact.presenceStatus], fontSize: '0.67rem', marginTop: 2 }}>
                      {statusLabels[contact.presenceStatus]} · {contact.role}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ ...cardStyle, minHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedContact ? (
            <>
              <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedContact.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.74rem' }}>
                    {selectedContact.telecomNumber} · {statusLabels[selectedContact.presenceStatus]}
                  </div>
                </div>
                <button onClick={callSelected} className="btn-primary" style={{ width: 'auto', padding: '10px 14px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  Appel audio
                </button>
              </div>

              <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.length === 0 ? (
                  <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center', fontSize: '0.82rem' }}>
                    Aucun message. Démarrez la conversation interne.
                  </div>
                ) : messages.map((message) => {
                  const mine = message.senderId === user.uid;
                  return (
                    <div key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
                      <div style={{
                        padding: '9px 12px',
                        borderRadius: mine ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                        background: mine ? 'linear-gradient(135deg, #06b6d4, #14b8a6)' : 'rgba(255,255,255,0.06)',
                        color: mine ? '#fff' : '#e2e8f0',
                        fontSize: '0.86rem',
                        lineHeight: 1.45,
                      }}>
                        {message.body}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.62rem', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                        {formatTime(message.createdAt ? new Date(message.createdAt.seconds * 1000).toISOString() : null)} · {message.status}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="input-field"
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder="Message interne..."
                  style={{ minWidth: 0 }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageBody.trim() || sending}
                  className="btn-primary"
                  style={{ width: 112, flex: '0 0 112px', opacity: !messageBody.trim() || sending ? 0.55 : 1, whiteSpace: 'nowrap' }}
                >
                  Envoyer
                </button>
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', color: '#64748b', fontSize: '0.85rem' }}>Sélectionnez un utilisateur</div>
          )}
        </section>
      </div>

      <section style={{ ...cardStyle, padding: 14, marginTop: 12 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>Historique appels internes</h2>
        {recentCalls.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucun appel interne récent</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {recentCalls.slice(0, 6).map((call) => {
              const peerName = call.callerId === user.uid ? call.receiverName : call.callerName;
              return (
                <div key={call.id} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{peerName}</div>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 3 }}>
                    {call.status} · {formatDuration(call.durationSeconds || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <audio id="remoteAudio" ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}

function DebugPill({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  const color = ok ? '#10b981' : warn ? '#f59e0b' : '#94a3b8';
  const background = ok ? 'rgba(16,185,129,0.12)' : warn ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.09)';
  return (
    <div style={{ padding: '8px 10px', borderRadius: 10, background, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ color: '#64748b', fontSize: '0.64rem', fontWeight: 800, marginBottom: 3 }}>{label}</div>
      <div style={{ color, fontSize: '0.76rem', fontWeight: 900 }}>{value}</div>
    </div>
  );
}

const dangerButtonStyle = {
  padding: '9px 12px',
  borderRadius: 10,
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.28)',
  color: '#f87171',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.78rem',
} satisfies React.CSSProperties;

const secondaryButtonStyle = {
  padding: '9px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.78rem',
} satisfies React.CSSProperties;

const badgeStyle = {
  minWidth: 18,
  height: 18,
  borderRadius: 999,
  background: '#06b6d4',
  color: '#001018',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.65rem',
  fontWeight: 900,
} satisfies React.CSSProperties;

const incomingModalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1200,
  padding: 16,
} satisfies React.CSSProperties;

const incomingModalStyle = {
  width: 'min(420px, 100%)',
  borderRadius: 14,
  background: '#0f172a',
  border: '1px solid rgba(6,182,212,0.38)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.42)',
  padding: 18,
  textAlign: 'center',
} satisfies React.CSSProperties;

const activationModalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.76)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1300,
  padding: 16,
} satisfies React.CSSProperties;

const activationModalStyle = {
  width: 'min(500px, 100%)',
  borderRadius: 14,
  background: '#0f172a',
  border: '1px solid rgba(6,182,212,0.36)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
  padding: 18,
  textAlign: 'center',
} satisfies React.CSSProperties;

function explainError(message: string): string {
  if (message.includes('OFFLINE')) return 'Utilisateur hors ligne';
  if (message.includes('DISABLED')) return 'Fonction interne désactivée';
  if (message.includes('SELF')) return 'Action impossible sur votre propre compte';
  if (message.includes('RECEIVER_NOT_AVAILABLE')) return 'Destinataire non joignable';
  if (message.includes('FORBIDDEN')) return 'Action non autorisée';
  if (message.includes('BODY_REQUIRED')) return 'Message vide';
  if (message.includes('BODY_TOO_LONG')) return 'Message trop long';
  return 'Action interne impossible';
}

async function sendIncomingCallPush(callId: string): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  console.log('Notify API called', { type: 'internal_call', callId });
  try {
    const response = await fetch('/api/telecom/internal-calls/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ callId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('Notify API error', { type: 'internal_call', status: response.status, payload });
      return;
    }
    console.log('Notify API success', { type: 'internal_call', payload });
  } catch (error) {
    console.error('Notify API error', { type: 'internal_call', error });
  }
}

async function sendInternalMessagePush(messageId: string): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  console.log('Notify API called', { type: 'internal_message', messageId });
  try {
    const response = await fetch('/api/telecom/internal-messages/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messageId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('Notify API error', { type: 'internal_message', status: response.status, payload });
      return;
    }
    console.log('Notify API success', { type: 'internal_message', payload });
  } catch (error) {
    console.error('Notify API error', { type: 'internal_message', error });
  }
}

function vibrateIncomingCall() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([240, 120, 240, 120, 240]);
  }
}

function getWebRtcIceServers(): RTCIceServer[] {
  const defaultServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUsername && turnCredential) {
    defaultServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }
  return defaultServers;
}
