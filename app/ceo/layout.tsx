'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/app/components/AppProvider';

const ceoTabs = [
  { label: 'Dashboard', href: '/ceo', icon: 'DATA' },
  { label: 'Demandes', href: '/ceo/requests', icon: 'REQ' },
  { label: 'Utilisateurs', href: '/ceo/users', icon: 'USR' },
];

export default function CEOLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useApp();
  const pathname = usePathname();

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', fontWeight: 900, color: 'white', flexShrink: 0,
          }}>
            CEO
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Admin
              </span>{' '}
              <span style={{ fontWeight: 300, color: '#e2e8f0' }}>Bizaflow Telecom</span>
            </div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Link href="/" style={{
            padding: '6px 12px', borderRadius: 8, fontSize: '0.7rem',
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#06b6d4', textDecoration: 'none', fontWeight: 600,
          }}>
            Retour app
          </Link>
          <button onClick={logout} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: '0.7rem',
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444', cursor: 'pointer', fontWeight: 600,
          }}>
            Deconnexion
          </button>
        </div>
      </header>

      <nav style={{
        display: 'flex', gap: 4, padding: '8px 16px', overflowX: 'auto',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.15)',
      }}>
        {ceoTabs.map((tab) => {
          const isActive = tab.href === '/ceo' ? pathname === '/ceo' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: '0.8rem',
                fontWeight: isActive ? 700 : 500, textDecoration: 'none',
                background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                border: isActive ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid transparent',
                color: isActive ? '#06b6d4' : '#4a5e7a',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em' }}>{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <main style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
