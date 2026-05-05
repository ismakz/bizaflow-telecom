import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/app/lib/firebase';
import type { UserRole, UserStatus } from '@/app/lib/types';

export type PresenceStatus = 'online' | 'offline' | 'busy' | 'in_call';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type InternalCallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'completed' | 'failed';
export type IceCandidateRole = 'caller' | 'receiver';

export interface InternalTelecomUser {
  uid: string;
  name: string;
  email: string;
  telecomNumber: string;
  role: UserRole;
  status: UserStatus;
  presenceStatus: PresenceStatus;
  lastSeenAt: Timestamp | null;
}

export interface TelecomConversation {
  id: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  unreadCountByUser: Record<string, number>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  body: string;
  status: MessageStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomInternalCall {
  id: string;
  callerId: string;
  receiverId: string;
  callerName: string;
  receiverName: string;
  status: InternalCallStatus;
  startedAt: Timestamp | null;
  answeredAt: Timestamp | null;
  endedAt: Timestamp | null;
  durationSeconds: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomCallSignal {
  id: string;
  callId: string;
  callerOffer: RTCSessionDescriptionInit | null;
  receiverAnswer: RTCSessionDescriptionInit | null;
  callerCandidates: RTCIceCandidateInit[];
  receiverCandidates: RTCIceCandidateInit[];
  stunServers: string[];
  turnConfigured: boolean;
  sessionReady: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface InternalSettings {
  internalCallsEnabled: boolean;
  internalMessagesEnabled: boolean;
  internalCallsFree: boolean;
  callTimeoutSeconds: number;
  allowOfflineMessages: boolean;
  requireActiveSubscription: boolean;
}

const DEFAULT_INTERNAL_SETTINGS: InternalSettings = {
  internalCallsEnabled: true,
  internalMessagesEnabled: true,
  internalCallsFree: true,
  callTimeoutSeconds: 30,
  allowOfflineMessages: true,
  requireActiveSubscription: true,
};

export function conversationIdFor(userA: string, userB: string): string {
  return [userA, userB].sort().join('__');
}

export async function getInternalSettings(): Promise<InternalSettings> {
  const snap = await getDoc(doc(db, 'telecom_internal_settings', 'default'));
  if (!snap.exists()) {
    await setDoc(doc(db, 'telecom_internal_settings', 'default'), {
      ...DEFAULT_INTERNAL_SETTINGS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return DEFAULT_INTERNAL_SETTINGS;
  }
  return { ...DEFAULT_INTERNAL_SETTINGS, ...snap.data() } as InternalSettings;
}

export async function touchUserPresence(userId: string, presenceStatus: PresenceStatus): Promise<void> {
  if (!userId) return;
  await setDoc(
    doc(db, 'telecom_presence', userId),
    {
      userId,
      presenceStatus,
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeInternalUsers(
  currentUserId: string,
  callback: (users: InternalTelecomUser[]) => void
): Unsubscribe {
  const usersQuery = query(collection(db, 'telecom_users'), where('status', '==', 'approved'));
  const presenceRef = collection(db, 'telecom_presence');
  let users: InternalTelecomUser[] = [];
  let presenceMap = new Map<string, { presenceStatus: PresenceStatus; lastSeenAt: Timestamp | null }>();

  const emit = () => {
    callback(
      users
        .filter((item) => item.uid !== currentUserId)
        .map((item) => {
          const presence = presenceMap.get(item.uid);
          return {
            ...item,
            presenceStatus: presence?.presenceStatus || 'offline',
            lastSeenAt: presence?.lastSeenAt || null,
          };
        })
        .sort((a, b) => {
          if (a.presenceStatus !== b.presenceStatus) return a.presenceStatus === 'online' ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
    );
  };

  const unsubUsers = onSnapshot(usersQuery, (snap) => {
    users = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        name: String(data.name || data.email || 'Utilisateur Bizaflow'),
        email: String(data.email || ''),
        telecomNumber: String(data.telecomNumber || ''),
        role: (data.role || 'user') as UserRole,
        status: (data.status || 'pending') as UserStatus,
        presenceStatus: 'offline',
        lastSeenAt: null,
      };
    });
    emit();
  });

  const unsubPresence = onSnapshot(presenceRef, (snap) => {
    presenceMap = new Map(
      snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return [
          docSnap.id,
          {
            presenceStatus: (data.presenceStatus || 'offline') as PresenceStatus,
            lastSeenAt: (data.lastSeenAt || null) as Timestamp | null,
          },
        ];
      })
    );
    emit();
  });

  return () => {
    unsubUsers();
    unsubPresence();
  };
}

export function subscribeUserConversations(
  userId: string,
  callback: (conversations: TelecomConversation[]) => void
): Unsubscribe {
  const conversationsQuery = query(
    collection(db, 'telecom_conversations'),
    where('participantIds', 'array-contains', userId)
  );
  return onSnapshot(conversationsQuery, (snap) => {
    callback(
      snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomConversation))
        .sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0))
    );
  });
}

export function subscribeConversationMessages(
  conversationId: string,
  callback: (messages: TelecomMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const messagesQuery = query(collection(db, 'telecom_messages'), where('conversationId', '==', conversationId));
  return onSnapshot(
    messagesQuery,
    (snap) => {
      callback(
        snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomMessage))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeIncomingMessages(
  userId: string,
  callback: (messages: TelecomMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const messagesQuery = query(collection(db, 'telecom_messages'), where('receiverId', '==', userId));
  return onSnapshot(
    messagesQuery,
    (snap) => {
      callback(
        snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomMessage))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeInternalCall(
  callId: string,
  callback: (call: TelecomInternalCall | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'telecom_internal_calls', callId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as TelecomInternalCall) : null);
  });
}

export function subscribeCallSignal(
  callId: string,
  callback: (signal: TelecomCallSignal | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'telecom_call_signals', callId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as TelecomCallSignal) : null);
  });
}

export async function saveCallerOffer(callId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  await setDoc(
    doc(db, 'telecom_call_signals', callId),
    {
      callerOffer: offer,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveReceiverAnswer(callId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  await setDoc(
    doc(db, 'telecom_call_signals', callId),
    {
      receiverAnswer: answer,
      sessionReady: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function addCallIceCandidate(
  callId: string,
  role: IceCandidateRole,
  candidate: RTCIceCandidateInit
): Promise<void> {
  await setDoc(
    doc(db, 'telecom_call_signals', callId),
    {
      [role === 'caller' ? 'callerCandidates' : 'receiverCandidates']: arrayUnion(candidate),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function sendInternalMessage(input: {
  senderId: string;
  receiverId: string;
  body: string;
}): Promise<string> {
  const settings = await getInternalSettings();
  if (!settings.internalMessagesEnabled) throw new Error('MESSAGES_INTERNAL_DISABLED');
  if (!input.senderId || !input.receiverId) throw new Error('MESSAGE_PARTICIPANTS_REQUIRED');
  if (input.senderId === input.receiverId) throw new Error('MESSAGE_SELF_NOT_ALLOWED');

  const body = input.body.trim();
  if (!body) throw new Error('MESSAGE_BODY_REQUIRED');
  if (body.length > 2000) throw new Error('MESSAGE_BODY_TOO_LONG');

  const conversationId = conversationIdFor(input.senderId, input.receiverId);
  const conversationRef = doc(db, 'telecom_conversations', conversationId);
  const now = serverTimestamp();

  await setDoc(
    conversationRef,
    {
      participantIds: [input.senderId, input.receiverId].sort(),
      lastMessage: body,
      lastMessageAt: now,
      [`unreadCountByUser.${input.senderId}`]: 0,
      [`unreadCountByUser.${input.receiverId}`]: increment(1),
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  const messageRef = await addDoc(collection(db, 'telecom_messages'), {
    conversationId,
    senderId: input.senderId,
    receiverId: input.receiverId,
    body,
    status: 'sent',
    createdAt: now,
    updatedAt: now,
  });

  return messageRef.id;
}

export async function markMessageAsRead(conversationId: string, userId: string): Promise<void> {
  if (!conversationId || !userId) return;
  const snap = await getDocs(query(collection(db, 'telecom_messages'), where('conversationId', '==', conversationId)));
  await Promise.all(
    snap.docs
      .filter((messageDoc) => messageDoc.data().receiverId === userId && messageDoc.data().status !== 'read')
      .map((messageDoc) => updateDoc(doc(db, 'telecom_messages', messageDoc.id), { status: 'read', updatedAt: serverTimestamp() }))
  );
  await setDoc(
    doc(db, 'telecom_conversations', conversationId),
    {
      [`unreadCountByUser.${userId}`]: 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeIncomingInternalCalls(
  userId: string,
  callback: (calls: TelecomInternalCall[]) => void
): Unsubscribe {
  const callsQuery = query(
    collection(db, 'telecom_internal_calls'),
    where('receiverId', '==', userId),
    where('status', '==', 'ringing')
  );
  return onSnapshot(callsQuery, (snap) => {
    callback(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomInternalCall)));
  });
}

export function subscribeRecentInternalCalls(
  userId: string,
  callback: (calls: TelecomInternalCall[]) => void
): Unsubscribe {
  const callsQuery = query(collection(db, 'telecom_internal_calls'), where('participants', 'array-contains', userId));
  return onSnapshot(callsQuery, (snap) => {
    callback(
      snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomInternalCall))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 20)
    );
  });
}

export async function startInternalCall(input: {
  callerId: string;
  receiverId: string;
  callerName: string;
  receiverName: string;
}): Promise<string> {
  const settings = await getInternalSettings();
  if (!settings.internalCallsEnabled) throw new Error('CALLS_INTERNAL_DISABLED');
  if (input.callerId === input.receiverId) throw new Error('CALL_SELF_NOT_ALLOWED');

  const receiverSnap = await getDoc(doc(db, 'telecom_users', input.receiverId));
  if (!receiverSnap.exists() || receiverSnap.data().status !== 'approved') {
    throw new Error('CALL_RECEIVER_NOT_AVAILABLE');
  }

  const now = serverTimestamp();
  const callRef = await addDoc(collection(db, 'telecom_internal_calls'), {
    callerId: input.callerId,
    receiverId: input.receiverId,
    participants: [input.callerId, input.receiverId],
    callerName: input.callerName,
    receiverName: input.receiverName,
    status: 'ringing',
    startedAt: now,
    answeredAt: null,
    endedAt: null,
    durationSeconds: 0,
    createdAt: now,
    updatedAt: now,
  });

  await setDoc(doc(db, 'telecom_call_signals', callRef.id), {
    callId: callRef.id,
    callerId: input.callerId,
    receiverId: input.receiverId,
    callerOffer: null,
    receiverAnswer: null,
    callerCandidates: [],
    receiverCandidates: [],
    stunServers: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'],
    turnConfigured: Boolean(process.env.NEXT_PUBLIC_TURN_URL),
    sessionReady: false,
    createdAt: now,
    updatedAt: now,
  });

  await touchUserPresence(input.callerId, 'in_call');
  return callRef.id;
}

export async function acceptInternalCall(call: TelecomInternalCall, userId: string): Promise<void> {
  if (call.receiverId !== userId) throw new Error('CALL_ACCEPT_FORBIDDEN');
  await updateDoc(doc(db, 'telecom_internal_calls', call.id), {
    status: 'accepted',
    answeredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'telecom_call_signals', call.id),
    { sessionReady: true, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await touchUserPresence(userId, 'in_call');
}

export async function declineInternalCall(call: TelecomInternalCall, userId: string): Promise<void> {
  if (call.receiverId !== userId) throw new Error('CALL_DECLINE_FORBIDDEN');
  await updateDoc(doc(db, 'telecom_internal_calls', call.id), {
    status: 'declined',
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchUserPresence(userId, 'online');
}

export async function endInternalCall(call: TelecomInternalCall, userId: string): Promise<void> {
  if (![call.callerId, call.receiverId].includes(userId)) throw new Error('CALL_END_FORBIDDEN');
  const answeredAtMs = call.answeredAt?.seconds ? call.answeredAt.seconds * 1000 : Date.now();
  const durationSeconds = Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000));
  await updateDoc(doc(db, 'telecom_internal_calls', call.id), {
    status: call.status === 'accepted' ? 'completed' : 'missed',
    endedAt: serverTimestamp(),
    durationSeconds,
    updatedAt: serverTimestamp(),
  });
  await touchUserPresence(userId, 'online');
}

export async function markInternalCallMissed(call: TelecomInternalCall): Promise<void> {
  if (call.status !== 'ringing') return;
  await updateDoc(doc(db, 'telecom_internal_calls', call.id), {
    status: 'missed',
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
