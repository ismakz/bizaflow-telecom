import Link from 'next/link';
import BizaflowLogo from '@/app/components/BizaflowLogo';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #060b18 0%, #0c1528 100%)',
      }}
    >
      <BizaflowLogo size={64} />
      <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 24 }}>Page introuvable</h1>
      <p style={{ color: '#4a5e7a', fontSize: '0.85rem', textAlign: 'center', maxWidth: 320, marginTop: 8 }}>
        Cette adresse n’existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 28,
          padding: '12px 28px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: '0.88rem',
          textDecoration: 'none',
          color: '#fff',
          background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
          boxShadow: '0 8px 24px rgba(6, 182, 212, 0.25)',
        }}
      >
        Retour à l’accueil
      </Link>
    </div>
  );
}
