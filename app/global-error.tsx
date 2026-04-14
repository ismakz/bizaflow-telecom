'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="fr" className="dark">
      <body style={{ margin: 0, background: '#060b18', color: '#e8edf5', minHeight: '100dvh' }}>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Erreur critique</h1>
          <p style={{ color: '#4a5e7a', fontSize: '0.85rem', maxWidth: 380, lineHeight: 1.5 }}>
            Une erreur a empêché l’affichage de l’application. Réessayez ou rechargez la page.
          </p>
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
                background: 'rgba(255,255,255,0.04)',
                color: '#e8edf5',
              }}
            >
              Recharger
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
