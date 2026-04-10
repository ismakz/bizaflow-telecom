'use client';

import { getInitials } from '@/app/lib/utils';
import type { Contact } from '@/app/lib/types';

interface ContactCardProps {
  contact: Contact;
  onCall: (contact: Contact) => void;
  onToggleFavorite: (id: string, currentValue: boolean) => void;
  onDelete: (id: string) => void;
  delay?: number;
}

export default function ContactCard({ contact, onCall, onToggleFavorite, onDelete, delay = 0 }: ContactCardProps) {
  const initials = getInitials(contact.name);

  return (
    <div
      className="glass-card-sm animate-slide-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className={`avatar avatar-md ${contact.isInternal ? 'avatar-internal' : ''}`}
        style={{ background: contact.avatarColor }}
      >
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {contact.name}
          </span>
          {contact.isInternal && <span className="badge badge-internal">Bizaflow</span>}
        </div>
        <div style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
          {contact.phone}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onToggleFavorite(contact.id, contact.isFavorite)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            color: contact.isFavorite ? 'var(--accent-amber)' : 'var(--foreground-muted)',
            transition: 'color 0.2s',
            fontSize: '1rem',
          }}
          title={contact.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {contact.isFavorite ? '★' : '☆'}
        </button>

        <button
          onClick={() => onCall(contact)}
          style={{
            background: 'rgba(6, 182, 212, 0.12)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: 10,
            cursor: 'pointer',
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          title="Appeler"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
        </button>

        <button
          onClick={() => onDelete(contact.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 6,
            color: 'var(--foreground-muted)',
            transition: 'color 0.2s',
            fontSize: '0.75rem',
          }}
          title="Supprimer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
