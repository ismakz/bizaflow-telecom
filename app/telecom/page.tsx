'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { Timestamp, collection, onSnapshot, query, where } from 'firebase/firestore';
import { useApp } from '@/app/components/AppProvider';
import {
  backfillMessageParticipantMeta,
  createInternalGroup,
  createTextStatus,
  deleteGroup,
  deleteOwnStatus,
  leaveGroup,
  conversationIdFor,
  enrichConversationParticipantsMeta,
  markConversationMessagesDelivered,
  markMessageAsRead,
  markStatusViewed,
  renameGroup,
  sendInternalMessage,
  sendGroupMessage,
  setTypingState,
  subscribeConversationMessages,
  subscribeDirectConversationMessages,
  subscribeIncomingMessages,
  subscribeInternalUsers,
  subscribeRecentStatuses,
  subscribeTypingState,
  subscribeUserConversations,
  touchUserPresence,
  type InternalTelecomUser,
  type TelecomConversation,
  type TelecomGroup,
  type TelecomMessage,
  type TelecomStatus,
  updateGroupMembers,
} from '@/app/lib/internalTelecom';
import { auth, db } from '@/app/lib/firebase';
import { onForegroundPushMessage, registerPushToken } from '@/app/lib/pushNotifications';
import { ConversationList } from '@/app/telecom/components/ConversationList';
import { ChatHeader } from '@/app/telecom/components/ChatHeader';
import { MessageList } from '@/app/telecom/components/MessageList';
import { MessageComposer } from '@/app/telecom/components/MessageComposer';

const cardStyle = {
  background: 'rgba(255,255,255,0.035)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
} satisfies React.CSSProperties;

export default function SmsPage() {
  const { user, showToast } = useApp();
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<InternalTelecomUser[]>([]);
  const [conversations, setConversations] = useState<TelecomConversation[]>([]);
  const [groups, setGroups] = useState<TelecomGroup[]>([]);
  const [statuses, setStatuses] = useState<TelecomStatus[]>([]);
  const [messages, setMessages] = useState<TelecomMessage[]>([]);
  const [activeView, setActiveView] = useState<'sms' | 'statuses'>('sms');
  const [selectedRowId, setSelectedRowId] = useState('');
  const [selectedRowType, setSelectedRowType] = useState<'direct' | 'group'>('direct');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupProfile, setShowGroupProfile] = useState(false);
  const [groupRenameValue, setGroupRenameValue] = useState('');
  const [groupMemberDraft, setGroupMemberDraft] = useState<string[]>([]);
  const [statusText, setStatusText] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState('');
  const [search, setSearch] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');
  const [blockingSmsError, setBlockingSmsError] = useState('');
  const [sending, setSending] = useState(false);
  const [messageLimit, setMessageLimit] = useState(40);
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationMobile, setShowConversationMobile] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const incomingMessagesInitializedRef = useRef(false);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const activeConversationUnsubRef = useRef<(() => void) | null>(null);
  const conversationErrorTimerRef = useRef<number | null>(null);
  const latestMessagesCountRef = useRef(0);
  const hasValidConversationRef = useRef(false);
  const optimisticMessagesRef = useRef<Map<string, TelecomMessage>>(new Map());
  const optimisticCounterRef = useRef(0);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.uid === selectedUserId) || null,
    [contacts, selectedUserId]
  );
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  const selectedConversationId = useMemo(() => {
    if (!user) return '';
    if (selectedRowType === 'group' && selectedGroupId) return selectedGroupId;
    if (selectedUserId) return conversationIdFor(user.uid, selectedUserId);
    return '';
  }, [selectedGroupId, selectedRowType, selectedUserId, user]);
  const showListPanel = !isMobile || !showConversationMobile;
  const showChatPanel = !isMobile || showConversationMobile;

  const mergeServerAndOptimisticMessages = useCallback((serverItems: TelecomMessage[]) => {
    const optimistic = optimisticMessagesRef.current;
    serverItems.forEach((item) => {
      if (optimistic.has(item.id)) optimistic.delete(item.id);
    });
    const merged = new Map<string, TelecomMessage>();
    serverItems.forEach((item) => merged.set(item.id, item));
    optimistic.forEach((item) => {
      if (item.conversationId === selectedConversationId) {
        merged.set(item.id, item);
      }
    });
    return [...merged.values()].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [selectedConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncMobile = () => setIsMobile(window.matchMedia('(max-width: 900px)').matches);
    syncMobile();
    window.addEventListener('resize', syncMobile);
    return () => window.removeEventListener('resize', syncMobile);
  }, []);

  useEffect(() => {
    const userFromUrl = searchParams.get('user');
    if (userFromUrl) {
      setSelectedUserId(userFromUrl);
      if (isMobile) setShowConversationMobile(true);
    }
  }, [isMobile, searchParams]);

  useEffect(() => {
    if (!contacts.length || !selectedUserId) return;
    const normalized = selectedUserId.trim().toLowerCase();
    const found = contacts.find((contact) =>
      [contact.uid, String((contact as { id?: string }).id || ''), String((contact as { userId?: string }).userId || ''), contact.telecomNumber]
        .map((value) => value.toLowerCase())
        .includes(normalized)
    );
    if (found && found.uid !== selectedUserId) {
      setSelectedUserId(found.uid);
    }
  }, [contacts, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    setSelectedRowType('direct');
    setSelectedGroupId('');
    setSelectedRowId(`direct:${selectedUserId}`);
  }, [selectedUserId]);

  useEffect(() => {
    if (!user) return;
    void touchUserPresence(user.uid, 'online');
    return () => {
      void touchUserPresence(user.uid, 'offline');
    };
  }, [user]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('telecom_alerts_enabled') === 'true';
    const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
    const enabled = stored && granted;
    setShowActivationModal(!enabled);
    setNotificationStatus(
      enabled
        ? 'Notifications SMS actives'
        : 'Activez les notifications pour recevoir vos nouveaux messages.'
    );
  }, [user]);

  const playMessageSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = audioContextRef.current;
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
          // ignore stop errors
        }
      }, 140);
    } catch {
      // best-effort audio feedback
    }
  }, []);

  const enableNotifications = useCallback(async () => {
    if (!user || typeof window === 'undefined') return;
    setActivationBusy(true);
    setActivationError('');
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !audioContextRef.current) audioContextRef.current = new AudioCtx();
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume().catch(() => undefined);
      }
      const result = await registerPushToken(user.uid);
      if (result.ok) {
        playMessageSound();
        setNotificationStatus('Notifications et sonnerie activées');
        showToast({ message: 'Notifications et sonnerie activées', variant: 'success' });
        setShowActivationModal(false);
        window.localStorage.setItem('telecom_alerts_enabled', 'true');
      } else {
        const denied = result.reason === 'NOTIFICATION_PERMISSION_DENIED' || result.permission === 'denied';
        const msg = denied
          ? 'Votre navigateur bloque les notifications. Autorisez-les depuis le cadenas près de l’adresse.'
          : 'Configuration push incomplète. Contactez l’administrateur.';
        setNotificationStatus(msg);
        setActivationError(msg);
      }
    } finally {
      setActivationBusy(false);
    }
  }, [playMessageSound, showToast, user]);

  useEffect(() => {
    let unsubscribe = () => {};
    void onForegroundPushMessage((payload) => {
      if (payload.type !== 'internal_message') return;
      const dedupeKey = buildMessageDedupeKey(payload.messageId, payload.senderId, payload.body);
      if (notifiedMessageIdsRef.current.has(dedupeKey)) return;
      notifiedMessageIdsRef.current.add(dedupeKey);
      if (payload.senderId) {
        setSelectedUserId(payload.senderId);
        if (isMobile) setShowConversationMobile(true);
      }
      showToast({ message: payload.body || 'Nouveau message Bizaflow', variant: 'info' });
      playMessageSound();
    }).then((unsub) => {
      unsubscribe = unsub;
    });
    return () => unsubscribe();
  }, [isMobile, playMessageSound, showToast]);

  useEffect(() => {
    hasValidConversationRef.current = Boolean(
      selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId)
    );
    if (hasValidConversationRef.current || latestMessagesCountRef.current > 0) {
      setBlockingSmsError('');
      if (conversationErrorTimerRef.current) {
        window.clearTimeout(conversationErrorTimerRef.current);
        conversationErrorTimerRef.current = null;
      }
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!user || user.status !== 'approved') return;
    incomingMessagesInitializedRef.current = false;
    const unsubIncoming = subscribeIncomingMessages(
      user.uid,
      (items) => {
        if (!incomingMessagesInitializedRef.current) {
          items.forEach((item) => notifiedMessageIdsRef.current.add(buildMessageDedupeKey(item.id, item.senderId, item.body)));
          incomingMessagesInitializedRef.current = true;
          return;
        }
        const fresh = items
          .filter((item) => !notifiedMessageIdsRef.current.has(buildMessageDedupeKey(item.id, item.senderId, item.body)))
          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        fresh.forEach((message) => {
          notifiedMessageIdsRef.current.add(buildMessageDedupeKey(message.id, message.senderId, message.body));
          const sender = contacts.find((contact) => contact.uid === message.senderId);
          const senderName = sender?.name || 'Contact Bizaflow';
          const preview = message.body.length > 90 ? `${message.body.slice(0, 87)}...` : message.body;
          showToast({ message: `${senderName}: ${preview}`, variant: 'info' });
          playMessageSound();
        });
      },
      (error) => {
        console.warn('[SMS LISTENER WARN]', {
          collection: 'telecom_messages',
          whereOrderBy: { where: [{ receiverId: user.uid }], orderBy: 'createdAt desc' },
          conversationId: null,
          uid: user.uid,
          telecomNumber: user.telecomNumber,
          selectedContactUid: selectedContact?.uid || null,
          selectedContactTelecomNumber: selectedContact?.telecomNumber || null,
          errorCode: error instanceof FirebaseError ? error.code : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          error,
        });
      }
    );
    return () => unsubIncoming();
  }, [contacts, playMessageSound, selectedContact?.telecomNumber, selectedContact?.uid, showToast, user]);

  useEffect(() => {
    if (!user) return;
    const unsubUsers = subscribeInternalUsers(
      user.uid,
      (items) => {
        setContacts(items);
        setSelectedUserId((current) => current || items[0]?.uid || '');
      }
    );
    const unsubConversations = subscribeUserConversations(
      user.uid,
      setConversations,
      (error) => {
        console.warn('[SMS LISTENER WARN]', {
          collection: 'telecom_conversations',
          query: [
            { participantIdsArrayContains: user.uid },
            { participantsArrayContains: user.uid },
          ],
          uid: user.uid,
          telecomNumber: user.telecomNumber,
          error,
        });
      }
    );
    return () => {
      unsubUsers();
      unsubConversations();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const groupsQuery = query(collection(db, 'telecom_groups'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(groupsQuery, (snap) => {
      setGroups(
        snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TelecomGroup))
      );
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeRecentStatuses(
      (items) => {
        setStatuses(items.filter((item) => (item.expiresAt?.seconds || 0) * 1000 > Date.now()));
      },
      (error) => {
        console.warn('[SMS STATUS WARN]', error);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!selectedConversationId || !user) {
      if (activeConversationUnsubRef.current) {
        activeConversationUnsubRef.current();
        activeConversationUnsubRef.current = null;
      }
      if (conversationErrorTimerRef.current) {
        window.clearTimeout(conversationErrorTimerRef.current);
        conversationErrorTimerRef.current = null;
      }
      latestMessagesCountRef.current = 0;
      setMessages([]);
      return;
    }
    if (activeConversationUnsubRef.current) {
      activeConversationUnsubRef.current();
      activeConversationUnsubRef.current = null;
    }
    const callback = (items: TelecomMessage[]) => {
        const mergedItems = mergeServerAndOptimisticMessages(items);
        latestMessagesCountRef.current = mergedItems.length;
        if (mergedItems.length > 0 || hasValidConversationRef.current) {
          setBlockingSmsError('');
          if (conversationErrorTimerRef.current) {
            window.clearTimeout(conversationErrorTimerRef.current);
            conversationErrorTimerRef.current = null;
          }
        }
        setMessages(mergedItems);
        void enrichConversationParticipantsMeta({
          currentUserUid: user.uid,
          currentUserTelecomNumber: user.telecomNumber,
          peerUid: selectedContact?.uid,
          peerTelecomNumber: selectedContact?.telecomNumber,
        }).catch(() => undefined);
        void backfillMessageParticipantMeta({
          conversationId: selectedConversationId,
          currentUserUid: user.uid,
          currentUserTelecomNumber: user.telecomNumber,
          peerUid: selectedContact?.uid,
          peerTelecomNumber: selectedContact?.telecomNumber,
        }).catch(() => undefined);
        void markConversationMessagesDelivered(selectedConversationId, user.uid).catch(() => undefined);
        void markMessageAsRead(selectedConversationId, user.uid).catch(() => undefined);
      };
    const onError = (error: Error, queryMeta: Record<string, unknown>) => {
        console.warn('[SMS LISTENER WARN]', {
          collection: 'telecom_messages',
          whereOrderBy: queryMeta,
          conversationId: selectedConversationId,
          uid: user.uid,
          telecomNumber: user.telecomNumber,
          selectedContactUid: selectedContact?.uid || null,
          selectedContactTelecomNumber: selectedContact?.telecomNumber || null,
          errorCode: error instanceof FirebaseError ? error.code : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          error,
        });
        if (conversationErrorTimerRef.current) {
          window.clearTimeout(conversationErrorTimerRef.current);
        }
        conversationErrorTimerRef.current = window.setTimeout(() => {
          const noMessagesReadable = latestMessagesCountRef.current === 0;
          const noValidConversation = !hasValidConversationRef.current;
          if (noMessagesReadable && noValidConversation) {
            setBlockingSmsError('Lecture des messages impossible pour cette conversation.');
          }
        }, 1200);
      };
    const unsub = selectedRowType === 'group'
      ? subscribeConversationMessages(
        selectedConversationId,
        callback,
        (error) => onError(error, { where: [{ conversationId: selectedConversationId }], orderBy: 'createdAt desc' }),
        messageLimit
      )
      : subscribeDirectConversationMessages({
        currentUserUid: user.uid,
        currentUserTelecomNumber: user.telecomNumber,
        peerUid: selectedContact?.uid,
        peerTelecomNumber: selectedContact?.telecomNumber,
        conversationId: selectedConversationId,
        limitCount: messageLimit,
        callback,
        onError,
      });
    activeConversationUnsubRef.current = unsub;
    return () => {
      if (activeConversationUnsubRef.current) {
        activeConversationUnsubRef.current();
        activeConversationUnsubRef.current = null;
      }
      if (conversationErrorTimerRef.current) {
        window.clearTimeout(conversationErrorTimerRef.current);
        conversationErrorTimerRef.current = null;
      }
    };
  }, [mergeServerAndOptimisticMessages, messageLimit, selectedContact?.telecomNumber, selectedContact?.uid, selectedConversationId, selectedRowType, user]);

  useEffect(() => {
    if (selectedRowType === 'group' || !selectedContact || !selectedConversationId) {
      setIsPeerTyping(false);
      return;
    }
    return subscribeTypingState(selectedContact.uid, selectedConversationId, setIsPeerTyping);
  }, [selectedContact, selectedConversationId, selectedRowType]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selectedConversationId]);

  const sendMessage = useCallback(async () => {
    if (!user || sending) return;
    const isGroupConversation = selectedRowType === 'group' && Boolean(selectedGroupId);
    if (!isGroupConversation && !selectedContact) return;
    const outgoingBody = messageBody.trim();
    if (!outgoingBody) return;
    const tempId = `temp-${Date.now()}-${optimisticCounterRef.current++}`;
    const localTimestamp = buildLocalTimestamp();
    const optimisticMessage: TelecomMessage = {
      id: tempId,
      conversationId: selectedConversationId,
      groupId: isGroupConversation ? selectedGroupId : null,
      senderId: user.uid,
      receiverId: isGroupConversation ? user.uid : (selectedContact?.uid || user.uid),
      body: outgoingBody,
      status: 'sent',
      type: 'text',
      createdAt: localTimestamp,
      updatedAt: localTimestamp,
    };
    optimisticMessagesRef.current.set(tempId, optimisticMessage);
    setMessages((current) => {
      const merged = new Map(current.map((item) => [item.id, item] as const));
      merged.set(tempId, optimisticMessage);
      return [...merged.values()].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    });
    setMessageBody('');
    setSending(true);
    try {
      const messageId = isGroupConversation
        ? await sendGroupMessage({
          conversationId: selectedConversationId,
          groupId: selectedGroupId,
          senderId: user.uid,
          body: outgoingBody,
        })
        : await sendInternalMessage({
          senderId: user.uid,
          receiverId: selectedContact?.uid || '',
          body: outgoingBody,
          type: 'text',
        });
      const optimisticCurrent = optimisticMessagesRef.current.get(tempId);
      optimisticMessagesRef.current.delete(tempId);
      if (optimisticCurrent) {
        optimisticMessagesRef.current.set(messageId, { ...optimisticCurrent, id: messageId });
      }
      setMessages((current) =>
        current.map((item) => (item.id === tempId ? { ...item, id: messageId } : item))
      );
      if (!isGroupConversation) {
        void sendInternalMessagePush(messageId);
      }
      if (!isGroupConversation) {
        void setTypingState(user.uid, selectedConversationId, false);
      }
    } catch (error) {
      optimisticMessagesRef.current.delete(tempId);
      setMessages((current) => current.filter((item) => item.id !== tempId));
      setMessageBody(outgoingBody);
      const message = error instanceof Error ? error.message : 'Message impossible';
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        showToast({ message: 'Permission refusée: vous ne pouvez pas écrire ce message.', variant: 'error' });
      } else {
        showToast({ message: explainError(message), variant: 'error' });
      }
    } finally {
      setSending(false);
    }
  }, [messageBody, selectedContact, selectedConversationId, selectedGroupId, selectedRowType, sending, showToast, user]);

  const handleMessageChange = useCallback((value: string) => {
    setMessageBody(value);
    if (!user || !selectedConversationId || selectedRowType === 'group') return;
    void setTypingState(user.uid, selectedConversationId, true);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      void setTypingState(user.uid, selectedConversationId, false);
    }, 1400);
  }, [selectedConversationId, selectedRowType, user]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      if (user?.uid && selectedConversationId) {
        void setTypingState(user.uid, selectedConversationId, false);
      }
      if (activeConversationUnsubRef.current) {
        activeConversationUnsubRef.current();
        activeConversationUnsubRef.current = null;
      }
      if (conversationErrorTimerRef.current) {
        window.clearTimeout(conversationErrorTimerRef.current);
        conversationErrorTimerRef.current = null;
      }
    };
  }, [selectedConversationId, user?.uid]);

  const conversationRows = useMemo(() => {
    if (!user) return [];
    const directRows = contacts
      .map((contact) => {
        const conversationId = conversationIdFor(user.uid, contact.uid);
        const conversation = conversations.find((item) => item.id === conversationId);
        return {
          id: `direct:${contact.uid}`,
          kind: 'direct' as const,
          title: contact.name,
          subtitle: contact.telecomNumber,
          presence: contact.presenceStatus,
          roleLabel: contact.role,
          contactUid: contact.uid,
          conversation,
          unread: conversation?.unreadCountByUser?.[user.uid] || 0,
        };
      });
    const groupRows = conversations
      .filter((conversation) => conversation.type === 'group')
      .map((conversation) => ({
        id: `group:${conversation.groupId || conversation.id}`,
        kind: 'group' as const,
        title: conversation.title || 'Groupe Bizaflow',
        subtitle: `${conversation.participantIds?.length || 0} membres`,
        conversation,
        unread: conversation.unreadCountByUser?.[user.uid] || 0,
      }));
    return [...directRows, ...groupRows]
      .sort((a, b) => {
        const aTs = a.conversation?.lastMessageAt?.seconds || 0;
        const bTs = b.conversation?.lastMessageAt?.seconds || 0;
        if (aTs !== bTs) return bTs - aTs;
        return a.title.localeCompare(b.title);
      });
  }, [contacts, conversations, user]);

  useEffect(() => {
    if (!conversationRows.length) return;
    if (selectedRowId && conversationRows.some((row) => row.id === selectedRowId)) return;
    const first = conversationRows[0];
    setSelectedRowId(first.id);
    setSelectedRowType(first.kind);
    if (first.kind === 'group') {
      setSelectedGroupId(first.conversation?.groupId || first.conversation?.id || '');
      setSelectedUserId('');
    } else {
      setSelectedUserId(first.contactUid || '');
      setSelectedGroupId('');
    }
  }, [conversationRows, selectedRowId]);
  useEffect(() => {
    setMessageLimit(40);
  }, [selectedConversationId]);

  const selectedStatus = useMemo(
    () => statuses.find((status) => status.id === selectedStatusId) || null,
    [selectedStatusId, statuses]
  );

  const createGroup = useCallback(async () => {
    if (!user) return;
    try {
      const result = await createInternalGroup({
        name: newGroupName,
        memberIds: newGroupMemberIds,
        createdBy: user.uid,
      });
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupMemberIds([]);
      showToast({ message: 'Groupe créé', variant: 'success' });
      setSelectedRowType('group');
      setSelectedGroupId(result.groupId);
      setSelectedUserId('');
      setSelectedRowId(`group:${result.groupId}`);
    } catch (error) {
      showToast({ message: explainError(error instanceof Error ? error.message : 'Création groupe impossible'), variant: 'error' });
    }
  }, [newGroupMemberIds, newGroupName, showToast, user]);

  useEffect(() => {
    if (!showGroupProfile || !selectedGroup) return;
    setGroupMemberDraft(selectedGroup.memberIds || []);
  }, [selectedGroup, showGroupProfile]);

  const toggleGroupMember = useCallback((uid: string) => {
    setNewGroupMemberIds((current) => (
      current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
    ));
  }, []);

  const publishStatus = useCallback(async () => {
    if (!user || !statusText.trim()) return;
    try {
      await createTextStatus({
        userId: user.uid,
        userName: user.name || user.email || 'Utilisateur Bizaflow',
        text: statusText,
        background: '#0f172a',
      });
      setStatusText('');
      showToast({ message: 'Statut publié', variant: 'success' });
    } catch (error) {
      showToast({ message: explainError(error instanceof Error ? error.message : 'Publication statut impossible'), variant: 'error' });
    }
  }, [showToast, statusText, user]);

  const openStatus = useCallback(async (statusId: string) => {
    if (!user) return;
    const status = statuses.find((item) => item.id === statusId);
    if (!status) return;
    setSelectedStatusId(statusId);
    if (status.userId !== user.uid) {
      await markStatusViewed(statusId, user.uid).catch(() => undefined);
    }
  }, [statuses, user]);

  const saveGroupMembers = useCallback(async () => {
    if (!user || !selectedGroup) return;
    await updateGroupMembers({
      groupId: selectedGroup.id,
      actorId: user.uid,
      memberIds: groupMemberDraft,
    });
    showToast({ message: 'Membres du groupe mis à jour', variant: 'success' });
  }, [groupMemberDraft, selectedGroup, showToast, user]);

  if (!user) return null;

  return (
    <div className="page-container telecom-page-container" style={{ paddingBottom: 92 }}>
      <div className="glow-bg" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="page-header" style={{ marginBottom: 4 }}>
            <span className="page-header-gradient">SMS internes</span>
          </h1>
          <p style={{ margin: 0, color: '#4a5e7a', fontSize: '0.78rem' }}>Messagerie Bizaflow à Bizaflow</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 12px', opacity: activeView === 'sms' ? 1 : 0.6 }}
            onClick={() => setActiveView('sms')}
          >
            SMS
          </button>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '8px 12px', opacity: activeView === 'statuses' ? 1 : 0.6 }}
            onClick={() => setActiveView('statuses')}
          >
            Statuts
          </button>
          {activeView === 'sms' && (
            <button
              className="btn-primary"
              style={{ width: 'auto', padding: '8px 12px' }}
              onClick={() => setShowCreateGroup(true)}
            >
              Nouveau groupe
            </button>
          )}
        </div>
      </div>

      {notificationStatus && (
        <div style={{ ...cardStyle, padding: '9px 12px', marginBottom: 12, color: notificationStatus.startsWith('Notifications') ? '#10b981' : '#f59e0b', fontSize: '0.76rem' }}>
          {notificationStatus}
        </div>
      )}
      {blockingSmsError && (
        <div style={{ ...cardStyle, padding: '9px 12px', marginBottom: 12, color: '#f59e0b', fontSize: '0.76rem' }}>
          {blockingSmsError}
        </div>
      )}

      {showActivationModal && (
        <div style={activationModalBackdropStyle}>
          <div style={activationModalStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.03rem' }}>Activez les notifications SMS Bizaflow</h2>
            <p style={{ margin: '0 0 14px', color: '#cbd5e1', fontSize: '0.86rem', lineHeight: 1.45 }}>
              Pour recevoir les nouveaux SMS, autorisez les notifications.
            </p>
            {activationError && (
              <div style={{ ...cardStyle, padding: '8px 10px', marginBottom: 12, color: '#f59e0b', fontSize: '0.78rem' }}>
                {activationError}
              </div>
            )}
            <button onClick={enableNotifications} className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} disabled={activationBusy}>
              {activationBusy ? 'Activation...' : 'Activer maintenant'}
            </button>
          </div>
        </div>
      )}

      {activeView === 'sms' ? (
        <div style={{ display: 'grid', gridTemplateColumns: showListPanel && showChatPanel ? 'minmax(280px, 360px) 1fr' : '1fr', gap: 12 }}>
        {showListPanel && (
          <section style={{ ...cardStyle, padding: 12, minHeight: 520 }}>
            <input
              className="input-field"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, BZT, rôle..."
              style={{ marginBottom: 10 }}
            />
            <ConversationList
              rows={conversationRows}
              search={search}
              selectedRowId={selectedRowId}
              onSelect={(row) => {
                setSelectedRowId(row.id);
                setSelectedRowType(row.kind);
                if (row.kind === 'group') {
                  setSelectedGroupId(row.conversation?.groupId || row.conversation?.id || '');
                  setSelectedUserId('');
                } else {
                  setSelectedUserId(row.contactUid || '');
                  setSelectedGroupId('');
                }
                if (isMobile) setShowConversationMobile(true);
              }}
            />
          </section>
        )}

        {showChatPanel && (
          <section style={{ ...cardStyle, minHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedConversationId ? (
              <>
                <ChatHeader
                  selectedContact={selectedContact}
                  isGroup={selectedRowType === 'group'}
                  groupTitle={selectedGroup?.name || selectedGroup?.id}
                  groupMemberCount={selectedGroup?.memberIds?.length || 0}
                  isMobile={isMobile}
                  isPeerTyping={isPeerTyping}
                  onBack={() => setShowConversationMobile(false)}
                  onOpenGroupProfile={() => setShowGroupProfile(true)}
                />
                <MessageList
                  messages={messages}
                  currentUserId={user.uid}
                  setContainerRef={(node) => {
                    messagesContainerRef.current = node;
                  }}
                  onLoadOlder={() => setMessageLimit((current) => current + 40)}
                />
                <MessageComposer
                  messageBody={messageBody}
                  sending={sending}
                  onChange={handleMessageChange}
                  onSend={() => void sendMessage()}
                  onBlur={() => {
                    if (user?.uid && selectedConversationId && selectedRowType !== 'group') {
                      void setTypingState(user.uid, selectedConversationId, false);
                    }
                  }}
                />
              </>
            ) : (
              <div style={{ margin: 'auto', color: '#64748b', fontSize: '0.85rem' }}>Sélectionnez une conversation</div>
            )}
          </section>
        )}
        </div>
      ) : (
        <section style={{ ...cardStyle, minHeight: 520, padding: 14, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input-field"
              value={statusText}
              onChange={(event) => setStatusText(event.target.value)}
              placeholder="Publier un statut texte..."
            />
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => void publishStatus()}>
              Publier statut
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {statuses.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Aucun statut récent</div>
            ) : statuses.map((status) => (
              <button
                key={status.id}
                onClick={() => void openStatus(status.id)}
                style={{ ...cardStyle, padding: 10, textAlign: 'left', background: 'rgba(255,255,255,0.02)', color: '#e2e8f0' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{status.userName}{status.userId === user.uid ? ' (Vous)' : ''}</strong>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    {status.createdAt ? formatRelativeDate(status.createdAt.seconds * 1000) : ''}
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', marginTop: 4 }}>{status.text || 'Statut'}</div>
                <div style={{ color: '#94a3b8', marginTop: 4, fontSize: '0.72rem' }}>
                  Vues: {status.viewers?.length || 0}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {showCreateGroup && (
        <div style={activationModalBackdropStyle}>
          <div style={activationModalStyle}>
            <h3 style={{ marginTop: 0 }}>Créer un groupe</h3>
            <input
              className="input-field"
              placeholder="Nom du groupe"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
            />
            <div style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {contacts.map((contact) => (
                <label key={contact.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={newGroupMemberIds.includes(contact.uid)}
                    onChange={() => toggleGroupMember(contact.uid)}
                  />
                  <span>{contact.name}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => void createGroup()}>
                Créer
              </button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px', opacity: 0.7 }} onClick={() => setShowCreateGroup(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupProfile && selectedGroup && (
        <div style={activationModalBackdropStyle}>
          <div style={activationModalStyle}>
            <h3 style={{ marginTop: 0 }}>Profil groupe</h3>
            <p style={{ color: '#94a3b8', marginTop: 0 }}>{selectedGroup.name}</p>
            <input
              className="input-field"
              placeholder="Nouveau nom"
              value={groupRenameValue}
              onChange={(event) => setGroupRenameValue(event.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => void renameGroup({
                groupId: selectedGroup.id,
                actorId: user.uid,
                name: groupRenameValue || selectedGroup.name,
              })}>
                Renommer
              </button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => void saveGroupMembers()}>
                Enregistrer membres
              </button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => void leaveGroup(selectedGroup.id, user.uid)}>
                Quitter groupe
              </button>
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px', opacity: 0.8 }} onClick={() => void deleteGroup(selectedGroup.id, user.uid)}>
                Supprimer groupe
              </button>
            </div>
            <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {contacts.map((contact) => (
                <label key={contact.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1' }}>
                  <input
                    type="checkbox"
                    checked={groupMemberDraft.includes(contact.uid)}
                    onChange={() => setGroupMemberDraft((current) => (
                      current.includes(contact.uid)
                        ? current.filter((uid) => uid !== contact.uid)
                        : [...current, contact.uid]
                    ))}
                  />
                  <span>{contact.name}</span>
                </label>
              ))}
            </div>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 14px', marginTop: 10, opacity: 0.7 }} onClick={() => setShowGroupProfile(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {selectedStatus && (
        <div style={activationModalBackdropStyle} onClick={() => setSelectedStatusId('')}>
          <div style={{ ...activationModalStyle, minHeight: 260 }}>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.16)', marginBottom: 10 }}>
              <div style={{ width: '100%', height: 4, borderRadius: 999, background: '#06b6d4' }} />
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{selectedStatus.userName}</div>
            <div style={{ color: '#e2e8f0', fontSize: '1.02rem', marginTop: 10 }}>{selectedStatus.text}</div>
            {selectedStatus.userId === user.uid && (
              <button
                className="btn-primary"
                style={{ width: 'auto', padding: '10px 14px', marginTop: 16 }}
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteOwnStatus(selectedStatus.id, user.uid).then(() => setSelectedStatusId(''));
                }}
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  if (message.includes('CREATE_GROUP_STEP_TELECOM_GROUPS_FAILED')) return 'Création groupe refusée (telecom_groups).';
  if (message.includes('CREATE_GROUP_STEP_CONVERSATIONS_FAILED')) return 'Création conversation groupe refusée.';
  if (message.includes('CREATE_GROUP_STEP_MESSAGES_FAILED')) return 'Création message système groupe refusée.';
  if (message.includes('OFFLINE')) return 'Utilisateur hors ligne';
  if (message.includes('DISABLED')) return 'Fonction interne désactivée';
  if (message.includes('SELF')) return 'Action impossible sur votre propre compte';
  if (message.includes('RECEIVER_NOT_AVAILABLE')) return 'Destinataire non joignable';
  if (message.includes('FORBIDDEN')) return 'Action non autorisée';
  if (message.includes('BODY_REQUIRED')) return 'Message vide';
  if (message.includes('BODY_TOO_LONG')) return 'Message trop long';
  if (message.includes('MEDIA_TOO_LARGE')) return 'Fichier trop lourd';
  if (message.includes('MESSAGE_MEDIA_REQUIRED')) return 'Fichier requis';
  return 'Action interne impossible';
}

async function sendInternalMessagePush(messageId: string): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  try {
    await fetch('/api/telecom/internal-messages/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messageId }),
    });
  } catch {
    // push notify is best-effort
  }
}

function buildMessageDedupeKey(messageId?: string, senderId?: string, body?: string): string {
  return messageId || `${senderId || 'unknown'}::${(body || '').slice(0, 64)}`;
}

function buildLocalTimestamp(): TelecomMessage['createdAt'] {
  return Timestamp.now();
}

function formatRelativeDate(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'à l’instant';
  if (delta < 3_600_000) return `il y a ${Math.max(1, Math.floor(delta / 60_000))} min`;
  return `il y a ${Math.max(1, Math.floor(delta / 3_600_000))} h`;
}
