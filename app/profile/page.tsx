'use client';

import { useApp } from '@/app/components/AppProvider';
import { getInitials, formatBalance } from '@/app/lib/utils';

export default function ProfilePage() {
  const { user, contacts, calls, logout } = useApp();

  if (!user) return null;

  const initials = getInitials(user.name);
  const totalCalls = calls.length;
  const totalContacts = contacts.length;
  const internalContacts = contacts.filter((c) => c.isInternal).length;

  const copyNumber = () => {
    navigator.clipboard.writeText(user.telecomNumber).catch(() => {});
  };

  return (
    <div className="page-container">
      <div className="glow-bg" />

      <h1 className="page-header" style={{ position: 'relative', zIndex: 1 }}>
        <span className="page-header-gradient">Profil</span>
      </h1>

      {/* Profile Card */}
      <div className="glass-card animate-slide-in" style={{ textAlign: 'center', marginBottom: 16, padding: 24 }}>
        <div className="avatar avatar-xl" style={{ background: '#06b6d4', margin: '0 auto 12px' }}>
          {initials}
        </div>

        <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 2 }}>
          {user.name}
        </div>
        <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.8rem', marginBottom: 12 }}>
          {user.email}
        </div>

        {/* Telecom Number */}
        <button
          onClick={copyNumber}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)',
            borderRadius: 99, padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
            color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1rem',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.03em',
          }}
          title="Copier le numéro"
          id="copy-telecom-number"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
          {user.telecomNumber}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid animate-slide-in animate-slide-in-delay-1" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{totalCalls}</div>
          <div className="stat-label">Appels</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>{totalContacts}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{internalContacts}</div>
          <div className="stat-label">Internes</div>
        </div>
      </div>

      {/* Balance Quick View */}
      <div className="glass-card animate-slide-in animate-slide-in-delay-2" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Solde crédit
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-green)' }}>
              {formatBalance(user.balance)}
            </div>
          </div>
          <span className="badge badge-free">Actif</span>
        </div>
      </div>

      {/* Interconnexion (Future) */}
      <div className="glass-card animate-slide-in animate-slide-in-delay-3" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          Interconnexion
          <span className="badge badge-coming-soon">Bientôt</span>
        </h3>

        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', fontWeight: 800, color: '#818cf8',
            }}>B</div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Bizaflow</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>Lier votre compte Bizaflow</div>
            </div>
          </div>
          <span className="badge badge-coming-soon">v2.0</span>
        </div>

        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', fontWeight: 800, color: '#34d399',
            }}>$</div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Bizapay</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>Paiements via Bizapay</div>
            </div>
          </div>
          <span className="badge badge-coming-soon">v2.0</span>
        </div>
      </div>

      {/* Logout */}
      <button
        className="btn-danger"
        onClick={logout}
        style={{ width: '100%', marginBottom: 16 }}
        id="logout-button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Déconnexion
      </button>

      {/* App Info */}
      <div style={{ textAlign: 'center', paddingBottom: 16 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>
          <span className="page-header-gradient">Bizaflow</span>{' '}
          <span style={{ fontWeight: 300 }}>Telecom</span>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--foreground-muted)', marginTop: 4 }}>
          Version 1.0.0 • © 2026 Bizaflow
        </div>
      </div>
    </div>
  );
}
