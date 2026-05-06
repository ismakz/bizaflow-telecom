'use client';

export function MessageComposer(props: {
  messageBody: string;
  sending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onBlur: () => void;
  onPickFile: () => void;
  onToggleRecord: () => void;
  isRecording: boolean;
  recordingSeconds: number;
  replyPreview?: string;
  onClearReply: () => void;
}) {
  return (
    <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 8, position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }}>
      {props.replyPreview && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', color: '#cbd5e1', fontSize: '0.75rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.replyPreview}</span>
          <button onClick={props.onClearReply} style={ghostButtonStyle}>Annuler</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={props.onPickFile} style={iconButtonStyle} title="Joindre un fichier">
        +
      </button>
      <button onClick={props.onToggleRecord} style={{ ...iconButtonStyle, color: props.isRecording ? '#f87171' : '#06b6d4' }} title="Message vocal">
        {props.isRecording ? `■ ${props.recordingSeconds}s` : '🎤'}
      </button>
      <input
        className="input-field"
        value={props.messageBody}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            props.onSend();
          }
        }}
        placeholder="Écrire un SMS interne..."
        style={{ minWidth: 0 }}
      />
      <button
        onClick={props.onSend}
        disabled={!props.messageBody.trim() || props.sending}
        className="btn-primary"
        style={{ width: 112, flex: '0 0 112px', opacity: !props.messageBody.trim() || props.sending ? 0.55 : 1, whiteSpace: 'nowrap' }}
      >
        Envoyer
      </button>
      </div>
    </div>
  );
}

const iconButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontWeight: 900,
} satisfies React.CSSProperties;

const ghostButtonStyle = {
  border: 'none',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: '0.72rem',
} satisfies React.CSSProperties;
