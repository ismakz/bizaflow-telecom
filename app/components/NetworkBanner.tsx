'use client';

import { useSyncExternalStore } from 'react';

function subscribeToNetworkStatus(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);

  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getNetworkStatus() {
  return navigator.onLine;
}

function getServerNetworkStatus() {
  return true;
}

/**
 * Bandeau discret si la connexion réseau est perdue (PWA / mobile).
 */
export default function NetworkBanner() {
  const online = useSyncExternalStore(subscribeToNetworkStatus, getNetworkStatus, getServerNetworkStatus);

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
