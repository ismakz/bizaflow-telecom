import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp as FirestoreTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/app/lib/firebase';
import type { UserRole, UserStatus } from '@/app/lib/types';

export type PresenceStatus = 'online' | 'offline' | 'busy' | 'in_call';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type TelecomMessageType = 'text' | 'image' | 'document' | 'audio';
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
  type?: 'direct' | 'group';
  groupId?: string | null;
  title?: string;
  photoUrl?: string | null;
  participantIds: string[];
  participantNumbers?: string[];
  participants?: string[];
  participantsMeta?: Record<string, { uid: string; telecomNumber: string }>;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  unreadCountByUser: Record<string, number>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomMessage {
  id: string;
  conversationId: string;
  groupId?: string | null;
  senderId: string;
  receiverId: string;
  senderUserId?: string;
  targetUserId?: string;
  from?: string;
  to?: string;
  participantIds?: string[];
  participantNumbers?: string[];
  body: string;
  type?: TelecomMessageType;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  replyToMessageId?: string | null;
  reactionsByUser?: Record<string, string>;
  status: MessageStatus;
  statusByUser?: Record<string, MessageStatus>;
  deliveredAt?: Timestamp | null;
  readAt?: Timestamp | null;
  editedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomGroup {
  id: string;
  name: string;
  photoUrl?: string | null;
  memberIds: string[];
  adminIds: string[];
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TelecomStatus {
  id: string;
  userId: string;
  userName: string;
  userPhotoUrl?: string | null;
  type: 'text' | 'image';
  text?: string;
  mediaUrl?: string | null;
  background?: string | null;
  viewers: string[];
  expiresAt: Timestamp | null;
  createdAt: Timestamp | null;
}

export function subscribeDirectConversationMessages(input: {
  currentUserUid: string;
  currentUserTelecomNumber?: string;
  peerUid?: string;
  peerTelecomNumber?: string;
  conversationId?: string;
  limitCount?: number;
  callback: (messages: TelecomMessage[]) => void;
  onError?: (error: Error, queryMeta: Record<string, unknown>) => void;
}): Unsubscribe {
  const limitCount = input.limitCount || 40;
  const unsubs: Unsubscribe[] = [];
  const buckets: TelecomMessage[][] = [];

  const emit = () => {
    const merged = new Map<string, TelecomMessage>();
    buckets.flat().forEach((m) => merged.set(m.id, m));
    input.callback(
      [...merged.values()].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    );
  };

  const addQuery = (idx: number, queryMeta: Record<string, unknown>, q: ReturnType<typeof query>) => {
    buckets[idx] = [];
    const unsub = onSnapshot(
      q,
      (snap) => {
        buckets[idx] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          return { id: docSnap.id, ...data } as TelecomMessage;
        });
        emit();
      },
      (error) => {
        input.onError?.(error, queryMeta);
      }
    );
    unsubs.push(unsub);
  };

  let idx = 0;
  if (input.peerUid) {
    addQuery(
      idx++,
      { where: [{ senderId: input.currentUserUid }, { receiverId: input.peerUid }], orderBy: 'createdAt desc', limit: limitCount },
      query(
        collection(db, 'telecom_messages'),
        where('senderId', '==', input.currentUserUid),
        where('receiverId', '==', input.peerUid),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
    addQuery(
      idx++,
      { where: [{ senderId: input.peerUid }, { receiverId: input.currentUserUid }], orderBy: 'createdAt desc', limit: limitCount },
      query(
        collection(db, 'telecom_messages'),
        where('senderId', '==', input.peerUid),
        where('receiverId', '==', input.currentUserUid),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
  }

  if (input.currentUserTelecomNumber && input.peerTelecomNumber) {
    addQuery(
      idx++,
      { where: [{ from: input.currentUserTelecomNumber }, { to: input.peerTelecomNumber }], orderBy: 'createdAt desc', limit: limitCount },
      query(
        collection(db, 'telecom_messages'),
        where('from', '==', input.currentUserTelecomNumber),
        where('to', '==', input.peerTelecomNumber),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
    addQuery(
      idx++,
      { where: [{ from: input.peerTelecomNumber }, { to: input.currentUserTelecomNumber }], orderBy: 'createdAt desc', limit: limitCount },
      query(
        collection(db, 'telecom_messages'),
        where('from', '==', input.peerTelecomNumber),
        where('to', '==', input.currentUserTelecomNumber),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
  }

  if (input.conversationId) {
    addQuery(
      idx++,
      {
        where: [
          { conversationId: input.conversationId },
          { participantIdsArrayContains: input.currentUserUid },
        ],
        orderBy: 'createdAt desc',
        limit: limitCount,
      },
      query(
        collection(db, 'telecom_messages'),
        where('conversationId', '==', input.conversationId),
        where('participantIds', 'array-contains', input.currentUserUid),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      )
    );
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
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
  callback: (conversations: TelecomConversation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const byParticipantIdsQuery = query(
    collection(db, 'telecom_conversations'),
    where('participantIds', 'array-contains', userId)
  );
  const byParticipantsQuery = query(
    collection(db, 'telecom_conversations'),
    where('participants', 'array-contains', userId)
  );

  let byParticipantIds: TelecomConversation[] = [];
  let byParticipants: TelecomConversation[] = [];

  const emit = () => {
    const merged = new Map<string, TelecomConversation>();
    [...byParticipantIds, ...byParticipants].forEach((conversation) => {
      merged.set(conversation.id, conversation);
    });
    callback(
      [...merged.values()].sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0))
    );
  };

  const unsubParticipantIds = onSnapshot(
    byParticipantIdsQuery,
    (snap) => {
      byParticipantIds = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomConversation));
      emit();
    },
    (error) => onError?.(error)
  );

  const unsubParticipants = onSnapshot(
    byParticipantsQuery,
    (snap) => {
      byParticipants = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomConversation));
      emit();
    },
    (error) => onError?.(error)
  );

  return () => {
    unsubParticipantIds();
    unsubParticipants();
  };
}

export function subscribeConversationMessages(
  conversationId: string,
  callback: (messages: TelecomMessage[]) => void,
  onError?: (error: Error) => void,
  messageLimit = 40
): Unsubscribe {
  const messagesQuery = query(
    collection(db, 'telecom_messages'),
    where('conversationId', '==', conversationId),
    orderBy('createdAt', 'desc'),
    limit(messageLimit)
  );
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
  type?: TelecomMessageType;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  replyToMessageId?: string | null;
}): Promise<string> {
  const settings = await getInternalSettings();
  if (!settings.internalMessagesEnabled) throw new Error('MESSAGES_INTERNAL_DISABLED');
  if (!input.senderId || !input.receiverId) throw new Error('MESSAGE_PARTICIPANTS_REQUIRED');
  if (input.senderId === input.receiverId) throw new Error('MESSAGE_SELF_NOT_ALLOWED');

  const body = input.body.trim();
  const isText = (input.type || 'text') === 'text';
  if (isText && !body) throw new Error('MESSAGE_BODY_REQUIRED');
  if (!isText && !input.mediaUrl) throw new Error('MESSAGE_MEDIA_REQUIRED');
  if (body.length > 2000) throw new Error('MESSAGE_BODY_TOO_LONG');

  const conversationId = conversationIdFor(input.senderId, input.receiverId);
  const conversationRef = doc(db, 'telecom_conversations', conversationId);
  const now = serverTimestamp();

  await setDoc(
    conversationRef,
    {
      participantIds: [input.senderId, input.receiverId].sort(),
      participants: [input.senderId, input.receiverId].sort(),
      participantNumbers: [],
      participantsMeta: {},
      lastMessage: body || `[${input.type || 'text'}]`,
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
    senderUserId: input.senderId,
    targetUserId: input.receiverId,
    body,
    from: null,
    to: null,
    participantIds: [input.senderId, input.receiverId].sort(),
    participantNumbers: [],
    type: input.type || 'text',
    mediaUrl: input.mediaUrl || null,
    mediaName: input.mediaName || null,
    mediaMimeType: input.mediaMimeType || null,
    mediaSize: input.mediaSize || null,
    replyToMessageId: input.replyToMessageId || null,
    reactionsByUser: {},
    status: 'sent',
    createdAt: now,
    updatedAt: now,
  });

  return messageRef.id;
}

export async function createInternalGroup(input: {
  name: string;
  photoUrl?: string | null;
  memberIds: string[];
  createdBy: string;
}): Promise<{ groupId: string; conversationId: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('GROUP_NAME_REQUIRED');
  const members = Array.from(new Set([...input.memberIds, input.createdBy])).filter(Boolean);
  if (members.length < 2) throw new Error('GROUP_MEMBERS_REQUIRED');
  const now = serverTimestamp();
  const groupRef = await addDoc(collection(db, 'telecom_groups'), {
    name,
    photoUrl: input.photoUrl || null,
    memberIds: members,
    adminIds: [input.createdBy],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  const conversationId = groupRef.id;
  await setDoc(doc(db, 'telecom_conversations', conversationId), {
    type: 'group',
    groupId: groupRef.id,
    participantIds: members,
    participants: members,
    title: name,
    photoUrl: input.photoUrl || null,
    lastMessage: 'Vous avez créé le groupe',
    lastMessageAt: now,
    unreadCountByUser: members.reduce((acc, uid) => {
      acc[uid] = uid === input.createdBy ? 0 : 1;
      return acc;
    }, {} as Record<string, number>),
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  await addDoc(collection(db, 'telecom_messages'), {
    conversationId,
    groupId: groupRef.id,
    senderId: input.createdBy,
    receiverId: input.createdBy,
    senderUserId: input.createdBy,
    targetUserId: null,
    body: 'Vous avez créé le groupe',
    type: 'system',
    participantIds: members,
    participantNumbers: [],
    status: 'sent',
    statusByUser: { [input.createdBy]: 'read' },
    createdAt: now,
    updatedAt: now,
  });
  return { groupId: groupRef.id, conversationId };
}

export async function sendGroupMessage(input: {
  conversationId: string;
  groupId: string;
  senderId: string;
  body: string;
}): Promise<string> {
  const body = input.body.trim();
  if (!body) throw new Error('MESSAGE_BODY_REQUIRED');
  const groupSnap = await getDoc(doc(db, 'telecom_groups', input.groupId));
  if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
  const group = groupSnap.data() as TelecomGroup;
  if (!group.memberIds.includes(input.senderId)) throw new Error('GROUP_WRITE_FORBIDDEN');
  const now = serverTimestamp();
  const statusByUser = group.memberIds.reduce((acc, uid) => {
    acc[uid] = uid === input.senderId ? 'read' : 'delivered';
    return acc;
  }, {} as Record<string, MessageStatus>);
  const messageRef = await addDoc(collection(db, 'telecom_messages'), {
    conversationId: input.conversationId,
    groupId: input.groupId,
    senderId: input.senderId,
    receiverId: input.senderId,
    senderUserId: input.senderId,
    targetUserId: null,
    body,
    type: 'text',
    participantIds: group.memberIds,
    participantNumbers: [],
    status: 'sent',
    statusByUser,
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(doc(db, 'telecom_conversations', input.conversationId), {
    type: 'group',
    groupId: input.groupId,
    participantIds: group.memberIds,
    participants: group.memberIds,
    lastMessage: body,
    lastMessageAt: now,
    unreadCountByUser: group.memberIds.reduce((acc, uid) => {
      acc[`unreadCountByUser.${uid}`] = uid === input.senderId ? 0 : increment(1);
      return acc;
    }, {} as Record<string, unknown>),
    updatedAt: now,
  }, { merge: true });
  return messageRef.id;
}

export async function updateGroupMembers(input: {
  groupId: string;
  actorId: string;
  memberIds: string[];
}): Promise<void> {
  const groupRef = doc(db, 'telecom_groups', input.groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
  const group = groupSnap.data() as TelecomGroup;
  if (!group.adminIds.includes(input.actorId)) throw new Error('GROUP_ADMIN_REQUIRED');
  const nextMembers = Array.from(new Set(input.memberIds)).filter(Boolean);
  if (!nextMembers.includes(input.actorId)) throw new Error('GROUP_ADMIN_MUST_STAY');
  await setDoc(groupRef, { memberIds: nextMembers, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'telecom_conversations', input.groupId), {
    participantIds: nextMembers,
    participants: nextMembers,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  const joined = nextMembers.filter((uid) => !group.memberIds.includes(uid));
  const left = group.memberIds.filter((uid) => !nextMembers.includes(uid));
  for (const uid of joined) {
    await addDoc(collection(db, 'telecom_messages'), {
      conversationId: input.groupId,
      groupId: input.groupId,
      senderId: input.actorId,
      receiverId: input.actorId,
      senderUserId: input.actorId,
      targetUserId: null,
      body: `${uid} a rejoint le groupe`,
      type: 'system',
      participantIds: nextMembers,
      participantNumbers: [],
      status: 'sent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  for (const uid of left) {
    await addDoc(collection(db, 'telecom_messages'), {
      conversationId: input.groupId,
      groupId: input.groupId,
      senderId: input.actorId,
      receiverId: input.actorId,
      senderUserId: input.actorId,
      targetUserId: null,
      body: `${uid} a quitté le groupe`,
      type: 'system',
      participantIds: nextMembers,
      participantNumbers: [],
      status: 'sent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function renameGroup(input: {
  groupId: string;
  actorId: string;
  name: string;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('GROUP_NAME_REQUIRED');
  const groupRef = doc(db, 'telecom_groups', input.groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
  const group = groupSnap.data() as TelecomGroup;
  if (!group.adminIds.includes(input.actorId)) throw new Error('GROUP_ADMIN_REQUIRED');
  await setDoc(groupRef, { name, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'telecom_conversations', input.groupId), {
    title: name,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, 'telecom_messages'), {
    conversationId: input.groupId,
    groupId: input.groupId,
    senderId: input.actorId,
    receiverId: input.actorId,
    senderUserId: input.actorId,
    targetUserId: null,
    body: 'Le nom du groupe a été modifié',
    type: 'system',
    participantIds: group.memberIds,
    participantNumbers: [],
    status: 'sent',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const groupRef = doc(db, 'telecom_groups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) throw new Error('GROUP_NOT_FOUND');
  const group = groupSnap.data() as TelecomGroup;
  if (!group.memberIds.includes(userId)) return;
  const nextMembers = group.memberIds.filter((uid) => uid !== userId);
  const nextAdmins = group.adminIds.filter((uid) => uid !== userId);
  if (nextMembers.length === 0) {
    await deleteDoc(groupRef);
    await deleteDoc(doc(db, 'telecom_conversations', groupId));
    return;
  }
  const finalAdmins = nextAdmins.length ? nextAdmins : [nextMembers[0]];
  await setDoc(groupRef, {
    memberIds: nextMembers,
    adminIds: finalAdmins,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, 'telecom_conversations', groupId), {
    participantIds: nextMembers,
    participants: nextMembers,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(db, 'telecom_messages'), {
    conversationId: groupId,
    groupId,
    senderId: userId,
    receiverId: userId,
    senderUserId: userId,
    targetUserId: null,
    body: `${userId} a quitté le groupe`,
    type: 'system',
    participantIds: nextMembers,
    participantNumbers: [],
    status: 'sent',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGroup(groupId: string, actorId: string): Promise<void> {
  const groupRef = doc(db, 'telecom_groups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;
  const group = groupSnap.data() as TelecomGroup;
  if (!group.adminIds.includes(actorId)) throw new Error('GROUP_ADMIN_REQUIRED');
  await deleteDoc(groupRef);
  await deleteDoc(doc(db, 'telecom_conversations', groupId));
}

export async function createTextStatus(input: {
  userId: string;
  userName: string;
  userPhotoUrl?: string | null;
  text: string;
  background?: string | null;
}): Promise<string> {
  const text = input.text.trim();
  if (!text) throw new Error('STATUS_TEXT_REQUIRED');
  const now = FirestoreTimestamp.now();
  const expires = FirestoreTimestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000);
  const statusRef = await addDoc(collection(db, 'telecom_statuses'), {
    userId: input.userId,
    userName: input.userName,
    userPhotoUrl: input.userPhotoUrl || null,
    type: 'text',
    text,
    mediaUrl: null,
    background: input.background || '#0f172a',
    viewers: [],
    expiresAt: expires,
    createdAt: serverTimestamp(),
  });
  return statusRef.id;
}

export function subscribeRecentStatuses(
  callback: (statuses: TelecomStatus[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const statusesQuery = query(
    collection(db, 'telecom_statuses'),
    where('expiresAt', '>', FirestoreTimestamp.now()),
    orderBy('expiresAt', 'asc'),
    limit(80)
  );
  return onSnapshot(
    statusesQuery,
    (snap) => {
      callback(
        snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomStatus))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    },
    (error) => onError?.(error)
  );
}

export async function markStatusViewed(statusId: string, viewerId: string): Promise<void> {
  await setDoc(
    doc(db, 'telecom_statuses', statusId),
    { viewers: arrayUnion(viewerId) },
    { merge: true }
  );
}

export async function deleteOwnStatus(statusId: string, userId: string): Promise<void> {
  const statusRef = doc(db, 'telecom_statuses', statusId);
  const snap = await getDoc(statusRef);
  if (!snap.exists()) return;
  const data = snap.data() as TelecomStatus;
  if (data.userId !== userId) throw new Error('STATUS_DELETE_FORBIDDEN');
  await deleteDoc(statusRef);
}

export async function enrichConversationParticipantsMeta(input: {
  currentUserUid: string;
  currentUserTelecomNumber?: string;
  peerUid?: string;
  peerTelecomNumber?: string;
}): Promise<void> {
  if (!input.currentUserUid || !input.peerUid) return;
  const conversationId = conversationIdFor(input.currentUserUid, input.peerUid);
  await setDoc(
    doc(db, 'telecom_conversations', conversationId),
    {
      participantIds: [input.currentUserUid, input.peerUid].sort(),
      participants: [input.currentUserUid, input.peerUid].sort(),
      participantNumbers: [input.currentUserTelecomNumber || '', input.peerTelecomNumber || ''].filter(Boolean).sort(),
      participantsMeta: {
        [input.currentUserUid]: {
          uid: input.currentUserUid,
          telecomNumber: input.currentUserTelecomNumber || '',
        },
        [input.peerUid]: {
          uid: input.peerUid,
          telecomNumber: input.peerTelecomNumber || '',
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function backfillMessageParticipantMeta(input: {
  conversationId: string;
  currentUserUid: string;
  currentUserTelecomNumber?: string;
  peerUid?: string;
  peerTelecomNumber?: string;
}): Promise<void> {
  if (!input.conversationId || !input.currentUserUid || !input.peerUid) return;
  const snap = await getDocs(
    query(
      collection(db, 'telecom_messages'),
      where('conversationId', '==', input.conversationId),
      limit(30)
    )
  );
  await Promise.all(
    snap.docs.map(async (docSnap) => {
      const data = docSnap.data() as TelecomMessage;
      const needsParticipantIds = !Array.isArray(data.participantIds) || data.participantIds.length === 0;
      const needsParticipantNumbers = !Array.isArray(data.participantNumbers);
      if (!needsParticipantIds && !needsParticipantNumbers) return;
      await updateDoc(doc(db, 'telecom_messages', docSnap.id), {
        participantIds: [input.currentUserUid, input.peerUid as string].sort(),
        participantNumbers: [input.currentUserTelecomNumber || '', input.peerTelecomNumber || ''].filter(Boolean).sort(),
        updatedAt: serverTimestamp(),
      });
    })
  );
}

export async function setMessageReaction(input: {
  messageId: string;
  userId: string;
  emoji: string | null;
}): Promise<void> {
  const messageRef = doc(db, 'telecom_messages', input.messageId);
  const snap = await getDoc(messageRef);
  if (!snap.exists()) throw new Error('MESSAGE_NOT_FOUND');
  const data = snap.data() as TelecomMessage;
  const reactions = { ...(data.reactionsByUser || {}) };
  if (!input.emoji) {
    delete reactions[input.userId];
  } else {
    reactions[input.userId] = input.emoji;
  }
  await updateDoc(messageRef, {
    reactionsByUser: reactions,
    updatedAt: serverTimestamp(),
  });
}

export async function editOwnMessage(input: {
  messageId: string;
  userId: string;
  body: string;
}): Promise<void> {
  const messageRef = doc(db, 'telecom_messages', input.messageId);
  const snap = await getDoc(messageRef);
  if (!snap.exists()) throw new Error('MESSAGE_NOT_FOUND');
  const data = snap.data() as TelecomMessage;
  if (data.senderId !== input.userId) throw new Error('FORBIDDEN');
  const body = input.body.trim();
  if (!body) throw new Error('MESSAGE_BODY_REQUIRED');
  if (body.length > 2000) throw new Error('MESSAGE_BODY_TOO_LONG');
  await updateDoc(messageRef, {
    body,
    editedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markMessageAsRead(conversationId: string, userId: string): Promise<void> {
  if (!conversationId || !userId) return;
  const snap = await getDocs(
    query(
      collection(db, 'telecom_messages'),
      where('conversationId', '==', conversationId),
      where('receiverId', '==', userId),
      where('status', 'in', ['sent', 'delivered'])
    )
  );
  await Promise.all(
    snap.docs
      .filter((messageDoc) => messageDoc.data().receiverId === userId && messageDoc.data().status !== 'read')
      .map((messageDoc) => updateDoc(doc(db, 'telecom_messages', messageDoc.id), {
        status: 'read',
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))
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

export async function markConversationMessagesDelivered(conversationId: string, userId: string): Promise<void> {
  if (!conversationId || !userId) return;
  const snap = await getDocs(
    query(
      collection(db, 'telecom_messages'),
      where('conversationId', '==', conversationId),
      where('receiverId', '==', userId),
      where('status', '==', 'sent')
    )
  );
  await Promise.all(
    snap.docs
      .filter((messageDoc) => messageDoc.data().receiverId === userId && messageDoc.data().status === 'sent')
      .map((messageDoc) => updateDoc(doc(db, 'telecom_messages', messageDoc.id), {
        status: 'delivered',
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))
  );
}

export async function setTypingState(
  userId: string,
  conversationId: string,
  isTyping: boolean
): Promise<void> {
  if (!userId) return;
  await setDoc(
    doc(db, 'telecom_presence', userId),
    {
      userId,
      typingInConversationId: isTyping ? conversationId : null,
      typingUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeTypingState(
  peerUserId: string,
  conversationId: string,
  callback: (isTyping: boolean) => void
): Unsubscribe {
  return onSnapshot(doc(db, 'telecom_presence', peerUserId), (snap) => {
    if (!snap.exists()) {
      callback(false);
      return;
    }
    const data = snap.data() as {
      typingInConversationId?: string | null;
      typingUpdatedAt?: FirestoreTimestamp | null;
    };
    const sameConversation = data.typingInConversationId === conversationId;
    const recentTyping = data.typingUpdatedAt
      ? Date.now() - data.typingUpdatedAt.toMillis() < 9000
      : false;
    callback(Boolean(sameConversation && recentTyping));
  });
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
