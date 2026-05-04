'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { approveUser, getUsersByStatus, rejectUser, type TelecomUserDoc } from '@/app/lib/firestore';
import { formatRelativeTime, timestampToISO } from '@/app/lib/utils';

export default function CEORequestsPage() {
  const { user } = useApp();
  const [pending, setPending] = useState<TelecomUserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPending = useCallback(async () => {
    if (user?.role !== 'ceo') {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const users = await getUsersByStatus('pending');
      setPending(users);
    } catch (err) {
      console.error('Error loading pending:', err);
      setToast({ message: 'Impossible de charger les demandes', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  if (user?.role !== 'ceo') return null;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleApprove = async (uid: string, name: string) => {
    if (!user) return;
    setActionLoading(uid);
    try {
      await approveUser(uid, user.uid);
      showToast(`${name} approuve avec succes`);
      await loadPending();
    } catch {
      showToast('Erreur lors de l approbation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (uid: string, name: string) => {
    if (!user) return;
    setActionLoading(uid);
    try {
      await rejectUser(uid, user.uid);
      showToast(`${name} rejete`);
      await loadPending();
    } catch {
      showToast('Erreur lors du rejet', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 300,
          background: toast.type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
          color: 'white', padding: '10px 20px', borderRadius: 12,
          fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            Demandes d&apos;inscription
          </h1>
          <p style={{ color: '#4a5e7a', fontSize: '0.8rem', margin: '6px 0 0' }}>
            {pending.length} demande{pending.length !== 1 ? 's' : ''} en attente de validation
          </p>
        </div>
        <button
          onClick={loadPending}
          style={{
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#06b6d4', fontWeight: 700, fontSize: '0.75rem',
          }}
        >
          Recharger
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Chargement...</div>
      ) : pending.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Aucune demande en attente</div>
          <div style={{ color: '#4a5e7a', fontSize: '0.8rem' }}>Toutes les demandes ont ete traitees</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((pendingUser) => {
            const safeName = pendingUser.name || pendingUser.email || 'Utilisateur';
            return (
              <div
                key={pendingUser.uid}
                style={{
                  padding: 16, borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'rgba(245, 158, 11, 0.12)', border: '2px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', fontWeight: 700, color: '#f59e0b', flexShrink: 0,
                  }}>
                    {safeName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{safeName}</div>
                    <div style={{ color: '#4a5e7a', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pendingUser.email}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#06b6d4', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700 }}>
                      {pendingUser.telecomNumber || 'BZT-?'}
                    </div>
                    <div style={{ color: '#4a5e7a', fontSize: '0.65rem' }}>
                      {formatRelativeTime(timestampToISO(pendingUser.createdAt as { seconds: number; nanoseconds: number } | null))}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderRadius: 10, background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.12)', marginBottom: 12,
                }}>
                  <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>EN ATTENTE</span>
                  <span style={{ fontSize: '0.65rem', color: '#4a5e7a' }}>Role: {pendingUser.role}</span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleApprove(pendingUser.uid, safeName)}
                    disabled={actionLoading === pendingUser.uid}
                    style={{
                      flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                      background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#10b981', fontWeight: 700, fontSize: '0.8rem',
                      opacity: actionLoading === pendingUser.uid ? 0.5 : 1,
                    }}
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => handleReject(pendingUser.uid, safeName)}
                    disabled={actionLoading === pendingUser.uid}
                    style={{
                      flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                      background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444', fontWeight: 700, fontSize: '0.8rem',
                      opacity: actionLoading === pendingUser.uid ? 0.5 : 1,
                    }}
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
