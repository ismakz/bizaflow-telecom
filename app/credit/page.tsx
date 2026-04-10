'use client';

import { useState } from 'react';
import { useApp } from '@/app/components/AppProvider';
import PackCard from '@/app/components/PackCard';
import { formatBalance } from '@/app/lib/utils';
import { getAvailablePacks, getActiveUserPack, getUserPackHistory, purchaseTelecomPack, type TelecomPackDoc, type TelecomUserPackDoc } from '@/app/lib/firestore';
import { useEffect } from 'react';

export default function CreditPage() {
  const { user, rechargeCredit, refreshData } = useApp();
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState('');
  const [purchaseError, setPurchaseError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [packs, setPacks] = useState<TelecomPackDoc[]>([]);
  const [activePack, setActivePack] = useState<TelecomUserPackDoc | null>(null);
  const [packHistory, setPackHistory] = useState<TelecomUserPackDoc[]>([]);

  const loadPackData = async () => {
    if (!user) return;
    const [available, active, history] = await Promise.all([
      getAvailablePacks(),
      getActiveUserPack(user.uid),
      getUserPackHistory(user.uid),
    ]);
    setPacks(available);
    setActivePack(active);
    setPackHistory(history.slice(0, 5));
  };

  useEffect(() => {
    void loadPackData();
  }, [user]);

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount);
    if (isNaN(amount) || amount <= 0) return;
    setProcessing(true);
    await rechargeCredit(amount);
    setRechargeAmount('');
    setShowRecharge(false);
    setProcessing(false);
  };

  const handlePurchase = async (pack: TelecomPackDoc) => {
    if (!user) return;
    setPurchaseError('');
    if (user.status !== 'approved') {
      setPurchaseError('Compte non approuvé');
      return;
    }
    setProcessing(true);
    try {
      await purchaseTelecomPack(user.uid, pack);
      setPurchaseSuccess(pack.name);
      await loadPackData();
      await refreshData();
      setTimeout(() => setPurchaseSuccess(''), 3000);
    } catch (err: unknown) {
      setPurchaseError(err instanceof Error ? err.message : 'Erreur achat pack');
    } finally {
      setProcessing(false);
    }
  };

  const rechargeAmounts = [5, 10, 20, 50];

  return (
    <div className="page-container">
      <div className="glow-bg" />

      <h1 className="page-header" style={{ position: 'relative', zIndex: 1 }}>
        <span className="page-header-gradient">Crédit</span>
      </h1>

      {/* Balance Card */}
      <div className="balance-card animate-slide-in" style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, position: 'relative' }}>
          Solde disponible
        </div>
        <div className="balance-amount" style={{ position: 'relative' }}>
          {user ? formatBalance(user.balance) : '$0.00'}
        </div>
        <div style={{ color: 'var(--accent-cyan)', fontSize: '0.8rem', marginTop: 8, position: 'relative', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
          {user ? user.telecomNumber : ''}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, position: 'relative' }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => setShowRecharge(true)} id="recharge-button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Recharger
          </button>
        </div>
      </div>

      {/* Recharge Modal */}
      {showRecharge && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowRecharge(false)} id="recharge-modal">
          <div className="modal-content">
            <div className="modal-handle" />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 16 }}>
              Recharger votre crédit
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {rechargeAmounts.map((amount) => (
                <button
                  key={amount}
                  className={rechargeAmount === String(amount) ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '10px 4px', fontSize: '0.875rem' }}
                  onClick={() => setRechargeAmount(String(amount))}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Autre montant
              </label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                min="0"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                placeholder="0.00"
                id="recharge-amount-input"
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowRecharge(false)} style={{ flex: 1 }}>
                Annuler
              </button>
              <button
                className="btn-primary"
                onClick={handleRecharge}
                style={{ flex: 1, opacity: rechargeAmount && parseFloat(rechargeAmount) > 0 && !processing ? 1 : 0.5 }}
                disabled={!rechargeAmount || parseFloat(rechargeAmount) <= 0 || processing}
                id="confirm-recharge"
              >
                {processing ? 'Traitement...' : `Recharger ${rechargeAmount ? `$${parseFloat(rechargeAmount).toFixed(2)}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {purchaseSuccess && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(16, 185, 129, 0.9)', color: 'white', padding: '10px 20px',
          borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, zIndex: 250,
          backdropFilter: 'blur(8px)',
        }}>
          ✓ Pack {purchaseSuccess} activé !
        </div>
      )}
      {purchaseError && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.92)', color: 'white', padding: '10px 20px',
          borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, zIndex: 250,
        }}>
          {purchaseError}
        </div>
      )}

      {/* Active Pack */}
      <div style={{
        marginBottom: 14, padding: 14, borderRadius: 14,
        background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', marginBottom: 6 }}>Pack actif</div>
        {activePack ? (
          <>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#c4b5fd' }}>{activePack.packName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, fontSize: '0.75rem' }}>
              <div>Interne restant: <b>{activePack.remainingInternalMinutes} min</b></div>
              <div>Externe restant: <b>{activePack.remainingExternalMinutes} min</b></div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Aucun pack actif</div>
        )}
      </div>

      {/* Packs */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          Packs Télécom
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {packs.map((pack, i) => (
            <PackCard
              key={pack.packId}
              pack={pack}
              canAfford={user ? user.balance >= pack.price : false}
              onPurchase={handlePurchase}
              delay={i * 80}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>Mes packs</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {packHistory.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucun historique de pack</div>
          ) : (
            packHistory.map((p) => (
              <div key={p.id} style={{
                padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '0.8rem' }}>{p.packName}</span>
                <span style={{ fontSize: '0.7rem', color: p.status === 'active' ? '#10b981' : '#94a3b8' }}>{p.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
