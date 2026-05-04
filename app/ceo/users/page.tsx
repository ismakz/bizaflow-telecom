'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { approveUser, changeUserRole, getAllUsers, performAdminRecharge, rejectUser, suspendUser, type TelecomUserDoc } from '@/app/lib/firestore';
import { formatRelativeTime, getInitials, timestampToISO } from '@/app/lib/utils';
import type { UserRole, UserStatus } from '@/app/lib/types';

type FilterStatus = 'all' | UserStatus;
type FilterRole = 'all' | UserRole;

const statusColor: Record<UserStatus, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  suspended: '#6b7280',
};

const roleColor: Record<UserRole, string> = {
  ceo: '#ef4444',
  admin: '#8b5cf6',
  user: '#06b6d4',
  agent: '#f59e0b',
  business: '#10b981',
};

const statusLabels: Record<FilterStatus, string> = {
  all: 'Tous',
  pending: 'En attente',
  approved: 'Approuves',
  rejected: 'Rejetes',
  suspended: 'Suspendus',
};

const roleLabels: Record<FilterRole, string> = {
  all: 'Roles',
  ceo: 'CEO',
  admin: 'Admin',
  user: 'User',
  agent: 'Agent',
  business: 'Business',
};

export default function CEOUsersPage() {
  const { user: ceoUser } = useApp();
  const [users, setUsers] = useState<TelecomUserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rechargeUserId, setRechargeUserId] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('5');
  const [rechargeNote, setRechargeNote] = useState('Recharge CEO');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadUsers = useCallback(async () => {
    if (ceoUser?.role !== 'ceo') {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const all = await getAllUsers();
      setUsers(all);
    } catch (err) {
      console.error('Error loading users:', err);
      setToast({ message: 'Impossible de charger les utilisateurs', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [ceoUser?.role]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleAction = async (uid: string, name: string, action: 'approve' | 'reject' | 'suspend') => {
    if (!ceoUser) return;
    setActionLoading(uid);
    try {
      if (action === 'approve') {
        await approveUser(uid, ceoUser.uid);
        showToast(`${name} approuve`);
      }
      if (action === 'reject') {
        await rejectUser(uid, ceoUser.uid);
        showToast(`${name} rejete`);
      }
      if (action === 'suspend') {
        await suspendUser(uid);
        showToast(`${name} suspendu`);
      }
      await loadUsers();
    } catch {
      showToast('Action impossible', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (uid: string, name: string, role: UserRole) => {
    setActionLoading(uid);
    try {
      await changeUserRole(uid, role);
      showToast(`${name}: role ${role}`);
      await loadUsers();
    } catch {
      showToast('Changement de role impossible', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecharge = async (uid: string, name: string) => {
    if (!ceoUser) return;
    const amount = Number(rechargeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Montant invalide', 'error');
      return;
    }

    setActionLoading(uid);
    try {
      await performAdminRecharge(uid, amount, ceoUser.uid, rechargeNote.trim() || 'Recharge CEO');
      showToast(`${name}: +$${amount.toFixed(2)}`);
      setRechargeUserId(null);
      setRechargeAmount('5');
      setRechargeNote('Recharge CEO');
      await loadUsers();
    } catch {
      showToast('Recharge impossible', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((currentUser) => {
      if (filterStatus !== 'all' && currentUser.status !== filterStatus) return false;
      if (filterRole !== 'all' && currentUser.role !== filterRole) return false;
      if (!q) return true;

      const safeName = currentUser.name || '';
      const safeEmail = currentUser.email || '';
      const safeNumber = currentUser.telecomNumber || '';
      return (
        safeName.toLowerCase().includes(q) ||
        safeEmail.toLowerCase().includes(q) ||
        safeNumber.toLowerCase().includes(q)
      );
    });
  }, [filterRole, filterStatus, search, users]);

  if (ceoUser?.role !== 'ceo') return null;

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 300,
          background: toast.type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
          color: 'white', padding: '10px 20px', borderRadius: 12,
          fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(8px)',
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Gestion des utilisateurs</h1>
          <p style={{ color: '#4a5e7a', fontSize: '0.8rem', margin: '6px 0 0' }}>
            {users.length} utilisateur{users.length !== 1 ? 's' : ''} au total
          </p>
        </div>
        <button
          onClick={loadUsers}
          style={{
            padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#06b6d4', fontWeight: 700, fontSize: '0.75rem',
          }}
        >
          Recharger
        </button>
      </div>

      <div className="search-wrapper" style={{ marginBottom: 12 }}>
        <div className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <input
          className="search-input"
          placeholder="Rechercher par nom, email ou BZT..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          id="user-search"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'pending', 'approved', 'rejected', 'suspended'] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: '0.7rem', cursor: 'pointer',
                fontWeight: filterStatus === status ? 700 : 500,
                background: filterStatus === status ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.03)',
                border: filterStatus === status ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                color: filterStatus === status ? '#06b6d4' : '#4a5e7a',
              }}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'ceo', 'user', 'agent', 'business'] as FilterRole[]).map((role) => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: '0.7rem', cursor: 'pointer',
                fontWeight: filterRole === role ? 700 : 500,
                background: filterRole === role ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255,255,255,0.03)',
                border: filterRole === role ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                color: filterRole === role ? '#8b5cf6' : '#4a5e7a',
              }}
            >
              {roleLabels[role]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Aucun utilisateur trouve</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((currentUser) => {
            const safeName = currentUser.name || currentUser.email || 'Utilisateur';
            const isBusy = actionLoading === currentUser.uid;
            return (
              <div
                key={currentUser.uid}
                style={{
                  padding: 14, borderRadius: 14,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: `${roleColor[currentUser.role] || '#4a5e7a'}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem', fontWeight: 700, color: roleColor[currentUser.role] || '#4a5e7a', flexShrink: 0,
                  }}>
                    {getInitials(safeName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{safeName}</div>
                    <div style={{ color: '#4a5e7a', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser.email}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#06b6d4', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>
                      {currentUser.telecomNumber || 'BZT-?'}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>
                      {formatRelativeTime(timestampToISO(currentUser.createdAt as { seconds: number; nanoseconds: number } | null))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: `${statusColor[currentUser.status]}15`, border: `1px solid ${statusColor[currentUser.status]}30`,
                    color: statusColor[currentUser.status],
                  }}>
                    {statusLabels[currentUser.status]}
                  </span>
                  <span style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: `${roleColor[currentUser.role]}15`, border: `1px solid ${roleColor[currentUser.role]}30`,
                    color: roleColor[currentUser.role],
                  }}>
                    {roleLabels[currentUser.role]}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>
                    Solde: ${(currentUser.balance || 0).toFixed(2)}
                  </span>
                </div>

                {currentUser.role !== 'ceo' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {currentUser.status === 'pending' && (
                      <>
                        <button onClick={() => handleAction(currentUser.uid, safeName, 'approve')} disabled={isBusy}
                          style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontWeight: 600, fontSize: '0.7rem', opacity: isBusy ? 0.5 : 1 }}>
                          Approuver
                        </button>
                        <button onClick={() => handleAction(currentUser.uid, safeName, 'reject')} disabled={isBusy}
                          style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontWeight: 600, fontSize: '0.7rem', opacity: isBusy ? 0.5 : 1 }}>
                          Rejeter
                        </button>
                      </>
                    )}
                    {currentUser.status === 'approved' && (
                      <>
                        <button onClick={() => setRechargeUserId(rechargeUserId === currentUser.uid ? null : currentUser.uid)} disabled={isBusy}
                          style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', fontWeight: 600, fontSize: '0.7rem', opacity: isBusy ? 0.5 : 1 }}>
                          Recharger
                        </button>
                        <button onClick={() => handleAction(currentUser.uid, safeName, 'suspend')} disabled={isBusy}
                          style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(107, 114, 128, 0.15)', border: '1px solid rgba(107, 114, 128, 0.3)', color: '#6b7280', fontWeight: 600, fontSize: '0.7rem', opacity: isBusy ? 0.5 : 1 }}>
                          Suspendre
                        </button>
                      </>
                    )}
                    {(currentUser.status === 'rejected' || currentUser.status === 'suspended') && (
                      <button onClick={() => handleAction(currentUser.uid, safeName, 'approve')} disabled={isBusy}
                        style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontWeight: 600, fontSize: '0.7rem', opacity: isBusy ? 0.5 : 1 }}>
                        Reactiver
                      </button>
                    )}
                    <select
                      value={currentUser.role}
                      onChange={(event) => handleRoleChange(currentUser.uid, safeName, event.target.value as UserRole)}
                      disabled={isBusy}
                      style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: '0.7rem',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0', cursor: 'pointer',
                      }}
                    >
                      <option value="user">user</option>
                      <option value="agent">agent</option>
                      <option value="business">business</option>
                    </select>
                  </div>
                )}

                {rechargeUserId === currentUser.uid && (
                  <div style={{
                    marginTop: 12, padding: 12, borderRadius: 12,
                    background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.14)',
                    display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                  }}>
                    <input
                      className="input-field"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={rechargeAmount}
                      onChange={(event) => setRechargeAmount(event.target.value)}
                      aria-label="Montant de recharge"
                      style={{ minHeight: 34, padding: '6px 10px', fontSize: '0.78rem', width: 120 }}
                    />
                    <input
                      className="input-field"
                      value={rechargeNote}
                      onChange={(event) => setRechargeNote(event.target.value)}
                      aria-label="Description de recharge"
                      style={{ minHeight: 34, padding: '6px 10px', fontSize: '0.78rem', flex: '1 1 180px' }}
                    />
                    <button
                      onClick={() => handleRecharge(currentUser.uid, safeName)}
                      disabled={isBusy}
                      style={{
                        padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(34, 197, 94, 0.18)', border: '1px solid rgba(34, 197, 94, 0.35)',
                        color: '#22c55e', fontWeight: 700, fontSize: '0.72rem', whiteSpace: 'nowrap',
                        opacity: isBusy ? 0.5 : 1,
                      }}
                    >
                      Valider
                    </button>
                    <button
                      onClick={() => setRechargeUserId(null)}
                      disabled={isBusy}
                      style={{
                        padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem',
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
