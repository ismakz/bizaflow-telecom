'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './AppProvider';

const tabs = [
  {
    id: 'home', label: 'Accueil', href: '/',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  },
  {
    id: 'dialer', label: 'Appels', href: '/dialer',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" /></svg>,
  },
  {
    id: 'contacts', label: 'Contacts', href: '/contacts',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  },
  {
    id: 'credit', label: 'Crédit', href: '/credit',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  },
  {
    id: 'profile', label: 'Profil', href: '/profile',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  },
];

const HIDDEN_NAV_PAGES = ['/login', '/seed', '/pending', '/rejected', '/suspended', '/change-password', '/ceo'];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useApp();

  if (HIDDEN_NAV_PAGES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="bottom-nav" id="bottom-navigation">
      {tabs.map((tab) => {
        const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link key={tab.id} href={tab.href} className={`nav-item ${isActive ? 'active' : ''}`} id={`nav-${tab.id}`}>
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}

      {user?.role === 'ceo' && (
        <Link href="/ceo" className="nav-item" id="nav-ceo" style={{ color: '#ef4444' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-icon">
            <path d="M12 15l-2-5-2 5h4z" />
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>Admin</span>
        </Link>
      )}
    </nav>
  );
}
