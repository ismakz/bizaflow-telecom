'use client';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

const styles: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    icon: '✓',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: '!',
  },
  info: {
    bg: 'rgba(6, 182, 212, 0.1)',
    border: 'rgba(6, 182, 212, 0.3)',
    icon: 'i',
  },
};

export default function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 'calc(var(--bottom-nav-height, 72px) + env(safe-area-inset-bottom, 0px) + 12px)',
        zIndex: 10050,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const s = styles[t.variant];
        return (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 12,
              background: s.bg,
              border: `1px solid ${s.border}`,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              animation: 'bf-toast-in 0.35s ease-out',
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 800,
                background: s.border,
                color: '#fff',
              }}
            >
              {s.icon}
            </span>
            <p style={{ margin: 0, flex: 1, fontSize: '0.82rem', lineHeight: 1.45, color: '#e8edf5' }}>{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Fermer la notification"
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: '#8899b4',
                cursor: 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes bf-toast-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
