'use client';

import { formatTime } from '@/app/lib/utils';
import type { MessageStatus, TelecomMessage } from '@/app/lib/internalTelecom';

export function MessageList(props: {
  messages: TelecomMessage[];
  currentUserId: string;
  setContainerRef: (node: HTMLDivElement | null) => void;
  onLoadOlder: () => void;
}) {
  const { messages, currentUserId, setContainerRef, onLoadOlder } = props;
  return (
    <div ref={setContainerRef} style={{ flex: 1, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.length >= 40 && (
        <button onClick={onLoadOlder} style={loadOlderStyle}>
          Charger plus ancien
        </button>
      )}
      {messages.length === 0 ? (
        <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center', fontSize: '0.82rem' }}>
          Aucun message. Démarrez la conversation.
        </div>
      ) : messages.map((message, index) => {
        const mine = message.senderId === currentUserId;
        const previous = index > 0 ? messages[index - 1] : null;
        const currentDate = message.createdAt ? new Date(message.createdAt.seconds * 1000) : null;
        const previousDate = previous?.createdAt ? new Date(previous.createdAt.seconds * 1000) : null;
        const shouldShowDateSeparator = !previousDate || !currentDate || previousDate.toDateString() !== currentDate.toDateString();
        return (
          <div id={`msg-${message.id}`} key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
            {shouldShowDateSeparator && currentDate && (
              <div style={{ alignSelf: 'center', margin: '8px 0 12px', color: '#94a3b8', fontSize: '0.68rem', textAlign: 'center' }}>
                {formatDateSeparator(currentDate)}
              </div>
            )}
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
            <div style={{ color: '#64748b', fontSize: '0.62rem', marginTop: 3, textAlign: mine ? 'right' : 'left', display: 'flex', alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 5 }}>
              {formatTime(message.createdAt ? new Date(message.createdAt.seconds * 1000).toISOString() : null)}
              {mine ? (
                <span style={{ color: statusMeta(message.status).color, fontWeight: 800 }}>
                  {statusMeta(message.status).label}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const loadOlderStyle = {
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  fontSize: '0.7rem',
  alignSelf: 'center',
  cursor: 'pointer',
} satisfies React.CSSProperties;

function statusMeta(status: MessageStatus): { label: string; color: string } {
  if (status === 'read') return { label: '✓✓', color: '#22c55e' };
  if (status === 'delivered') return { label: '✓✓', color: '#94a3b8' };
  return { label: '✓', color: '#cbd5e1' };
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (target.getTime() === today.getTime()) return 'Aujourd’hui';
  if (target.getTime() === yesterday.getTime()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

