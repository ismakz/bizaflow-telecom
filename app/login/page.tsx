'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signUp, signIn } from '@/app/lib/auth';
import { getTelecomUser } from '@/app/lib/firestore';
import { auth } from '@/app/lib/firebase';
import BizaflowLogo from '@/app/components/BizaflowLogo';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    searchParams.get('reason') === 'recent-login'
      ? 'Reconnectez-vous pour confirmer le changement de mot de passe.'
      : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!name.trim()) {
          setError('Veuillez entrer votre nom');
          setLoading(false);
          return;
        }
        // Prevent CEO role hijacking
        if (email.toLowerCase() === 'ceo@bizaflow.app') {
          setError('Cette adresse email est réservée');
          setLoading(false);
          return;
        }

        setStatusMessage('Création du compte...');
        await signUp(email, password, name.trim());
        // AppProvider will detect pending status and redirect to /pending
      } else {
        setStatusMessage('Connexion en cours...');
        await signIn(email, password);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error('AUTH_SUCCESS_BUT_NO_CURRENT_USER');
        }

        console.log('LOGIN AUTH SUCCESS', currentUser.uid);
        const profile = await getTelecomUser(currentUser.uid);
        console.log('USER DOC EXISTS', !!profile);

        if (!profile) {
          throw new Error('USER_DOC_NOT_FOUND');
        }

        const requiredFields = ['uid', 'email', 'role', 'status', 'telecomNumber', 'balance'] as const;
        const missing = requiredFields.filter((k) => profile[k] === undefined || profile[k] === null || profile[k] === '');
        if (missing.length > 0) {
          throw new Error(`PROFILE_INCOMPLETE:${missing.join(',')}`);
        }

        console.log('ROLE', profile.role);
        console.log('STATUS', profile.status);

        let route = '/';
        if (profile.status === 'pending') route = '/pending';
        else if (profile.status === 'rejected') route = '/rejected';
        else if (profile.status === 'suspended') route = '/suspended';
        else if (profile.status === 'approved' && profile.role === 'ceo') route = '/ceo';
        else if (profile.status === 'approved' && profile.role !== 'ceo') route = '/';
        else throw new Error(`UNKNOWN_STATUS:${profile.status}`);

        console.log('TARGET ROUTE', route);
        setStatusMessage(route === '/ceo' ? 'Accès CEO...' : 'Redirection...');
        router.push(route);
      }
    } catch (err: unknown) {
      console.error('LOGIN FLOW ERROR', err);
      setStatusMessage('');
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      if (message.includes('email-already-in-use')) {
        setError('Cet email est déjà utilisé');
      } else if (message.includes('wrong-password') || message.includes('invalid-credential')) {
        setError('Email ou mot de passe incorrect');
      } else if (message.includes('user-not-found')) {
        setError('Aucun compte trouvé avec cet email');
      } else if (message.includes('weak-password')) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
      } else if (message.includes('invalid-email')) {
        setError('Adresse email invalide');
      } else if (message.includes('too-many-requests')) {
        setError('Trop de tentatives. Veuillez réessayer plus tard');
      } else if (message.includes('network-request-failed')) {
        setError('Erreur de connexion réseau. Vérifiez votre internet');
      } else if (message.includes('USER_DOC_NOT_FOUND')) {
        setError('Profil utilisateur introuvable après connexion. Contactez le support.');
      } else if (message.includes('PROFILE_INCOMPLETE')) {
        setError('Profil incomplet. Veuillez contacter l’administration.');
      } else if (message.includes('AUTH_SUCCESS_BUT_NO_CURRENT_USER')) {
        setError('Session invalide après connexion. Réessayez.');
      } else {
        setError('Email ou mot de passe incorrect');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'var(--background)',
    }}>
      {/* Glow */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 16 }}>
          <BizaflowLogo size={72} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
          <span className="page-header-gradient">Bizaflow</span>{' '}
          <span style={{ fontWeight: 300 }}>Telecom</span>
        </h1>
        <p style={{ color: 'var(--foreground-muted)', fontSize: '0.8rem', marginTop: 8 }}>
          Communication digitale moderne
        </p>
      </div>

      {/* Form Card */}
      <div className="glass-card" style={{
        width: '100%', maxWidth: 380, padding: 24, position: 'relative', zIndex: 1,
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          <button
            className={`filter-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); setStatusMessage(''); }}
            style={{ flex: 1, textAlign: 'center' }}
            id="tab-login"
          >
            Connexion
          </button>
          <button
            className={`filter-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); setStatusMessage(''); }}
            style={{ flex: 1, textAlign: 'center' }}
            id="tab-register"
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div>
              <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nom complet
              </label>
              <input
                className="input-field"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Kabongo"
                required
                id="auth-name"
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email
            </label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              id="auth-email"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mot de passe
            </label>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              id="auth-password"
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

          {statusMessage && !error && (
            <div style={{
              background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: 10, padding: '8px 12px', color: '#06b6d4', fontSize: '0.8rem',
              textAlign: 'center',
            }}>
              {statusMessage}
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px 20px', opacity: loading ? 0.6 : 1 }}
            id="auth-submit"
          >
            {loading ? (
              <span>Connexion en cours...</span>
            ) : mode === 'login' ? (
              'Se connecter'
            ) : (
              'Créer mon compte'
            )}
          </button>
        </form>

        {mode === 'register' && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-free">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                Numéro BZT attribué
              </span>
              <span className="badge badge-paid" style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}>
                ⏳ Validation requise
              </span>
            </div>
            <p style={{ color: 'var(--foreground-muted)', fontSize: '0.65rem', marginTop: 8 }}>
              Votre compte sera activé après validation par l&apos;administration
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: 32, position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--foreground-muted)' }}>
          Version 1.0.0 • © 2026 Bizaflow
        </div>
      </div>
    </div>
  );
}
