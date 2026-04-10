'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/app/components/AppProvider';
import { getInitials, formatRelativeTime, timestampToISO } from '@/app/lib/utils';
import { getUserTransactions, getActiveUserPack, type TelecomTransactionDoc, type TelecomUserPackDoc } from '@/app/lib/firestore';
import CallSimulator from '@/app/components/CallSimulator';
import RechargeModal from '@/app/components/RechargeModal';
import TransferModal from '@/app/components/TransferModal';

const typeLabels: Record<string, string> = {
  recharge: '💰 Recharge', transfer_in: '📥 Reçu', transfer_out: '📤 Envoyé',
  pack_purchase: '📦 Pack', bonus: '🎁 Bonus', call_charge: '📞 Appel', refund: '↩️ Remb.',
};

export default function DashboardPage() {
  const { user, contacts, calls, callState, loading } = useApp();
  const [greeting, setGreeting] = useState('Bonjour');
  const [copied, setCopied] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [recentTxs, setRecentTxs] = useState<TelecomTransactionDoc[]>([]);
  const [activePack, setActivePack] = useState<TelecomUserPackDoc | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Bonjour');
    else if (hour < 18) setGreeting('Bon après-midi');
    else setGreeting('Bonsoir');
  }, []);

  useEffect(() => {
    if (!user) return;
    getUserTransactions(user.uid).then((txs) => setRecentTxs(txs.slice(0, 5))).catch(() => {});
    getActiveUserPack(user.uid).then(setActivePack).catch(() => {});
  }, [user]);

  const copyBZT = () => {
    if (user?.telecomNumber) {
      navigator.clipboard.writeText(user.telecomNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading || !user) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060b18' }}>
        <div style={{ color: '#4a5e7a', fontSize: '0.85rem' }}>Chargement...</div>
      </div>
    );
  }

  const recentCalls = calls.filter((c) => {
    if (!c.createdAt) return false;
    return Date.now() - new Date(c.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  });
  const internalCalls = recentCalls.filter((c) => c.type === 'internal_call').length;
  const externalCalls = recentCalls.filter((c) => c.type === 'external_call').length;
  const totalSpent = calls.reduce((sum, c) => sum + c.cost, 0);
  const internalContacts = contacts.filter((c) => c.isInternal).length;

  const quickActions = [
    { label: 'Appeler', href: '/dialer', icon: '📞', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.2)' },
    { label: 'Contacts', href: '/contacts', icon: '👥', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.2)' },
    { label: 'Historique', href: '/history', icon: '📊', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)' },
    { label: 'Transactions', href: '/transactions', icon: '💳', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)' },
    { label: 'Packs', href: '/credit', icon: '📦', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)' },
    { label: 'Profil', href: '/profile', icon: '⚙️', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.2)' },
  ];

  const lastCall = calls.length > 0 ? calls[0] : null;

  return (
    <div className="page-container" style={{ paddingBottom: 90 }}>
      {callState.active && <CallSimulator />}
      <RechargeModal isOpen={showRecharge} onClose={() => setShowRecharge(false)} />
      <TransferModal isOpen={showTransfer} onClose={() => setShowTransfer(false)} />

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 800, color: 'white',
            boxShadow: '0 4px 20px rgba(6, 182, 212, 0.3)',
          }}>
            {getInitials(user.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: '#4a5e7a' }}>{greeting} 👋</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              <span style={{ background: 'linear-gradient(135deg, #06b6d4, #14b8a6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {user.name}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 8,
            background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 600 }}>En ligne</span>
          </div>
        </div>
      </div>

      {/* BZT Number */}
      <div onClick={copyBZT} style={{
        padding: '14px 16px', borderRadius: 14, marginBottom: 12, cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(20, 184, 166, 0.05))',
        border: '1px solid rgba(6, 182, 212, 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }} title="Copier le numéro">
        <div>
          <div style={{ fontSize: '0.6rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Mon numéro Bizaflow</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>{user.telecomNumber}</div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 600,
          background: copied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.12)',
          border: copied ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(6, 182, 212, 0.25)',
          color: copied ? '#10b981' : '#06b6d4',
        }}>
          {copied ? '✓ Copié' : '📋 Copier'}
        </div>
      </div>

      {/* Balance Card */}
      <div style={{
        padding: 20, borderRadius: 16, marginBottom: 16,
        background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.06), rgba(139, 92, 246, 0.04))',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Solde disponible</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, background: 'linear-gradient(135deg, #06b6d4, #14b8a6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ${user.balance.toFixed(2)}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#4a5e7a' }}>USD</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowRecharge(true)} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
            border: 'none', color: 'white', fontWeight: 700, fontSize: '0.8rem',
            boxShadow: '0 4px 16px rgba(6, 182, 212, 0.25)',
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
          <Link href="/transactions" style={{
            flex: 1, padding: '10px 0', borderRadius: 10, textAlign: 'center',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none',
          }}>
            📊 Détails
          </Link>
        </div>
      </div>

      {/* Active Pack Card */}
      <div style={{
        padding: 14, borderRadius: 14, marginBottom: 14,
        background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.22)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: '0.65rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pack actif</div>
          <Link href="/credit" style={{ color: '#c4b5fd', fontSize: '0.7rem', textDecoration: 'none' }}>Voir packs</Link>
        </div>
        {activePack ? (
          <>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{activePack.packName}</div>
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#cbd5e1' }}>
              Interne: {activePack.remainingInternalMinutes} min • Externe: {activePack.remainingExternalMinutes} min
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Aucun pack actif</div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.7rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 600 }}>Actions rapides</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {quickActions.map((a) => (
            <Link key={a.label} href={a.href} style={{
              padding: '16px 8px', borderRadius: 14, textAlign: 'center',
              background: a.bg, border: `1px solid ${a.border}`,
              textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: '1.5rem' }}>{a.icon}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: a.color }}>{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Activity Summary */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.7rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 600 }}>Résumé activité</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#06b6d4' }}>{recentCalls.length}</div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>Appels (7j)</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#8b5cf6' }}>{internalCalls}</div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>Internes</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>{externalCalls}</div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>Externes</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>${totalSpent.toFixed(2)}</div>
            <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>Coût total</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      {recentTxs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: '0.7rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Dernières transactions</div>
            <Link href="/transactions" style={{ fontSize: '0.7rem', color: '#06b6d4', textDecoration: 'none', fontWeight: 600 }}>Voir tout →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentTxs.map((tx) => {
              const isCredit = ['recharge', 'transfer_in', 'bonus', 'refund'].includes(tx.type);
              return (
                <div key={tx.id} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: '1rem' }}>{typeLabels[tx.type]?.split(' ')[0] || '💳'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{typeLabels[tx.type]?.split(' ').slice(1).join(' ') || tx.type}</div>
                    <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>
                      {formatRelativeTime(timestampToISO(tx.createdAt as { seconds: number; nanoseconds: number } | null))}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isCredit ? '#10b981' : '#f87171' }}>
                    {isCredit ? '+' : '-'}${tx.amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last Call */}
      {lastCall && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.7rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 600 }}>Dernier appel</div>
          <div style={{
            padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: lastCall.type === 'internal' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}>
              {lastCall.direction === 'outgoing' ? '📤' : '📥'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{lastCall.from === user.telecomNumber ? lastCall.toName : lastCall.fromName}</div>
              <div style={{ color: '#4a5e7a', fontSize: '0.7rem' }}>
                {lastCall.durationSeconds > 0 ? `${Math.floor(lastCall.durationSeconds / 60)}m ${lastCall.durationSeconds % 60}s` : 'Manqué'} • {lastCall.type === 'internal_call' ? 'Interne' : 'Externe'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Info */}
      <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Compte</span>
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: '0.55rem', fontWeight: 700,
            textTransform: 'uppercase', background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10b981',
          }}>{user.status}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: '#4a5e7a' }}>Email</span><span style={{ color: '#e2e8f0' }}>{user.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: '#4a5e7a' }}>Rôle</span><span style={{ color: '#06b6d4', fontWeight: 600, textTransform: 'capitalize' }}>{user.role}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: '#4a5e7a' }}>Membre depuis</span><span style={{ color: '#e2e8f0' }}>{formatRelativeTime(user.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
