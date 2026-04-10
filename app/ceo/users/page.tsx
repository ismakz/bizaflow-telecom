'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { getAllUsers, approveUser, rejectUser, suspendUser, changeUserRole, type TelecomUserDoc } from '@/app/lib/firestore';
import { timestampToISO, formatRelativeTime, getInitials } from '@/app/lib/utils';
import type { UserRole, UserStatus } from '@/app/lib/types';

type FilterStatus = 'all' | UserStatus;
type FilterRole = 'all' | UserRole;

export default function CEOUsersPage() {
  const { user: ceoUser } = useApp();
  const [users, setUsers] = useState<TelecomUserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const all = await getAllUsers();
      setUsers(all);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAction = async (uid: string, name: string, action: string) => {
    if (!ceoUser) return;
    setActionLoading(uid);
    try {
      switch (action) {
        case 'approve': await approveUser(uid, ceoUser.uid); showToast(`✅ ${name} approuvé`); break;
        case 'reject': await rejectUser(uid, ceoUser.uid); showToast(`❌ ${name} rejeté`); break;
        case 'suspend': await suspendUser(uid); showToast(`🚫 ${name} suspendu`); break;
      }
      await loadUsers();
    } catch {
      showToast('Erreur', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (uid: string, name: string, role: UserRole) => {
    setActionLoading(uid);
    try {
      await changeUserRole(uid, role);
      showToast(`${name} → rôle ${role}`);
      await loadUsers();
    } catch {
      showToast('Erreur', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter((u) => {
    if (filterStatus !== 'all' && u.status !== filterStatus) return false;
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.telecomNumber.toLowerCase().includes(q);
    }
    return true;
  });

  const statusColor: Record<string, string> = {
    pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', suspended: '#6b7280',
  };

  const roleColor: Record<string, string> = {
    ceo: '#ef4444', admin: '#8b5cf6', user: '#06b6d4', agent: '#f59e0b', business: '#10b981',
  };

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

      <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 4 }}>
        👥 Gestion des Utilisateurs
      </h1>
      <p style={{ color: '#4a5e7a', fontSize: '0.8rem', marginBottom: 16 }}>
        {users.length} utilisateur{users.length !== 1 ? 's' : ''} au total
      </p>

      {/* Search */}
      <div className="search-wrapper" style={{ marginBottom: 12 }}>
        <div className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <input
          className="search-input"
          placeholder="Rechercher par nom, email ou BZT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          id="user-search"
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'pending', 'approved', 'rejected', 'suspended'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: '0.7rem', cursor: 'pointer',
                fontWeight: filterStatus === s ? 700 : 500,
                background: filterStatus === s ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.03)',
                border: filterStatus === s ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                color: filterStatus === s ? '#06b6d4' : '#4a5e7a',
              }}
            >
              {s === 'all' ? 'Tous' : s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'ceo', 'user', 'agent', 'business'] as FilterRole[]).map((r) => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: '0.7rem', cursor: 'pointer',
                fontWeight: filterRole === r ? 700 : 500,
                background: filterRole === r ? 'rgba(139, 92, 246, 0.12)' : 'rgba(255,255,255,0.03)',
                border: filterRole === r ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                color: filterRole === r ? '#8b5cf6' : '#4a5e7a',
              }}
            >
              {r === 'all' ? 'Rôles' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Chargement...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#4a5e7a' }}>Aucun utilisateur trouvé</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((u) => (
            <div
              key={u.uid}
              style={{
                padding: 14, borderRadius: 14,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: `${roleColor[u.role] || '#4a5e7a'}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem', fontWeight: 700, color: roleColor[u.role] || '#4a5e7a',
                }}>
                  {getInitials(u.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{u.name}</div>
                  <div style={{ color: '#4a5e7a', fontSize: '0.7rem' }}>{u.email}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#06b6d4', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>
                    {u.telecomNumber}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>
                    {formatRelativeTime(timestampToISO(u.createdAt as { seconds: number; nanoseconds: number } | null))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: `${statusColor[u.status]}15`, border: `1px solid ${statusColor[u.status]}30`,
                  color: statusColor[u.status],
                }}>
                  {u.status}
                </span>
                <span style={{
                  padding: '3px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: `${roleColor[u.role]}15`, border: `1px solid ${roleColor[u.role]}30`,
                  color: roleColor[u.role],
                }}>
                  {u.role}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#4a5e7a' }}>
                  Solde: ${u.balance?.toFixed(2) || '0.00'}
                </span>
              </div>

              {u.role !== 'ceo' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {u.status === 'pending' && (
                    <>
                      <button onClick={() => handleAction(u.uid, u.name, 'approve')} disabled={actionLoading === u.uid}
                        style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontWeight: 600, fontSize: '0.7rem', opacity: actionLoading === u.uid ? 0.5 : 1 }}>
                        Approuver
                      </button>
                      <button onClick={() => handleAction(u.uid, u.name, 'reject')} disabled={actionLoading === u.uid}
                        style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontWeight: 600, fontSize: '0.7rem', opacity: actionLoading === u.uid ? 0.5 : 1 }}>
                        Rejeter
                      </button>
                    </>
                  )}
                  {u.status === 'approved' && (
                    <button onClick={() => handleAction(u.uid, u.name, 'suspend')} disabled={actionLoading === u.uid}
                      style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(107, 114, 128, 0.15)', border: '1px solid rgba(107, 114, 128, 0.3)', color: '#6b7280', fontWeight: 600, fontSize: '0.7rem', opacity: actionLoading === u.uid ? 0.5 : 1 }}>
                      Suspendre
                    </button>
                  )}
                  {(u.status === 'rejected' || u.status === 'suspended') && (
                    <button onClick={() => handleAction(u.uid, u.name, 'approve')} disabled={actionLoading === u.uid}
                      style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', fontWeight: 600, fontSize: '0.7rem', opacity: actionLoading === u.uid ? 0.5 : 1 }}>
                      Réactiver
                    </button>
                  )}
                  {/* Role change */}
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.uid, u.name, e.target.value as UserRole)}
                    disabled={actionLoading === u.uid}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
