'use client';

import { useState } from 'react';
import { useApp } from './AppProvider';
import { getUserByTelecomNumber, performTransfer } from '@/app/lib/firestore';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransferModal({ isOpen, onClose }: TransferModalProps) {
  const { user, contacts, refreshData, showToast } = useApp();
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [targetBZT, setTargetBZT] = useState('');
  const [amount, setAmount] = useState('');
  const [targetName, setTargetName] = useState('');
  const [targetUid, setTargetUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  if (!isOpen || !user) return null;

  const internalContacts = contacts.filter((c) => c.isInternal && c.contactUid);

  const handleLookup = async () => {
    if (!targetBZT.trim()) return;
    setError('');
    setSearching(true);

    try {
      const normalized = targetBZT.toUpperCase().startsWith('BZT-') ? targetBZT.toUpperCase() : `BZT-${targetBZT}`;
      const found = await getUserByTelecomNumber(normalized);

      if (!found) { setError('Numéro BZT introuvable'); setSearching(false); return; }
      if (found.uid === user.uid) { setError('Transfert vers soi-même interdit'); setSearching(false); return; }
      if (found.status !== 'approved') { setError('Ce compte n\'est pas actif'); setSearching(false); return; }

      setTargetBZT(normalized);
      setTargetName(found.name);
      setTargetUid(found.uid);
    } catch {
      setError('Erreur de recherche');
    } finally {
      setSearching(false);
    }
  };

  const selectContact = (contactUid: string, phone: string, name: string) => {
    setTargetBZT(phone);
    setTargetName(name);
    setTargetUid(contactUid);
  };

  const handleConfirm = () => {
    if (user.status !== 'approved') { setError('Compte non approuvé'); return; }
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('Montant invalide'); return; }
    if (value > user.balance) { setError('Solde insuffisant'); return; }
    if (!targetUid) { setError('Destinataire non sélectionné'); return; }
    setError('');
    setStep('confirm');
  };

  const handleTransfer = async () => {
    if (user.status !== 'approved') { setError('Compte non approuvé'); return; }
    const value = parseFloat(amount);
    setLoading(true);
    setError('');
    try {
      await performTransfer(
        user.uid, targetUid, value,
        user.telecomNumber, targetBZT,
        user.name, targetName
      );
      await refreshData();
      showToast({
        message: `Transfert de $${value.toFixed(2)} envoyé à ${targetName}`,
        variant: 'success',
      });
      setStep('success');
      setTimeout(() => { setStep('input'); setAmount(''); setTargetBZT(''); setTargetName(''); setTargetUid(''); onClose(); }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de transfert');
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('input');
    setAmount('');
    setTargetBZT('');
    setTargetName('');
    setTargetUid('');
    setError('');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: 24, borderRadius: '20px 20px 0 0',
        background: '#0c1528', border: '1px solid rgba(255,255,255,0.06)',
        animation: 'slideUp 0.3s ease', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
            💸 <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Transférer</span>
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: '#4a5e7a', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Balance */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.12)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>Solde disponible</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#06b6d4' }}>${user.balance.toFixed(2)}</span>
        </div>

        {step === 'success' ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1rem' }}>Transfert réussi !</div>
            <div style={{ color: '#4a5e7a', fontSize: '0.8rem', marginTop: 4 }}>
              ${parseFloat(amount).toFixed(2)} → {targetName}
            </div>
          </div>
        ) : step === 'confirm' ? (
          <div>
            <div style={{
              padding: 16, borderRadius: 14, marginBottom: 16,
              background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.15)',
            }}>
              <div style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', marginBottom: 12 }}>Confirmer le transfert</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem' }}>
                <span style={{ color: '#4a5e7a' }}>Destinataire</span>
                <span style={{ fontWeight: 700 }}>{targetName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem' }}>
                <span style={{ color: '#4a5e7a' }}>Numéro</span>
                <span style={{ color: '#06b6d4', fontFamily: 'monospace', fontWeight: 700 }}>{targetBZT}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: '#4a5e7a' }}>Montant</span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f59e0b' }}>${parseFloat(amount).toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, padding: '6px 10px', marginBottom: 14, color: '#f87171', fontSize: '0.8rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep('input')} className="btn-secondary" style={{ flex: 1, padding: '12px 0' }}>
                Annuler
              </button>
              <button onClick={handleTransfer} className="btn-primary" disabled={loading} style={{ flex: 1, padding: '12px 0', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Transfert...' : 'Confirmer'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Target Input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
                Numéro BZT destinataire
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input-field"
                  value={targetBZT}
                  onChange={(e) => { setTargetBZT(e.target.value); setTargetUid(''); setTargetName(''); setError(''); }}
                  placeholder="BZT-10002"
                  style={{ flex: 1 }}
                  id="transfer-target"
                />
                <button onClick={handleLookup} disabled={searching} style={{
                  padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
                  color: '#06b6d4', fontWeight: 600, fontSize: '0.75rem',
                }}>
                  {searching ? '...' : '🔍'}
                </button>
              </div>
            </div>

            {/* Found Target */}
            {targetName && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>
                  {targetName.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{targetName}</div>
                  <div style={{ fontSize: '0.7rem', color: '#06b6d4', fontFamily: 'monospace' }}>{targetBZT}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: '0.8rem' }}>✓</span>
              </div>
            )}

            {/* Quick Contacts */}
            {!targetUid && internalContacts.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', marginBottom: 6 }}>Contacts BZT</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {internalContacts.slice(0, 4).map((c) => (
                    <button key={c.id} onClick={() => selectContact(c.contactUid!, c.phone, c.name)} style={{
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#e2e8f0', fontSize: '0.7rem', fontWeight: 500,
                    }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Amount */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
                Montant à transférer
              </label>
              <input
                className="input-field"
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                placeholder="0.00"
                min="0.10"
                step="0.10"
                id="transfer-amount"
                style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, padding: '6px 10px', marginBottom: 14, color: '#f87171', fontSize: '0.8rem' }}>
                {error}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleConfirm}
              disabled={!targetUid || !amount}
              style={{ width: '100%', padding: '14px 20px', opacity: !targetUid || !amount ? 0.5 : 1 }}
              id="transfer-submit"
            >
              Continuer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
