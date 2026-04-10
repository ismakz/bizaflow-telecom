'use client';

import { useState } from 'react';
import { useApp } from './AppProvider';
import { performRecharge } from '@/app/lib/firestore';

const presets = [1, 2, 5, 10, 20, 50];

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RechargeModal({ isOpen, onClose }: RechargeModalProps) {
  const { user, refreshData } = useApp();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !user) return null;

  const handleRecharge = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('Montant invalide'); return; }
    if (value > 1000) { setError('Montant maximum: $1000'); return; }

    setError('');
    setLoading(true);
    try {
      await performRecharge(user.uid, value, `Recharge de $${value.toFixed(2)}`);
      await refreshData();
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setAmount(''); onClose(); }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de recharge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: 24, borderRadius: '20px 20px 0 0',
        background: '#0c1528', border: '1px solid rgba(255,255,255,0.06)',
        animation: 'slideUp 0.3s ease',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
            💰 <span style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Recharger</span>
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4a5e7a', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Current Balance */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.12)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>Solde actuel</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#06b6d4' }}>${user.balance.toFixed(2)}</span>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1rem' }}>Recharge réussie !</div>
            <div style={{ color: '#4a5e7a', fontSize: '0.8rem', marginTop: 4 }}>+${parseFloat(amount).toFixed(2)} ajouté</div>
          </div>
        ) : (
          <>
            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p.toString())}
                  style={{
                    padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                    background: amount === p.toString() ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: amount === p.toString() ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: amount === p.toString() ? '#06b6d4' : '#e2e8f0',
                    fontWeight: 700, fontSize: '1rem', transition: 'all 0.15s',
                  }}
                >
                  ${p}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
                Montant personnalisé
              </label>
              <input
                className="input-field"
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                placeholder="0.00"
                min="0.50"
                step="0.50"
                id="recharge-amount"
                style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 8, padding: '6px 10px', marginBottom: 14, color: '#f87171', fontSize: '0.8rem',
              }}>
                {error}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleRecharge}
              disabled={loading || !amount}
              style={{ width: '100%', padding: '14px 20px', opacity: loading || !amount ? 0.5 : 1 }}
              id="recharge-submit"
            >
              {loading ? 'Recharge en cours...' : `Recharger $${parseFloat(amount || '0').toFixed(2)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
