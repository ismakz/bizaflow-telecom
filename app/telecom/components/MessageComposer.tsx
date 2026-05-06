'use client';

export function MessageComposer(props: {
  messageBody: string;
  sending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onBlur: () => void;
}) {
  return (
    <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }}>
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
  );
}
