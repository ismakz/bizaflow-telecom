'use client';

import { formatTime } from '@/app/lib/utils';
import type { MessageStatus, TelecomMessage } from '@/app/lib/internalTelecom';

export function MessageList(props: {
  messages: TelecomMessage[];
  currentUserId: string;
  setContainerRef: (node: HTMLDivElement | null) => void;
  onLoadOlder: () => void;
  onReply: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const { messages, currentUserId, setContainerRef, onLoadOlder, onReply, onReact, onRemoveReaction, onJumpToMessage } = props;
  const messageById = new Map(messages.map((m) => [m.id, m]));
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
              {message.replyToMessageId && messageById.get(message.replyToMessageId) && (
                <button
                  onClick={() => onJumpToMessage(message.replyToMessageId as string)}
                  style={{ ...replyChipStyle, alignSelf: 'stretch' }}
                >
                  ↪ {messageById.get(message.replyToMessageId)?.body || 'Message'}
                </button>
              )}
              {message.body}
              {message.mediaUrl && (
                <div style={{ marginTop: 8 }}>
                  {message.type === 'image' ? (
                    <a href={message.mediaUrl} target="_blank" rel="noreferrer">
                      <img src={message.mediaUrl} alt={message.mediaName || 'image'} style={imagePreviewStyle} />
                    </a>
                  ) : message.type === 'audio' ? (
                    <audio controls src={message.mediaUrl} style={{ width: '100%' }} />
                  ) : (
                    <a href={message.mediaUrl} target="_blank" rel="noreferrer" style={{ color: mine ? '#fff' : '#38bdf8' }}>
                      📄 {message.mediaName || 'Document'} ({formatFileSize(message.mediaSize || 0)})
                    </a>
                  )}
                </div>
              )}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.62rem', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
              {formatTime(message.createdAt ? new Date(message.createdAt.seconds * 1000).toISOString() : null)}
              {mine ? ` · ${renderMessageStatus(message.status)}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => onReact(message.id, emoji)} style={emojiButtonStyle}>{emoji}</button>
              ))}
              <button onClick={() => onReply(message.id)} style={smallActionButtonStyle}>Répondre</button>
              {message.reactionsByUser?.[currentUserId] && (
                <button onClick={() => onRemoveReaction(message.id)} style={smallActionButtonStyle}>Retirer réaction</button>
              )}
            </div>
            {message.reactionsByUser && Object.keys(message.reactionsByUser).length > 0 && (
              <div style={{ marginTop: 3, color: '#cbd5e1', fontSize: '0.68rem' }}>
                {summarizeReactions(message.reactionsByUser)}
              </div>
            )}
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

const imagePreviewStyle = {
  maxWidth: 240,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.15)',
} satisfies React.CSSProperties;

const replyChipStyle = {
  width: '100%',
  textAlign: 'left',
  marginBottom: 6,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(15,23,42,0.35)',
  color: '#cbd5e1',
  fontSize: '0.72rem',
  padding: '5px 8px',
  cursor: 'pointer',
} satisfies React.CSSProperties;

const emojiButtonStyle = {
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontSize: '0.75rem',
  padding: '2px 7px',
  cursor: 'pointer',
} satisfies React.CSSProperties;

const smallActionButtonStyle = {
  border: 'none',
  background: 'transparent',
  color: '#38bdf8',
  cursor: 'pointer',
  fontSize: '0.7rem',
} satisfies React.CSSProperties;

const EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

function renderMessageStatus(status: MessageStatus): string {
  if (status === 'read') return '✓✓ lu';
  if (status === 'delivered') return '✓✓ reçu';
  return '✓ envoyé';
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

function summarizeReactions(reactionsByUser: Record<string, string>): string {
  const counts = new Map<string, number>();
  Object.values(reactionsByUser).forEach((emoji) => {
    counts.set(emoji, (counts.get(emoji) || 0) + 1);
  });
  return [...counts.entries()].map(([emoji, count]) => `${emoji} ${count}`).join('  ');
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}
