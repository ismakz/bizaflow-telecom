'use client';

import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/app/lib/firebase';
import { createCEOAccount, getTelecomUser, seedTelecomPacks, seedTelecomDirectory } from '@/app/lib/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/app/lib/firebase';

const SEED_SECRET = 'BIZAFLOW-SEED-2026';
const CEO_EMAIL = 'ceo@bizaflow.app';
const CEO_PASSWORD = 'Bizaflow@2026';

type Step = {
  label: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skip';
  detail?: string;
};

export default function SeedPage() {
  const [secret, setSecret] = useState('');
  const [phase, setPhase] = useState<'input' | 'running' | 'done' | 'error'>('input');
  const [steps, setSteps] = useState<Step[]>([]);
  const [ceoNumber, setCeoNumber] = useState('');
  const [ceoUid, setCeoUid] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const updateStep = (index: number, updates: Partial<Step>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const handleSeed = async () => {
    if (secret !== SEED_SECRET) {
      setErrorMessage('Clé secrète invalide');
      return;
    }

    setPhase('running');
    setErrorMessage('');

    const initialSteps: Step[] = [
      { label: 'Vérification Firebase Auth', status: 'pending' },
      { label: 'Création / récupération du compte Auth', status: 'pending' },
      { label: 'Synchronisation Firestore', status: 'pending' },
      { label: 'Seed packs telecom', status: 'pending' },
      { label: 'Seed directory telecom', status: 'pending' },
      { label: 'Vérification finale', status: 'pending' },
    ];
    setSteps(initialSteps);

    try {
      // ── Step 1: Check if CEO exists in Firebase Auth ──
      updateStep(0, { status: 'running' });
      let uid = '';
      let accountExists = false;

      try {
        // Try to sign in — if succeeds, account exists
        const credential = await signInWithEmailAndPassword(auth, CEO_EMAIL, CEO_PASSWORD);
        uid = credential.user.uid;
        accountExists = true;
        updateStep(0, { status: 'success', detail: `Compte trouvé (UID: ${uid.slice(0, 8)}...)` });
      } catch (signInErr: unknown) {
        const msg = signInErr instanceof Error ? signInErr.message : '';
        if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
          updateStep(0, { status: 'success', detail: 'Compte non trouvé — sera créé' });
        } else {
          updateStep(0, { status: 'error', detail: `Erreur Auth: ${msg}` });
          throw signInErr;
        }
      }

      // ── Step 2: Create or confirm Auth account ──
      updateStep(1, { status: 'running' });

      if (accountExists) {
        updateStep(1, { status: 'skip', detail: `Compte existe déjà (UID: ${uid.slice(0, 8)}...)` });
      } else {
        try {
          const credential = await createUserWithEmailAndPassword(auth, CEO_EMAIL, CEO_PASSWORD);
          uid = credential.user.uid;
          await updateProfile(credential.user, { displayName: 'CEO Bizaflow' });
          updateStep(1, { status: 'success', detail: `Compte créé (UID: ${uid.slice(0, 8)}...)` });
        } catch (createErr: unknown) {
          const msg = createErr instanceof Error ? createErr.message : '';
          if (msg.includes('email-already-in-use')) {
            // Account exists but password might be different — try signing in again
            updateStep(1, { status: 'error', detail: 'Le compte existe mais le mot de passe ne correspond pas. Réinitialisez dans Firebase Console.' });
            throw new Error('Compte CEO existe avec un mot de passe différent');
          }
          updateStep(1, { status: 'error', detail: msg });
          throw createErr;
        }
      }

      setCeoUid(uid);

      // ── Step 3: Sync Firestore ──
      updateStep(2, { status: 'running' });

      const existingProfile = await getTelecomUser(uid);

      if (existingProfile && existingProfile.role === 'ceo') {
        updateStep(2, { status: 'skip', detail: `Document Firestore existe (${existingProfile.telecomNumber})` });
        setCeoNumber(existingProfile.telecomNumber);
      } else if (existingProfile) {
        // Document exists but wrong role — fix it
        await setDoc(doc(db, 'telecom_users', uid), {
          ...existingProfile,
          role: 'ceo',
          status: 'approved',
          mustChangePassword: true,
        }, { merge: true });
        updateStep(2, { status: 'success', detail: `Document mis à jour → role=ceo` });
        setCeoNumber(existingProfile.telecomNumber);
      } else {
        // Create CEO document
        const profile = await createCEOAccount(uid, 'CEO Bizaflow', CEO_EMAIL);
        setCeoNumber(profile.telecomNumber);
        updateStep(2, { status: 'success', detail: `Document créé (${profile.telecomNumber})` });
      }

      // ── Step 4: Seed telecom packs ──
      updateStep(3, { status: 'running' });
      const seeded = await seedTelecomPacks();
      updateStep(3, { status: 'success', detail: `${seeded} packs synchronisés` });

      // ── Step 5: Final verification ──
      updateStep(4, { status: 'running' });
      const syncedDirectory = await seedTelecomDirectory();
      updateStep(4, { status: 'success', detail: `${syncedDirectory} entrées répertoire synchronisées` });

      // ── Step 6: Final verification ──
      updateStep(5, { status: 'running' });

      const finalProfile = await getTelecomUser(uid);
      if (finalProfile && finalProfile.role === 'ceo' && finalProfile.status === 'approved') {
        updateStep(5, { status: 'success', detail: 'CEO vérifié ✓ role=ceo, status=approved' });
        setPhase('done');
      } else {
        updateStep(5, { status: 'error', detail: 'Profil CEO incomplet après synchronisation' });
        setPhase('error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setErrorMessage(msg);
      setPhase('error');
    }
  };

  const stepStatusIcon = (status: Step['status']) => {
    switch (status) {
      case 'pending': return '⚪';
      case 'running': return '🔵';
      case 'success': return '✅';
      case 'error': return '❌';
      case 'skip': return '⏭️';
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
        background: 'radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative', zIndex: 1 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '1.5rem', fontWeight: 900, color: 'white',
          boxShadow: '0 8px 32px rgba(239, 68, 68, 0.3)',
        }}>
          ⚡
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
          Seed CEO Account
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.75rem', marginTop: 4 }}>
          Initialisation du Super Admin — Firebase Auth + Firestore
        </p>
      </div>

      {/* Content */}
      <div style={{
        width: '100%', maxWidth: 420, padding: 24, borderRadius: 16,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)', position: 'relative', zIndex: 1,
      }}>

        {/* Input Phase */}
        {phase === 'input' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.7rem', color: '#4a5e7a', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Clé secrète
              </label>
              <input
                className="input-field"
                type="password"
                value={secret}
                onChange={(e) => { setSecret(e.target.value); setErrorMessage(''); }}
                placeholder="Entrez la clé d'initialisation"
                id="seed-secret"
              />
            </div>

            {errorMessage && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 10, padding: '8px 12px', marginBottom: 16, color: '#f87171', fontSize: '0.8rem',
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{
              background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.15)',
              borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: '0.7rem', color: '#4a5e7a',
            }}>
              <div style={{ marginBottom: 4 }}>📧 Email: <strong style={{ color: '#06b6d4' }}>{CEO_EMAIL}</strong></div>
              <div>🔑 Mot de passe: <strong style={{ color: '#06b6d4' }}>{CEO_PASSWORD}</strong></div>
            </div>

            <div style={{
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 10, padding: '10px 12px', marginBottom: 16,
              color: '#f87171', fontSize: '0.7rem',
            }}>
              ⚠️ Assurez-vous que Firebase Email/Password Auth est activé dans votre console Firebase.
            </div>

            <button className="btn-primary" onClick={handleSeed} style={{ width: '100%' }} id="seed-button">
              Initialiser le compte CEO
            </button>
          </>
        )}

        {/* Running / Done / Error Phases */}
        {phase !== 'input' && (
          <>
            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {steps.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: step.status === 'error' ? 'rgba(239, 68, 68, 0.06)' :
                    step.status === 'success' ? 'rgba(16, 185, 129, 0.04)' :
                    'rgba(255,255,255,0.02)',
                  border: `1px solid ${step.status === 'error' ? 'rgba(239, 68, 68, 0.15)' :
                    step.status === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                    'rgba(255,255,255,0.04)'}`,
                }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>
                    {stepStatusIcon(step.status)}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{step.label}</div>
                    {step.detail && (
                      <div style={{ fontSize: '0.65rem', color: step.status === 'error' ? '#f87171' : '#4a5e7a', marginTop: 2 }}>
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Error */}
            {phase === 'error' && errorMessage && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 10, padding: '10px 12px', marginBottom: 16,
                color: '#f87171', fontSize: '0.8rem',
              }}>
                {errorMessage}
              </div>
            )}

            {phase === 'error' && (
              <button className="btn-secondary" onClick={() => { setPhase('input'); setSteps([]); setErrorMessage(''); }} style={{ width: '100%' }}>
                Réessayer
              </button>
            )}

            {/* Success */}
            {phase === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)',
                  borderRadius: 12, padding: 16, marginBottom: 16,
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    ✅ Compte CEO prêt
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                    📧 <strong>{CEO_EMAIL}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                    🔑 <strong>{CEO_PASSWORD}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#06b6d4', fontFamily: 'monospace', fontWeight: 700, marginBottom: 4 }}>
                    📞 {ceoNumber}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>
                    UID: {ceoUid}
                  </div>
                </div>

                <a href="/login" style={{
                  display: 'inline-block', padding: '10px 24px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
                  color: 'white', fontWeight: 600, textDecoration: 'none', fontSize: '0.85rem',
                }}>
                  → Se connecter en tant que CEO
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
