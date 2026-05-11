'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_VOICE_SEC = 120;
const MIN_VOICE_SEC = 0.45;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

export function MessageComposer({
  messageBody,
  sending,
  sendingVoice,
  voiceEnabled,
  onChange,
  onSend,
  onBlur,
  onVoiceSend,
}: {
  messageBody: string;
  sending: boolean;
  sendingVoice: boolean;
  voiceEnabled: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onBlur: () => void;
  onVoiceSend: (input: { blob: Blob; mimeType: string; durationSec: number }) => void | Promise<void>;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    clearTick();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        setSeconds(0);
        stopStream();
      };
      try {
        recorder.stop();
      } catch {
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        setSeconds(0);
        stopStream();
      }
    } else {
      chunksRef.current = [];
      mediaRecorderRef.current = null;
      setRecording(false);
      setSeconds(0);
      stopStream();
    }
  }, [clearTick, stopStream]);

  useEffect(() => () => cancelRecording(), [cancelRecording]);

  const finishRecording = useCallback(() => {
    clearTick();
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cancelRecording();
      return;
    }
    recorder.onstop = () => {
      const mime = mimeRef.current || recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      mediaRecorderRef.current = null;
      setRecording(false);
      setSeconds(0);
      stopStream();
      const durationSec = (Date.now() - startedAtRef.current) / 1000;
      if (durationSec >= MIN_VOICE_SEC && blob.size > 0) {
        void onVoiceSend({ blob, mimeType: mime, durationSec });
      }
    };
    recorder.stop();
  }, [cancelRecording, clearTick, onVoiceSend, stopStream]);

  const startRecording = useCallback(async () => {
    if (!voiceEnabled || sending || sendingVoice || recording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      mimeRef.current = mime || '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.start(250);
      tickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed >= MAX_VOICE_SEC) {
          finishRecording();
        }
      }, 200);
    } catch {
      stopStream();
      setRecording(false);
    }
  }, [finishRecording, sending, sendingVoice, voiceEnabled, recording, stopStream]);

  const busy = sending || sendingVoice;
  const micDisabled = !voiceEnabled || busy || recording;

  return (
    <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 8, position: 'sticky', bottom: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)' }}>
      {recording ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: '#fecaca', fontSize: '0.82rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.35)' }} />
            Enregistrement {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} · max {MAX_VOICE_SEC}s
          </span>
          <button type="button" className="btn-primary" style={{ width: 'auto', padding: '6px 12px', marginLeft: 'auto' }} onClick={finishRecording}>
            Envoyer vocal
          </button>
          <button
            type="button"
            onClick={cancelRecording}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            Annuler
          </button>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          title="Message vocal"
          aria-label="Enregistrer un message vocal"
          disabled={micDisabled}
          onClick={() => void startRecording()}
          style={{
            flex: '0 0 44px',
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: micDisabled ? 'rgba(255,255,255,0.03)' : 'rgba(6,182,212,0.18)',
            color: micDisabled ? '#64748b' : '#22d3ee',
            cursor: micDisabled ? 'not-allowed' : 'pointer',
            fontSize: '1.15rem',
            lineHeight: 1,
          }}
        >
          🎤
        </button>
        <input
          className="input-field"
          value={messageBody}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Écrire un SMS interne..."
          style={{ minWidth: 0 }}
          disabled={busy}
        />
        <button
          onClick={onSend}
          disabled={!messageBody.trim() || busy}
          className="btn-primary"
          style={{ width: 112, flex: '0 0 112px', opacity: !messageBody.trim() || busy ? 0.55 : 1, whiteSpace: 'nowrap' }}
        >
          Envoyer
        </button>
      </div>
      {sendingVoice ? (
        <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Envoi du message vocal…</div>
      ) : null}
    </div>
  );
}
