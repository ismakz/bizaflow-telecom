'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function TelecomCallLandingPage() {
  const params = useParams<{ callId: string }>();
  const callId = params.callId;

  return (
    <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <div className="glass-card" style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: '0.72rem', color: '#06b6d4', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Appel entrant
        </div>
        <h1 style={{ margin: '12px 0 8px', fontSize: '1.25rem' }}>Ouvrir l’appel Bizaflow</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5 }}>
          L’appel <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{callId}</span> est prêt dans l’espace Telecom interne.
        </p>
        <Link href="/telecom" className="btn-primary" style={{ marginTop: 18, display: 'inline-flex', width: 'auto', textDecoration: 'none', padding: '12px 18px' }}>
          Continuer vers l’appel
        </Link>
      </div>
    </div>
  );
}

