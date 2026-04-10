'use client';

import { useApp } from '@/app/components/AppProvider';

export default function RejectedPage() {
  const { logout } = useApp();

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      background: '#060b18', color: '#e2e8f0',
    }}>
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, maxWidth: 400 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)', border: '2px solid rgba(239, 68, 68, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: '2rem',
        }}>
          ✕
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
          Demande rejetée
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
          Votre demande d&apos;inscription à Bizaflow Telecom a été rejetée par un administrateur. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, veuillez contacter le support.
        </p>

        <div style={{
          background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: 12, padding: 16, marginBottom: 24,
        }}>
          <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
            Statut : REJETÉ
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <a href="mailto:ceo@bizaflow.app" style={{
            padding: '10px 20px', borderRadius: 10,
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)',
            color: '#06b6d4', fontWeight: 600, textDecoration: 'none', fontSize: '0.85rem',
          }}>
            Contacter le support
          </a>
          <button className="btn-secondary" onClick={logout} style={{ padding: '10px 20px' }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
