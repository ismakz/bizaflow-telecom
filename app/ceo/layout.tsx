'use client';

import { useApp } from '@/app/components/AppProvider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ceoTabs = [
  { label: 'Dashboard', href: '/ceo', icon: '📊' },
  { label: 'Demandes', href: '/ceo/requests', icon: '📋' },
  { label: 'Utilisateurs', href: '/ceo/users', icon: '👥' },
];

export default function CEOLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useApp();
  const pathname = usePathname();

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', display: 'flex', flexDirection: 'column' }}>
      {/* CEO Header */}
      <header style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', fontWeight: 900, color: 'white',
          }}>
            CEO
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              <span style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Admin
              </span>{' '}
              <span style={{ fontWeight: 300, color: '#e2e8f0' }}>Bizaflow Telecom</span>
            </div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>{user?.email}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/" style={{
            padding: '6px 12px', borderRadius: 8, fontSize: '0.7rem',
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#06b6d4', textDecoration: 'none', fontWeight: 600,
          }}>
            ← App
          </Link>
          <button onClick={logout} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: '0.7rem',
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444', cursor: 'pointer', fontWeight: 600,
          }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* CEO Navigation */}
      <nav style={{
        display: 'flex', gap: 4, padding: '8px 16px',
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
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
