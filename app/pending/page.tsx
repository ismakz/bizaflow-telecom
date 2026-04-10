'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { getTelecomUser } from '@/app/lib/firestore';
import { auth } from '@/app/lib/firebase';

export default function PendingPage() {
  const { logout } = useApp();
  const [checking, setChecking] = useState(false);

  // Auto-check approval every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      setChecking(true);
      try {
        const profile = await getTelecomUser(currentUser.uid);
        if (profile && profile.status === 'approved') {
          window.location.href = '/';
        }
      } catch {
        // ignore
      } finally {
        setChecking(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      background: '#060b18', color: '#e2e8f0',
    }}>
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1, maxWidth: 400 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.12)', border: '2px solid rgba(245, 158, 11, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: '2rem',
        }}>
          ⏳
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
          Demande en attente
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 24 }}>
          Votre compte a été créé avec succès. Un administrateur doit valider votre inscription avant que vous puissiez accéder à Bizaflow Telecom.
        </p>

        <div style={{
          background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)',
          borderRadius: 12, padding: 16, marginBottom: 24,
        }}>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginBottom: 4 }}>
            Statut : EN ATTENTE DE VALIDATION
          </div>
          <div style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>
            {checking ? 'Vérification en cours...' : 'Vérification automatique toutes les 10s'}
          </div>
        </div>

        <button className="btn-secondary" onClick={logout} style={{ padding: '10px 24px' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
