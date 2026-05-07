'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { useApp } from '@/app/components/AppProvider';
import {
  backfillMessageParticipantMeta,
  conversationIdFor,
  enrichConversationParticipantsMeta,
  markConversationMessagesDelivered,
  markMessageAsRead,
  sendInternalMessage,
  setTypingState,
  subscribeDirectConversationMessages,
  subscribeIncomingMessages,
  subscribeInternalUsers,
  subscribeTypingState,
  subscribeUserConversations,
  touchUserPresence,
  type InternalTelecomUser,
  type TelecomConversation,
  type TelecomMessage,
} from '@/app/lib/internalTelecom';
import { auth } from '@/app/lib/firebase';
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
  const [messages, setMessages] = useState<TelecomMessage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [messageBody, setMessageBody] = useState('');
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

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.uid === selectedUserId) || null,
    [contacts, selectedUserId]
  );

  const selectedConversationId = user && selectedUserId ? conversationIdFor(user.uid, selectedUserId) : '';
  const showListPanel = !isMobile || !showConversationMobile;
  const showChatPanel = !isMobile || showConversationMobile;

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
    const unsub = subscribeDirectConversationMessages({
      currentUserUid: user.uid,
      currentUserTelecomNumber: user.telecomNumber,
      peerUid: selectedContact?.uid,
      peerTelecomNumber: selectedContact?.telecomNumber,
      conversationId: selectedConversationId,
      limitCount: messageLimit,
      callback: (items) => {
        latestMessagesCountRef.current = items.length;
        if (items.length > 0 || hasValidConversationRef.current) {
          setBlockingSmsError('');
          if (conversationErrorTimerRef.current) {
            window.clearTimeout(conversationErrorTimerRef.current);
            conversationErrorTimerRef.current = null;
          }
        }
        setMessages(items);
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
      },
      onError: (error, queryMeta) => {
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
      },
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
  }, [messageLimit, selectedContact?.telecomNumber, selectedContact?.uid, selectedConversationId, user]);

  useEffect(() => {
    if (!selectedContact || !selectedConversationId) {
      setIsPeerTyping(false);
      return;
    }
    return subscribeTypingState(selectedContact.uid, selectedConversationId, setIsPeerTyping);
  }, [selectedContact, selectedConversationId]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, selectedConversationId]);

  const sendMessage = useCallback(async () => {
    if (!user || !selectedContact || sending) return;
    setSending(true);
    try {
      const messageId = await sendInternalMessage({
        senderId: user.uid,
        receiverId: selectedContact.uid,
        body: messageBody,
        type: 'text',
      });
      void sendInternalMessagePush(messageId);
      setMessageBody('');
      void setTypingState(user.uid, selectedConversationId, false);
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
  }, [messageBody, selectedContact, selectedConversationId, sending, showToast, user]);

  const handleMessageChange = useCallback((value: string) => {
    setMessageBody(value);
    if (!user || !selectedConversationId) return;
    void setTypingState(user.uid, selectedConversationId, true);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      void setTypingState(user.uid, selectedConversationId, false);
    }, 1400);
  }, [selectedConversationId, user]);

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
    return contacts
      .map((contact) => {
        const conversationId = user ? conversationIdFor(user.uid, contact.uid) : '';
        const conversation = conversations.find((item) => item.id === conversationId);
        return {
          contact,
          conversation,
          unread: user ? conversation?.unreadCountByUser?.[user.uid] || 0 : 0,
        };
      })
      .sort((a, b) => {
        const aTs = a.conversation?.lastMessageAt?.seconds || 0;
        const bTs = b.conversation?.lastMessageAt?.seconds || 0;
        if (aTs !== bTs) return bTs - aTs;
        return a.contact.name.localeCompare(b.contact.name);
      });
  }, [contacts, conversations, user]);
  useEffect(() => {
    setMessageLimit(40);
  }, [selectedConversationId]);

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
        <div style={{ ...cardStyle, padding: '8px 12px', color: '#10b981', fontSize: '0.72rem', fontWeight: 800 }}>SMS rapide</div>
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
              selectedUserId={selectedUserId}
              onSelect={(userId) => {
                setSelectedUserId(userId);
                if (isMobile) setShowConversationMobile(true);
              }}
            />
          </section>
        )}

        {showChatPanel && (
          <section style={{ ...cardStyle, minHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedContact ? (
              <>
                <ChatHeader
                  selectedContact={selectedContact}
                  isMobile={isMobile}
                  isPeerTyping={isPeerTyping}
                  onBack={() => setShowConversationMobile(false)}
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
                    if (user?.uid && selectedConversationId) {
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
