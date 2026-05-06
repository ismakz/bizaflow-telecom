'use client';

import { formatTime, getInitials } from '@/app/lib/utils';
import type { InternalTelecomUser, TelecomConversation } from '@/app/lib/internalTelecom';

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

export type ConversationRow = {
  contact: InternalTelecomUser;
  conversation?: TelecomConversation;
  unread: number;
};

export function ConversationList(props: {
  rows: ConversationRow[];
  search: string;
  selectedUserId: string;
  onSelect: (userId: string) => void;
}) {
  const filtered = props.rows.filter((row) => {
    if (!props.search.trim()) return true;
    const q = props.search.toLowerCase();
    return [row.contact.name, row.contact.telecomNumber, row.contact.role, row.conversation?.lastMessage || '']
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  if (filtered.length === 0) {
    return (
      <div style={{ color: '#64748b', textAlign: 'center', padding: 24, fontSize: '0.82rem' }}>
        Aucun utilisateur interne actif
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filtered.map((row) => {
        const { contact, conversation, unread } = row;
        const active = contact.uid === props.selectedUserId;
        return (
          <button
            key={contact.uid}
            onClick={() => props.onSelect(contact.uid)}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: '0.83rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                <span style={{ color: '#64748b', fontSize: '0.62rem', flexShrink: 0 }}>
                  {formatTime(conversation?.lastMessageAt ? new Date(conversation.lastMessageAt.seconds * 1000).toISOString() : null)}
                </span>
                {unread > 0 && <span style={badgeStyle}>{unread}</span>}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conversation?.lastMessage || contact.telecomNumber}
              </div>
              <div style={{ color: statusColors[contact.presenceStatus], fontSize: '0.67rem', marginTop: 2 }}>
                {statusLabels[contact.presenceStatus]} · {contact.role}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
