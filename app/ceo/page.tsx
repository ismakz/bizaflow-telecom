'use client';

import { useState, useEffect } from 'react';
import { getSystemStats, getUsersByStatus, getPackAnalytics, type TelecomUserDoc, type PackAnalytics } from '@/app/lib/firestore';
import { timestampToISO, formatRelativeTime } from '@/app/lib/utils';
import type { SystemStats } from '@/app/lib/types';

export default function CEODashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentPending, setRecentPending] = useState<TelecomUserDoc[]>([]);
  const [packAnalytics, setPackAnalytics] = useState<PackAnalytics>({ topPacks: [], topSubscribers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, pending, packData] = await Promise.all([
          getSystemStats(),
          getUsersByStatus('pending'),
          getPackAnalytics(),
        ]);
        setStats(s);
        setRecentPending(pending.slice(0, 5));
        setPackAnalytics(packData);
      } catch (err) {
        console.error('Error loading stats:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
        <div style={{ color: '#4a5e7a', fontSize: '0.85rem' }}>Chargement du dashboard...</div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: 'Total Utilisateurs', value: stats.totalUsers, color: '#06b6d4', icon: '👥' },
    { label: 'En Attente', value: stats.pendingUsers, color: '#f59e0b', icon: '⏳' },
    { label: 'Approuvés', value: stats.approvedUsers, color: '#10b981', icon: '✅' },
    { label: 'Rejetés', value: stats.rejectedUsers, color: '#ef4444', icon: '❌' },
    { label: 'Numéros BZT', value: stats.totalBZTNumbers, color: '#8b5cf6', icon: '📞' },
    { label: 'Total Appels', value: stats.totalCalls, color: '#3b82f6', icon: '📊' },
    { label: 'Appels internes', value: stats.totalInternalCalls, color: '#06b6d4', icon: '🔁' },
    { label: 'Appels externes', value: stats.totalExternalCalls, color: '#f59e0b', icon: '🌍' },
    { label: 'Appels manqués', value: stats.missedCalls, color: '#ef4444', icon: '📵' },
    { label: 'Appels failed', value: stats.failedCalls, color: '#7c3aed', icon: '⚠️' },
    { label: 'Revenus Telecom', value: `$${stats.totalRevenue.toFixed(2)}`, color: '#10b981', icon: '💰' },
    { label: 'Packs vendus', value: stats.totalPacksSold, color: '#8b5cf6', icon: '📦' },
    { label: 'Revenus Packs', value: `$${stats.packRevenue.toFixed(2)}`, color: '#22c55e', icon: '💸' },
    { label: 'Packs actifs', value: stats.activePacks, color: '#14b8a6', icon: '🟢' },
    { label: 'Packs expirés', value: stats.expiredPacks, color: '#64748b', icon: '⌛' },
    { label: 'Suspendus', value: stats.suspendedUsers, color: '#6b7280', icon: '🚫' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 20 }}>
        <span style={{ background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Dashboard CEO
        </span>
      </h1>

      {/* Stat Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10, marginBottom: 24,
      }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            style={{
              padding: 16, borderRadius: 14,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '1.25rem' }}>{card.icon}</span>
              <span style={{ fontSize: '0.65rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Pending */}
      <div style={{
        padding: 20, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            ⏳ Demandes récentes
          </h2>
          {recentPending.length > 0 && (
            <a href="/ceo/requests" style={{
              fontSize: '0.75rem', color: '#06b6d4', textDecoration: 'none', fontWeight: 600,
            }}>
              Voir tout →
            </a>
          )}
        </div>

        {recentPending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#4a5e7a', fontSize: '0.85rem' }}>
            ✅ Aucune demande en attente
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentPending.map((user) => (
              <div
                key={user.uid}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b',
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name}</div>
                  <div style={{ color: '#4a5e7a', fontSize: '0.7rem' }}>{user.email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#06b6d4', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                    {user.telecomNumber}
                  </div>
                  <div style={{ color: '#4a5e7a', fontSize: '0.6rem' }}>
                    {formatRelativeTime(timestampToISO(user.createdAt as { seconds: number; nanoseconds: number } | null))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Top packs</div>
          {packAnalytics.topPacks.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucune donnée</div>
          ) : packAnalytics.topPacks.map((p) => (
            <div key={p.packName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
              <span>{p.packName}</span><b>{p.count}</b>
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Top utilisateurs abonnés</div>
          {packAnalytics.topSubscribers.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Aucune donnée</div>
          ) : packAnalytics.topSubscribers.map((u) => (
            <div key={u.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
              <span>{u.telecomNumber}</span><b>{u.count}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
