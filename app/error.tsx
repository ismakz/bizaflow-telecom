'use client';

import { useEffect } from 'react';
import BizaflowLogo from '@/app/components/BizaflowLogo';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error]', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <BizaflowLogo size={56} />
      <h1 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 20, textAlign: 'center' }}>
        Un problème est survenu
      </h1>
      <p style={{ color: '#4a5e7a', fontSize: '0.85rem', textAlign: 'center', maxWidth: 360, lineHeight: 1.55 }}>
        L’application a rencontré une erreur inattendue. Vous pouvez réessayer ou recharger la page.
      </p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            fontSize: '0.7rem',
            maxWidth: '100%',
            overflow: 'auto',
            textAlign: 'left',
          }}
        >
          {error.message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '0.85rem',
            background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
            color: '#fff',
          }}
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            background: 'rgba(255,255,255,0.04)',
            color: '#e8edf5',
          }}
        >
          Recharger
        </button>
      </div>
    </div>
  );
}
