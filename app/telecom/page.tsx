'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app/components/AppProvider';
import {
  acceptInternalCall,
  conversationIdFor,
  declineInternalCall,
  endInternalCall,
  markInternalCallMissed,
  markMessageAsRead,
  sendInternalMessage,
  startInternalCall,
  subscribeConversationMessages,
  subscribeIncomingInternalCalls,
  subscribeInternalUsers,
  subscribeRecentInternalCalls,
  subscribeUserConversations,
  touchUserPresence,
  type InternalTelecomUser,
  type TelecomConversation,
  type TelecomInternalCall,
  type TelecomMessage,
} from '@/app/lib/internalTelecom';
import { formatDuration, formatTime, getInitials } from '@/app/lib/utils';

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

export default function InternalTelecomPage() {
  const { user, showToast } = useApp();
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
  const [sending, setSending] = useState(false);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.uid === selectedUserId) || null,
    [contacts, selectedUserId]
  );
  const selectedConversationId = user && selectedUserId ? conversationIdFor(user.uid, selectedUserId) : '';

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
    const unsubUsers = subscribeInternalUsers(user.uid, (items) => {
      setContacts(items);
      setSelectedUserId((current) => current || items[0]?.uid || '');
    });
    const unsubConversations = subscribeUserConversations(user.uid, setConversations);
    const unsubIncoming = subscribeIncomingInternalCalls(user.uid, setIncomingCalls);
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
    const unsub = subscribeConversationMessages(selectedConversationId, (items) => {
      setMessages(items);
      void markMessageAsRead(selectedConversationId, user.uid);
    });
    return () => unsub();
  }, [selectedConversationId, user]);

  useEffect(() => {
    if (!incomingCalls[0]) return;
    setActiveCall(incomingCalls[0]);
    setCallNotice(`${incomingCalls[0].callerName} vous appelle`);
  }, [incomingCalls]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') return;
    const timer = window.setTimeout(() => {
      void markInternalCallMissed(activeCall);
      setCallNotice('Appel manqué');
      setActiveCall(null);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [activeCall]);

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
      await sendInternalMessage({
        senderId: user.uid,
        receiverId: selectedContact.uid,
        body: messageBody,
      });
      setMessageBody('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Message impossible';
      showToast({ message: explainError(message), variant: 'error' });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Appel impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [selectedContact, showToast, user]);

  const acceptCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      await acceptInternalCall(activeCall, user.uid);
      setActiveCall({ ...activeCall, status: 'accepted' });
      setCallNotice('Appel accepté. WebRTC prêt avec STUN public; TURN sera ajouté à la prochaine étape.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Acceptation impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, showToast, user]);

  const declineCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      await declineInternalCall(activeCall, user.uid);
      setCallNotice('Appel refusé');
      setActiveCall(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Refus impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, showToast, user]);

  const endCall = useCallback(async () => {
    if (!user || !activeCall) return;
    try {
      await endInternalCall(activeCall, user.uid);
      setCallNotice('Appel terminé');
      setActiveCall(null);
      void touchUserPresence(user.uid, 'online');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fin appel impossible';
      showToast({ message: explainError(message), variant: 'error' });
    }
  }, [activeCall, showToast, user]);

  if (!user) return null;

  return (
    <div className="page-container" style={{ paddingBottom: 92 }}>
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
              <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>{selectedContact.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.74rem' }}>
                    {selectedContact.telecomNumber} · {statusLabels[selectedContact.presenceStatus]}
                  </div>
                </div>
                <button onClick={callSelected} className="btn-primary" style={{ width: 'auto', padding: '10px 14px' }}>
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

              <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
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
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageBody.trim() || sending}
                  className="btn-primary"
                  style={{ width: 110, opacity: !messageBody.trim() || sending ? 0.55 : 1 }}
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
