'use client';

import type { TelecomPackDoc } from '@/app/lib/firestore';

interface PackCardProps {
  pack: TelecomPackDoc;
  canAfford: boolean;
  onPurchase: (pack: TelecomPackDoc) => void;
  delay?: number;
}

export default function PackCard({ pack, canAfford, onPurchase, delay = 0 }: PackCardProps) {
  const formatData = (mb?: number) => {
    if (!mb) return '-';
    if (mb >= 1000) return `${(mb / 1000).toFixed(mb % 1000 === 0 ? 0 : 1)} GB`;
    return `${mb} MB`;
  };

  return (
    <div
      className="pack-card animate-slide-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Glow Effect */}
      <div className="pack-card-glow" style={{ background: `radial-gradient(circle, ${pack.color}, transparent)` }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: pack.color }}>
              {pack.name}
            </span>
            {pack.popular && <span className="badge badge-popular">Populaire</span>}
          </div>
          <div style={{ color: 'var(--foreground-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
            {pack.description}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--foreground)' }}>
            ${pack.price}
          </div>
          <div style={{ color: 'var(--foreground-muted)', fontSize: '0.65rem' }}>
            /{pack.durationDays}j
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'rgba(136, 153, 180, 0.06)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>{pack.internalMinutes}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min internes</div>
        </div>
        <div style={{ background: 'rgba(136, 153, 180, 0.06)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>{pack.externalMinutes}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min externes</div>
        </div>
        <div style={{ background: 'rgba(136, 153, 180, 0.06)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>{formatData(pack.dataAmount)}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</div>
        </div>
      </div>

      {/* Purchase Button */}
      <button
        className={canAfford ? 'btn-primary' : 'btn-secondary'}
        style={{ width: '100%', opacity: canAfford ? 1 : 0.5, cursor: canAfford ? 'pointer' : 'not-allowed' }}
        onClick={() => canAfford && onPurchase(pack)}
        disabled={!canAfford}
      >
        {canAfford ? 'Acheter ce pack' : 'Crédit insuffisant'}
      </button>
    </div>
  );
}
