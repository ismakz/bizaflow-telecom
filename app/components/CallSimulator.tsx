'use client';

import { useState, useEffect } from 'react';
import { useApp } from './AppProvider';
import { detectOperator, CALL_RATES, getInitials } from '@/app/lib/utils';
import type { OperatorId } from '@/app/lib/utils';
import { getProviderRuntimeInfo } from '@/app/lib/voiceProvider';

export default function CallSimulator() {
  const { callState, endCall, user, answerIncomingCall, rejectIncomingCall } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [incomingAction, setIncomingAction] = useState<'idle' | 'answering' | 'rejecting'>('idle');

  const incomingRinging = callState.phase === 'ringing' && callState.direction === 'incoming' && callState.isInternal;

  useEffect(() => {
    if (!incomingRinging) setIncomingAction('idle');
  }, [incomingRinging]);

  useEffect(() => {
    if (!callState.active || callState.phase !== 'connected') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - callState.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callState.active, callState.phase, callState.startTime]);

  if (!callState.active || !callState.contact) return null;

  const operator = detectOperator(callState.contact.phone);
  const rate = CALL_RATES[operator.id as OperatorId];
  const providerInfo = getProviderRuntimeInfo();
  const effectiveElapsed = callState.phase === 'connected' ? elapsed : 0;
  const minutes = Math.ceil(effectiveElapsed / 60);
  const currentCost = callState.isInternal ? 0 : Math.round(minutes * rate * 100) / 100;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'linear-gradient(180deg, #060b18 0%, #0c1528 50%, #060b18 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', padding: '60px 24px 40px',
    }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 300, height: 300,
        background: callState.phase === 'ringing'
          ? 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
        animation: callState.phase === 'ringing' ? 'pulse 2s infinite' : 'none',
      }} />
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); } 50% { opacity: 1; transform: translateX(-50%) scale(1.1); } }`}</style>

      {/* Top info */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Operator badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20, marginBottom: 16,
          background: `${operator.color}12`, border: `1px solid ${operator.color}30`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: operator.color }} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: operator.color }}>
            {operator.name}
          </span>
        </div>

        {/* Avatar */}
        <div style={{
          width: 90, height: 90, borderRadius: '50%', margin: '0 auto 16px',
          background: callState.isInternal
            ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(20, 184, 166, 0.1))'
            : `linear-gradient(135deg, ${operator.color}20, ${operator.color}10)`,
          border: `2px solid ${callState.isInternal ? 'rgba(6, 182, 212, 0.3)' : `${operator.color}40`}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem', fontWeight: 800,
          color: callState.isInternal ? '#06b6d4' : operator.color,
        }}>
          {getInitials(callState.contact.name)}
        </div>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 4px' }}>
          {callState.contact.name}
        </h2>
        <div style={{ color: '#4a5e7a', fontSize: '0.8rem', fontFamily: 'monospace' }}>
          {callState.contact.phone}
        </div>
      </div>

      {/* Phase Display */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {callState.phase === 'ringing' ? (
          <div>
            <div style={{ fontSize: '0.9rem', color: '#06b6d4', fontWeight: 600, marginBottom: 8 }}>
              {callState.direction === 'incoming' ? 'Appel entrant...' : 'Appel en cours...'}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#06b6d4',
                  animation: `pulse 1.5s ${i * 0.3}s infinite`,
                  opacity: 0.5,
                }} />
              ))}
            </div>
            {callState.direction === 'incoming' && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', maxWidth: 280, textAlign: 'center', lineHeight: 1.4 }}>
                  Choisissez d’accepter ou de refuser l’appel.
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={incomingAction !== 'idle'}
                    onClick={() => {
                      setIncomingAction('answering');
                      void answerIncomingCall().finally(() => setIncomingAction('idle'));
                    }}
                    style={{
                      padding: '12px 22px',
                      borderRadius: 999,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: 'white',
                      border: 'none',
                      fontWeight: 700,
                      cursor: incomingAction !== 'idle' ? 'wait' : 'pointer',
                      opacity: incomingAction !== 'idle' && incomingAction !== 'answering' ? 0.5 : 1,
                    }}
                  >
                    {incomingAction === 'answering' ? 'Connexion…' : 'Accepter'}
                  </button>
                  <button
                    type="button"
                    disabled={incomingAction !== 'idle'}
                    onClick={() => {
                      setIncomingAction('rejecting');
                      void rejectIncomingCall().finally(() => setIncomingAction('idle'));
                    }}
                    style={{
                      padding: '12px 22px',
                      borderRadius: 999,
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: 'white',
                      border: 'none',
                      fontWeight: 700,
                      cursor: incomingAction !== 'idle' ? 'wait' : 'pointer',
                      opacity: incomingAction !== 'idle' && incomingAction !== 'rejecting' ? 0.5 : 1,
                    }}
                  >
                    {incomingAction === 'rejecting' ? 'Refus…' : 'Refuser'}
                  </button>
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Accepter = décrocher • Refuser = raccrocher sans répondre
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '0.75rem', color: '#10b981', marginBottom: 8 }}>
              En communication
            </div>
            <div style={{
              fontSize: '3rem', fontWeight: 200, color: '#e2e8f0',
              fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.1em',
            }}>
              {formatTime(effectiveElapsed)}
            </div>

            {/* Cost display */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {callState.isInternal ? (
                <span style={{
                  padding: '4px 12px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 600,
                  background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#10b981',
                }}>
                  ✓ Appel gratuit (BZT)
                </span>
              ) : (
                <>
                  <span style={{
                    padding: '4px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                  }}>
                    -${currentCost.toFixed(2)}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>
                    ${rate}/min
                  </span>
                  <span style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: '0.6rem',
                    background: providerInfo.mode === 'mock' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                    border: providerInfo.mode === 'mock' ? '1px solid rgba(99, 102, 241, 0.22)' : '1px solid rgba(16, 185, 129, 0.22)',
                    color: providerInfo.mode === 'mock' ? '#818cf8' : '#10b981',
                  }}>
                    {providerInfo.mode === 'mock' ? 'Appel externe simulé' : 'Appel externe réel'}
                  </span>
                </>
              )}
            </div>

            {!callState.isInternal && providerInfo.mode === 'mock' && (
              <div style={{ marginTop: 8, fontSize: '0.65rem', color: '#94a3b8' }}>
                Mode test : aucun téléphone réel ne sonnera
              </div>
            )}

            {/* Balance */}
            {user && (
              <div style={{ fontSize: '0.65rem', color: '#4a5e7a', marginTop: 6 }}>
                Solde: ${(user.balance - currentCost).toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Raccrocher / Annuler : pendant la sonnerie entrante, seuls Accepter / Refuser s’affichent plus haut */}
      {!incomingRinging && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <button
            type="button"
            onClick={endCall}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(239, 68, 68, 0.35)',
              transition: 'transform 0.2s',
            }}
            id="end-call-button"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.69 8.41 7.62 6.5 12 6.5s8.31 1.91 11.71 5.22c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.991.991 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.7rem', color: '#f87171', fontWeight: 500 }}>
            {callState.phase === 'ringing' && callState.direction === 'outgoing' ? 'Annuler' : 'Raccrocher'}
          </div>
        </div>
      )}
    </div>
  );
}
