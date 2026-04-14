'use client';

import { useEffect, useState } from 'react';

/**
 * Bandeau discret si la connexion réseau est perdue (PWA / mobile).
 */
export default function NetworkBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '10px 16px',
        textAlign: 'center',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.95), rgba(239, 68, 68, 0.9))',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      Pas de connexion Internet — certaines actions ne fonctionneront pas jusqu’à la reconnexion.
    </div>
  );
}
