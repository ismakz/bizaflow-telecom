'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/app/components/AppProvider';
import { getPackAnalytics, getSystemStats, getUsersByStatus, type PackAnalytics, type TelecomUserDoc } from '@/app/lib/firestore';
import { formatRelativeTime, timestampToISO } from '@/app/lib/utils';
import type { SystemStats } from '@/app/lib/types';

const cardBase = {
  padding: 16,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
} satisfies React.CSSProperties;

export default function CEODashboard() {
  const { user } = useApp();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentPending, setRecentPending] = useState<TelecomUserDoc[]>([]);
  const [packAnalytics, setPackAnalytics] = useState<PackAnalytics>({ topPacks: [], topSubscribers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (user?.role !== 'ceo') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [systemStats, pending, packData] = await Promise.all([
        getSystemStats(),
        getUsersByStatus('pending'),
        getPackAnalytics(),
      ]);
      setStats(systemStats);
      setRecentPending(pending.slice(0, 5));
      setPackAnalytics(packData);
    } catch (err) {
      console.error('Error loading CEO dashboard:', err);
      setError('Impossible de charger le dashboard CEO.');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== 'ceo') return null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
        <div style={{ color: '#4a5e7a', fontSize: '0.85rem' }}>Chargement du dashboard...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ ...cardBase, color: '#f87171', fontSize: '0.85rem' }}>
        {error || 'Dashboard indisponible.'}
      </div>
    );
  }

  const statCards = [
    { label: 'Utilisateurs', value: stats.totalUsers, color: '#06b6d4', tag: 'USR' },
    { label: 'En attente', value: stats.pendingUsers, color: '#f59e0b', tag: 'WAIT' },
    { label: 'Approuves', value: stats.approvedUsers, color: '#10b981', tag: 'OK' },
    { label: 'Rejetes', value: stats.rejectedUsers, color: '#ef4444', tag: 'NO' },
    { label: 'Numeros BZT', value: stats.totalBZTNumbers, color: '#8b5cf6', tag: 'BZT' },
    { label: 'Total appels', value: stats.totalCalls, color: '#3b82f6', tag: 'CALL' },
    { label: 'Appels internes', value: stats.totalInternalCalls, color: '#06b6d4', tag: 'IN' },
    { label: 'Appels externes', value: stats.totalExternalCalls, color: '#f59e0b', tag: 'OUT' },
    { label: 'Appels manques', value: stats.missedCalls, color: '#ef4444', tag: 'MISS' },
    { label: 'Appels echoues', value: stats.failedCalls, color: '#7c3aed', tag: 'FAIL' },
    { label: 'Revenus telecom', value: `$${stats.totalRevenue.toFixed(2)}`, color: '#10b981', tag: 'USD' },
    { label: 'Packs vendus', value: stats.totalPacksSold, color: '#8b5cf6', tag: 'PACK' },
    { label: 'Revenus packs', value: `$${stats.packRevenue.toFixed(2)}`, color: '#22c55e', tag: 'REV' },
    { label: 'Packs actifs', value: stats.activePacks, color: '#14b8a6', tag: 'ON' },
    { label: 'Packs expires', value: stats.expiredPacks, color: '#64748b', tag: 'EXP' },
    { label: 'Suspendus', value: stats.suspendedUsers, color: '#6b7280', tag: 'SUS' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            <span style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Dashboard CEO
            </span>
          </h1>
          <p style={{ color: '#4a5e7a', fontSize: '0.78rem', margin: '6px 0 0' }}>
            Pilotage rapide de Bizaflow Telecom
          </p>
        </div>
        <button
          onClick={load}
          style={{
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#06b6d4', fontWeight: 700, fontSize: '0.75rem',
          }}
        >
          Recharger
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10, marginBottom: 24,
      }}>
        {statCards.map((card) => (
          <div key={card.label} style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ minWidth: 34, fontSize: '0.62rem', color: card.color, fontWeight: 900, letterSpacing: '0.04em' }}>{card.tag}</span>
              <span style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Demandes recentes</h2>
          {recentPending.length > 0 && (
            <Link href="/ceo/requests" style={{ fontSize: '0.75rem', color: '#06b6d4', textDecoration: 'none', fontWeight: 600 }}>
              Voir tout
            </Link>
          )}
        </div>

        {recentPending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#4a5e7a', fontSize: '0.85rem' }}>
            Aucune demande en attente
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentPending.map((pendingUser) => {
              const safeName = pendingUser.name || pendingUser.email || 'Utilisateur';
              return (
                <div
                  key={pendingUser.uid}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(245, 158, 11, 0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', flexShrink: 0,
                  }}>
                    {safeName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{safeName}</div>
                    <div style={{ color: '#4a5e7a', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingUser.email}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#06b6d4', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {pendingUser.telecomNumber || 'BZT-?'}
                    </div>
                    <div style={{ color: '#4a5e7a', fontSize: '0.6rem' }}>
                      {formatRelativeTime(timestampToISO(pendingUser.createdAt as { seconds: number; nanoseconds: number } | null))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={cardBase}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Top packs</div>
          {packAnalytics.topPacks.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucune donnee</div>
          ) : packAnalytics.topPacks.map((pack) => (
            <div key={pack.packName} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem', marginBottom: 6 }}>
              <span>{pack.packName}</span><b>{pack.count}</b>
            </div>
          ))}
        </div>
        <div style={cardBase}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Top abonnes</div>
          {packAnalytics.topSubscribers.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucune donnee</div>
          ) : packAnalytics.topSubscribers.map((subscriber) => (
            <div key={subscriber.userId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.8rem', marginBottom: 6 }}>
              <span>{subscriber.telecomNumber}</span><b>{subscriber.count}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
