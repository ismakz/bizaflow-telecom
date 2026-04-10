'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { getUserTransactions, type TelecomTransactionDoc } from '@/app/lib/firestore';
import { timestampToISO, formatRelativeTime } from '@/app/lib/utils';
import RechargeModal from '@/app/components/RechargeModal';
import TransferModal from '@/app/components/TransferModal';
import type { TransactionType } from '@/app/lib/types';

type FilterType = 'all' | TransactionType;

const typeLabels: Record<string, string> = {
  recharge: '💰 Recharge',
  transfer_in: '📥 Transfert reçu',
  transfer_out: '📤 Transfert envoyé',
  pack_purchase: '📦 Achat pack',
  bonus: '🎁 Bonus',
  adjustment: '⚙️ Ajustement',
  call_charge: '📞 Frais d\'appel',
  refund: '↩️ Remboursement',
};

const typeColors: Record<string, string> = {
  recharge: '#10b981',
  transfer_in: '#06b6d4',
  transfer_out: '#f59e0b',
  pack_purchase: '#8b5cf6',
  bonus: '#10b981',
  adjustment: '#6b7280',
  call_charge: '#ef4444',
  refund: '#3b82f6',
};

const filterOptions: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'recharge', label: 'Recharges' },
  { value: 'transfer_out', label: 'Envoyés' },
  { value: 'transfer_in', label: 'Reçus' },
  { value: 'pack_purchase', label: 'Packs' },
  { value: 'bonus', label: 'Bonus' },
];

export default function TransactionsPage() {
  const { user } = useApp();
  const [transactions, setTransactions] = useState<TelecomTransactionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showRecharge, setShowRecharge] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const txs = await getUserTransactions(user.uid);
      setTransactions(txs);
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.type === filter);

  // Summary
  const totalRecharges = transactions.filter((t) => t.type === 'recharge' && t.status === 'success').reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === 'transfer_out' && t.status === 'success').reduce((s, t) => s + t.amount, 0);
  const totalIn = transactions.filter((t) => t.type === 'transfer_in' && t.status === 'success').reduce((s, t) => s + t.amount, 0);

  if (!user) return null;

  return (
    <div className="page-container" style={{ paddingBottom: 90 }}>
      <RechargeModal isOpen={showRecharge} onClose={() => { setShowRecharge(false); loadTransactions(); }} />
      <TransferModal isOpen={showTransfer} onClose={() => { setShowTransfer(false); loadTransactions(); }} />

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
          <span className="page-header-gradient">Transactions</span>
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.7rem', marginTop: 2 }}>{user.telecomNumber}</p>
      </div>

      {/* Balance + Actions */}
      <div style={{
        padding: 18, borderRadius: 16, marginBottom: 16,
        background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.06), rgba(139, 92, 246, 0.04))',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: '0.6rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Solde
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#06b6d4', marginBottom: 14 }}>
          ${user.balance.toFixed(2)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowRecharge(true)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            background: 'linear-gradient(135deg, #06b6d4, #10b981)',
            border: 'none', color: 'white', fontWeight: 700, fontSize: '0.8rem',
          }}>
            💰 Recharger
          </button>
          <button onClick={() => setShowTransfer(true)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)',
            color: '#8b5cf6', fontWeight: 700, fontSize: '0.8rem',
          }}>
            💸 Transférer
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>${totalRecharges.toFixed(2)}</div>
          <div style={{ fontSize: '0.55rem', color: '#4a5e7a', textTransform: 'uppercase' }}>Recharges</div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>${totalOut.toFixed(2)}</div>
          <div style={{ fontSize: '0.55rem', color: '#4a5e7a', textTransform: 'uppercase' }}>Envoyés</div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#06b6d4' }}>${totalIn.toFixed(2)}</div>
          <div style={{ fontSize: '0.55rem', color: '#4a5e7a', textTransform: 'uppercase' }}>Reçus</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
        {filterOptions.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: '0.7rem', fontWeight: filter === f.value ? 700 : 500,
              background: filter === f.value ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.03)',
              border: filter === f.value ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid rgba(255,255,255,0.06)',
              color: filter === f.value ? '#06b6d4' : '#4a5e7a',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
          <div style={{ color: '#4a5e7a', fontSize: '0.85rem' }}>Aucune transaction</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((tx) => {
            const isCredit = ['recharge', 'transfer_in', 'bonus', 'refund'].includes(tx.type);
            const color = typeColors[tx.type] || '#4a5e7a';

            return (
              <div
                key={tx.id}
                style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `${color}12`, border: `1px solid ${color}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.9rem',
                }}>
                  {typeLabels[tx.type]?.charAt(0) || '💳'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {typeLabels[tx.type] || tx.type}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#4a5e7a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isCredit ? '#10b981' : '#f87171' }}>
                    {isCredit ? '+' : '-'}${tx.amount.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: '#4a5e7a' }}>
                    {formatRelativeTime(timestampToISO(tx.createdAt as { seconds: number; nanoseconds: number } | null))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
