'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { formatDuration, formatCost, formatTime, formatDate } from '@/app/lib/utils';
import type { CallStatus } from '@/app/lib/types';

type FilterType = 'all' | 'internal' | 'external' | 'missed' | 'incoming' | 'outgoing';

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'Tous', value: 'all' },
  { label: 'Internes', value: 'internal' },
  { label: 'Externes', value: 'external' },
  { label: 'Entrants', value: 'incoming' },
  { label: 'Sortants', value: 'outgoing' },
  { label: 'Manqués', value: 'missed' },
];

export default function HistoryPage() {
  const { calls, user } = useApp();
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return calls;
    if (filter === 'internal') return calls.filter((c) => c.type === 'internal_call');
    if (filter === 'external') return calls.filter((c) => c.type === 'external_call');
    if (filter === 'incoming' || filter === 'outgoing') return calls.filter((c) => c.direction === filter);
    return calls.filter((c) => c.status === filter);
  }, [calls, filter]);

  const grouped = useMemo(() => {
    const groups: { date: string; calls: typeof filtered }[] = [];
    let currentDate = '';

    for (const call of filtered) {
      const dateKey = formatDate(call.createdAt);
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({ date: dateKey, calls: [] });
      }
      groups[groups.length - 1].calls.push(call);
    }

    return groups;
  }, [filtered]);

  const getCallIcon = (status: CallStatus, direction: 'incoming' | 'outgoing') => {
    switch (status) {
      case 'completed':
        return direction === 'incoming' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 7 17 17 17" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        );
      case 'answered':
      case 'ringing':
      case 'initiated':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 7 17 17 17" />
          </svg>
        );
      case 'missed':
      case 'failed':
      case 'cancelled':
      case 'rejected':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        );
    }
  };

  return (
    <div className="page-container">
      <div className="glow-bg" />

      <h1 className="page-header" style={{ position: 'relative', zIndex: 1 }}>
        <span className="page-header-gradient">Historique</span>
      </h1>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-tab ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
            id={`filter-${f.value}`}
          >
            {f.label}
            {f.value !== 'all' && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                ({
                  calls.filter((c) => {
                    if (f.value === 'internal') return c.type === 'internal_call';
                    if (f.value === 'external') return c.type === 'external_call';
                    if (f.value === 'incoming' || f.value === 'outgoing') return c.direction === f.value;
                    return c.status === f.value;
                  }).length
                })
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📞</div>
          <div className="empty-state-text">Aucun appel trouvé</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map((group, gi) => (
            <div key={group.date}>
              <div style={{
                fontSize: '0.7rem', fontWeight: 600, color: 'var(--foreground-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 4,
              }}>
                {group.date}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.calls.map((call, ci) => {
                  const isOutgoing = call.direction === 'outgoing';
                  const displayName = isOutgoing ? call.toName : call.fromName;
                  const displayNumber = isOutgoing ? call.to : call.from;

                  return (
                    <div
                      key={call.id}
                      className="glass-card-sm animate-slide-in"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        animationDelay: `${(gi * 3 + ci) * 40}ms`,
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: call.status === 'missed' || call.status === 'failed'
                          ? 'rgba(239, 68, 68, 0.12)'
                          : call.direction === 'incoming'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(59, 130, 246, 0.12)',
                        flexShrink: 0,
                      }}>
                        {getCallIcon(call.status, call.direction)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontWeight: 600, fontSize: '0.85rem',
                            color: call.status === 'missed' ? 'var(--accent-red)' : 'var(--foreground)',
                          }}>
                            {displayName}
                          </span>
                          {call.type === 'internal_call' && <span className="badge badge-internal" style={{ fontSize: '0.55rem' }}>BZT</span>}
                          {call.type === 'external_call' && (
                            <span
                              style={{
                                fontSize: '0.55rem',
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: call.isRealTelephony ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                border: call.isRealTelephony ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(99, 102, 241, 0.25)',
                                color: call.isRealTelephony ? '#10b981' : '#818cf8',
                              }}
                            >
                              {call.isRealTelephony ? 'Externe réel' : 'Externe simulé'}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <span style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem', fontFamily: 'var(--font-mono, monospace)' }}>
                            {displayNumber}
                          </span>
                          <span style={{ color: 'var(--foreground-muted)', fontSize: '0.7rem' }}>
                            {formatTime(call.createdAt)}
                          </span>
                          {call.durationSeconds > 0 && (
                            <span style={{ color: 'var(--foreground-muted)', fontSize: '0.7rem' }}>
                              • {formatDuration(call.durationSeconds)}
                            </span>
                          )}
                          <span style={{ color: 'var(--foreground-muted)', fontSize: '0.7rem' }}>
                            • {call.direction === 'outgoing' ? 'Sortant' : 'Entrant'}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          color: call.cost === 0 ? 'var(--accent-green)' : 'var(--accent-amber)',
                        }}>
                          {formatCost(call.cost)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
