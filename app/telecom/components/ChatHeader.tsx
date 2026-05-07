'use client';

import { formatTime } from '@/app/lib/utils';
import type { InternalTelecomUser } from '@/app/lib/internalTelecom';

export function ChatHeader(props: {
  selectedContact: InternalTelecomUser | null;
  groupTitle?: string;
  groupMemberCount?: number;
  isGroup?: boolean;
  isMobile: boolean;
  isPeerTyping: boolean;
  onBack: () => void;
  onOpenGroupProfile?: () => void;
}) {
  const title = props.isGroup ? (props.groupTitle || 'Groupe') : (props.selectedContact?.name || 'Contact');
  const subtitle = props.isGroup
    ? `${props.groupMemberCount || 0} membres`
    : (props.isPeerTyping
      ? 'en train d’écrire...'
      : `${props.selectedContact?.telecomNumber || ''} · ${props.selectedContact?.presenceStatus === 'online'
        ? 'en ligne'
        : `vu ${formatTime(props.selectedContact?.lastSeenAt ? new Date(props.selectedContact.lastSeenAt.seconds * 1000).toISOString() : null)}`}`);
  return (
    <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
      {props.isMobile && (
        <button onClick={props.onBack} style={secondaryButtonStyle}>
          Retour
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ color: '#64748b', fontSize: '0.74rem' }}>
          {subtitle}
        </div>
      </div>
      {props.isGroup && props.onOpenGroupProfile && (
        <button onClick={props.onOpenGroupProfile} style={secondaryButtonStyle}>
          Groupe
        </button>
      )}
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
