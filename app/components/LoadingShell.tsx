'use client';

import BizaflowLogo from '@/app/components/BizaflowLogo';

type Props = {
  title?: string;
  subtitle?: string;
};

export default function LoadingShell({
  title = 'Bizaflow Telecom',
  subtitle = 'Connexion sécurisée à votre espace…',
}: Props) {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #060b18 0%, #0a1224 50%, #060b18 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            animation: 'bf-pulse 2s ease-in-out infinite',
          }}
        >
          <BizaflowLogo size={72} />
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: '0.95rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #06b6d4, #14b8a6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {title}
        </div>
        <div style={{ color: '#4a5e7a', fontSize: '0.78rem', marginTop: 10, maxWidth: 260, lineHeight: 1.5 }}>
          {subtitle}
        </div>
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'rgba(6, 182, 212, 0.45)',
                animation: `bf-dot 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes bf-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.02); }
        }
        @keyframes bf-dot {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
