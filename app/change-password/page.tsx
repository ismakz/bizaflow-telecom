'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, updatePassword } from 'firebase/auth';
import { auth } from '@/app/lib/firebase';
import { clearMustChangePassword } from '@/app/lib/firestore';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Non connecté');

      await updatePassword(currentUser, newPassword);
      await clearMustChangePassword(currentUser.uid);

      window.location.href = '/';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (msg.includes('requires-recent-login')) {
        setError('Veuillez vous reconnecter avant de changer le mot de passe');
        await signOut(auth);
        router.replace('/login?reason=recent-login');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      background: '#060b18', color: '#e2e8f0',
    }}>
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative', zIndex: 1 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '1.5rem',
        }}>
          🔐
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 4 }}>
          Changer le mot de passe
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.8rem' }}>
          Pour des raisons de sécurité, veuillez définir un nouveau mot de passe
        </p>
      </div>

      <div style={{
        width: '100%', maxWidth: 380, padding: 24, borderRadius: 16,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)', position: 'relative', zIndex: 1,
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: '#4a5e7a', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Nouveau mot de passe
            </label>
            <input
              className="input-field"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
              required
              minLength={8}
              id="new-password"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', color: '#4a5e7a', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Confirmer le mot de passe
            </label>
            <input
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmer"
              required
              id="confirm-password"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 10, padding: '8px 12px', color: '#f87171', fontSize: '0.8rem',
            }}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px 20px', opacity: loading ? 0.6 : 1 }}
            id="change-password-submit"
          >
            {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
