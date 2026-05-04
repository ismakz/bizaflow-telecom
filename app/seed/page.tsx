'use client';

import { useState } from 'react';

type SeedStep = {
  label: string;
  status: 'success' | 'skip';
  detail?: string;
};

type SeedResult = {
  ok: true;
  ceoEmail: string;
  temporaryPassword: string;
  telecomNumber: string;
  uid: string;
  steps: SeedStep[];
};

export default function SeedPage() {
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<SeedResult | null>(null);

  const handleSeed = async () => {
    setLoading(true);
    setErrorMessage('');
    setResult(null);

    try {
      const response = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Initialisation impossible');
      }

      setResult(data as SeedResult);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#060b18',
      color: '#e2e8f0',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        padding: 24,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '1.5rem',
            fontWeight: 900,
            color: 'white',
          }}>
            B
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            Initialisation CEO
          </h1>
          <p style={{ color: '#4a5e7a', fontSize: '0.75rem', marginTop: 4 }}>
            Creation du compte administrateur et synchronisation des donnees de base
          </p>
        </div>

        {!result && (
          <>
            <label style={{
              fontSize: '0.7rem',
              color: '#4a5e7a',
              marginBottom: 6,
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Cle secrete
            </label>
            <input
              className="input-field"
              type="password"
              value={secret}
              onChange={(event) => {
                setSecret(event.target.value);
                setErrorMessage('');
              }}
              placeholder="Entrez la cle d'initialisation"
              id="seed-secret"
            />

            {errorMessage && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 10,
                padding: '8px 12px',
                marginTop: 14,
                color: '#f87171',
                fontSize: '0.8rem',
              }}>
                {errorMessage}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleSeed}
              disabled={loading || !secret.trim()}
              style={{ width: '100%', marginTop: 18, opacity: loading || !secret.trim() ? 0.6 : 1 }}
              id="seed-button"
            >
              {loading ? 'Initialisation...' : 'Initialiser le compte CEO'}
            </button>
          </>
        )}

        {result && (
          <div>
            <div style={{
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Compte CEO pret
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                Email: <strong>{result.ceoEmail}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                Mot de passe temporaire: <strong>{result.temporaryPassword}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#06b6d4', fontFamily: 'monospace', fontWeight: 700, marginBottom: 4 }}>
                {result.telecomNumber}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>
                UID: {result.uid}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {result.steps.map((step) => (
                <div key={step.label} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontSize: '0.75rem',
                }}>
                  <span>{step.label}</span>
                  <span style={{ color: step.status === 'skip' ? '#f59e0b' : '#10b981' }}>
                    {step.detail || step.status}
                  </span>
                </div>
              ))}
            </div>

            <a href="/login" style={{
              display: 'block',
              textAlign: 'center',
              padding: '10px 24px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
              color: 'white',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}>
              Se connecter
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
