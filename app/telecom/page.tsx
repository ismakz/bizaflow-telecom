'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { useApp } from '@/app/components/AppProvider';
import {
  conversationIdFor,
  markMessageAsRead,
  sendInternalMessage,
  subscribeConversationMessages,
  subscribeIncomingMessages,
  subscribeInternalUsers,
  subscribeUserConversations,
  touchUserPresence,
  type InternalTelecomUser,
  type TelecomConversation,
  type TelecomMessage,
} from '@/app/lib/internalTelecom';
import { auth } from '@/app/lib/firebase';
import { onForegroundPushMessage, registerPushToken } from '@/app/lib/pushNotifications';
import { formatTime, getInitials } from '@/app/lib/utils';

const statusLabels = {
  online: 'En ligne',
  offline: 'Hors ligne',
  busy: 'Occupé',
  in_call: 'En appel',
} as const;

const statusColors = {
  online: '#10b981',
  offline: '#64748b',
  busy: '#f59e0b',
  in_call: '#06b6d4',
} as const;

const cardStyle = {
  background: 'rgba(255,255,255,0.035)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
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
  const [sending, setSending] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showConversationMobile, setShowConversationMobile] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const incomingMessagesInitializedRef = useRef(false);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());

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
      if (payload.messageId && notifiedMessageIdsRef.current.has(payload.messageId)) return;
      if (payload.messageId) notifiedMessageIdsRef.current.add(payload.messageId);
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
    if (!user || user.status !== 'approved') return;
    incomingMessagesInitializedRef.current = false;
    const unsubIncoming = subscribeIncomingMessages(
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
        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          setNotificationStatus('Accès messages refusé. Vérifiez les permissions de votre compte.');
        }
      }
    );
    return () => unsubIncoming();
  }, [contacts, playMessageSound, showToast, user]);

  useEffect(() => {
    if (!user) return;
    const unsubUsers = subscribeInternalUsers(user.uid, (items) => {
      setContacts(items);
      setSelectedUserId((current) => current || items[0]?.uid || '');
    });
    const unsubConversations = subscribeUserConversations(user.uid, setConversations);
    return () => {
      unsubUsers();
      unsubConversations();
    };
  }, [user]);

  useEffect(() => {
    if (!selectedConversationId || !user) {
      setMessages([]);
      return;
    }
    const unsub = subscribeConversationMessages(
      selectedConversationId,
      (items) => {
        setMessages(items);
        void markMessageAsRead(selectedConversationId, user.uid).catch(() => undefined);
      },
      (error) => {
        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          setNotificationStatus('Accès conversation refusé. Vérifiez les permissions de ce chat.');
          return;
        }
        showToast({ message: 'Lecture des messages impossible', variant: 'error' });
      }
    );
    return () => unsub();
  }, [selectedConversationId, showToast, user]);

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
                    onClick={() => {
                      setSelectedUserId(contact.uid);
                      if (isMobile) setShowConversationMobile(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 10,
                      cursor: 'pointer',
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
        )}

        {showChatPanel && (
          <section style={{ ...cardStyle, minHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedContact ? (
              <>
                <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isMobile && (
                    <button onClick={() => setShowConversationMobile(false)} style={secondaryButtonStyle}>
                      Retour
                    </button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedContact.name}</div>
                    <div style={{ color: '#64748b', fontSize: '0.74rem' }}>
                      {selectedContact.telecomNumber} · {statusLabels[selectedContact.presenceStatus]}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {messages.length === 0 ? (
                    <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center', fontSize: '0.82rem' }}>
                      Aucun message. Démarrez la conversation.
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

                <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }}>
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
                    placeholder="Écrire un SMS interne..."
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
              <div style={{ margin: 'auto', color: '#64748b', fontSize: '0.85rem' }}>Sélectionnez une conversation</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

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
