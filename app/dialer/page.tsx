'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '@/app/components/AppProvider';
import { isBZTNumber, getInitials, detectOperator, CALL_RATES, normalizeExternalPhoneNumber } from '@/app/lib/utils';
import { getUserByTelecomNumber } from '@/app/lib/firestore';
import type { Contact } from '@/app/lib/types';
import type { OperatorId } from '@/app/lib/utils';
export default function DialerPage() {
  const { user, contacts, startCall, estimateExternalCallCost } = useApp();
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [inputError, setInputError] = useState('');

  const handleDigit = (digit: string) => setInput((prev) => prev + digit);
  const handleDelete = () => setInput((prev) => prev.slice(0, -1));
  const handleClear = () => setInput('');

  const operator = useMemo(() => {
    if (!input || input.length < 3) return null;
    return detectOperator(input);
  }, [input]);

  const rate = operator ? CALL_RATES[operator.id as OperatorId] : 0;

  useEffect(() => {
    let cancelled = false;
    const updateEstimate = async () => {
      if (!input.trim() || isBZTNumber(input)) {
        if (!cancelled) setEstimatedCost(0);
        return;
      }
      try {
        const cost = await estimateExternalCallCost(input, 1);
        if (!cancelled) setEstimatedCost(cost);
      } catch {
        if (!cancelled) setEstimatedCost(0);
      }
    };
    void updateEstimate();
    return () => {
      cancelled = true;
    };
  }, [input, estimateExternalCallCost]);

  const matchedContacts = useMemo(() => {
    if (!input || input.length < 2) return [];
    const q = input.toLowerCase();
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    ).slice(0, 3);
  }, [input, contacts]);

  const handleCall = useCallback(async () => {
    if (!input.trim() || !user) return;
    if (user.status !== 'approved') return;
    setSearching(true);
    setInputError('');

    try {
      const matched = contacts.find((c) => c.phone === input.toUpperCase());
      if (matched) {
        console.log('DIALER CALL CREATE START');
        startCall(matched);
        console.log('DIALER CALL CREATE SUCCESS');
        setInput('');
        setSearching(false);
        return;
      }

      if (isBZTNumber(input)) {
        const normalizedNumber = input.toUpperCase().trim();
        console.log('DIALER SEARCH INPUT', input);
        console.log('DIALER NORMALIZED NUMBER', normalizedNumber);
        console.log('DIALER SEARCH COLLECTION', 'telecom_directory');
        const found = await getUserByTelecomNumber(input);
        console.log('DIALER TARGET FOUND', !!found);
        console.log('DIALER TARGET DATA', found);
        if (!found) {
          setInputError('Numéro BZT introuvable');
          setSearching(false);
          return;
        }
        if (found.uid === user.uid) {
          setInputError('Impossible de s’appeler soi-même');
          setSearching(false);
          return;
        }
        if (found.status !== 'approved') {
          setInputError('Destinataire non joignable');
          setSearching(false);
          return;
        }

        const contact: Contact = {
          id: 'temp-' + Date.now(), contactUid: found.uid,
          name: found.name, phone: found.telecomNumber,
          isInternal: true, avatarColor: '#06b6d4',
          isFavorite: false, addedAt: null,
        };
        console.log('DIALER CALL CREATE START');
        startCall(contact);
        console.log('DIALER CALL CREATE SUCCESS');
        setInput('');
        setSearching(false);
        return;
      }

      // External call
      const normalizedExternal = normalizeExternalPhoneNumber(input.trim());
      if (!normalizedExternal) {
        setInputError('Numéro invalide');
        setSearching(false);
        return;
      }
      if (estimatedCost > user.balance) {
        setInputError('Solde insuffisant');
        setSearching(false);
        return;
      }
      const op = detectOperator(normalizedExternal);
      const contact: Contact = {
        id: 'ext-' + Date.now(), name: op.name + ' ' + normalizedExternal.slice(-4),
        phone: normalizedExternal, isInternal: false,
        avatarColor: op.color, isFavorite: false, addedAt: null,
      };
      console.log('DIALER CALL CREATE START');
      startCall(contact);
      console.log('DIALER CALL CREATE SUCCESS');
      setInput('');
      setSearching(false);
    } catch (error) {
      console.error('DIALER INTERNAL CALL ERROR', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('permission') || message.includes('insufficient')) {
        setInputError('Permission refusée. Publiez les règles Firestore puis réessayez.');
      } else {
        setInputError('Erreur appel interne');
      }
      setSearching(false);
    }
  }, [input, user, contacts, startCall, estimatedCost]);

  const callContact = (contact: Contact) => {
    startCall(contact);
    setInput('');
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  if (!user) return null;

  return (
    <div className="page-container" style={{ paddingBottom: 90, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Header */}
      <div style={{ width: '100%', textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
          <span className="page-header-gradient">Appeler</span>
        </h1>
        <p style={{ color: '#4a5e7a', fontSize: '0.7rem', marginTop: 2 }}>{user.telecomNumber} • Solde: ${user.balance.toFixed(2)}</p>
      </div>

      {/* Quick Prefixes */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => { if (!input.startsWith('BZT-')) setInput('BZT-'); }}
          style={{
            padding: '6px 16px', borderRadius: 8,
            background: input.startsWith('BZT-') ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.05)',
            border: input.startsWith('BZT-') ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255,255,255,0.08)',
            color: input.startsWith('BZT-') ? '#06b6d4' : '#4a5e7a',
            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          BZT- Numéro interne
        </button>
        <button
          onClick={() => { if (!input.startsWith('+')) setInput((prev) => `+${prev}`); }}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: input.startsWith('+') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
            border: input.startsWith('+') ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)',
            color: input.startsWith('+') ? '#10b981' : '#4a5e7a',
            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + International
        </button>
      </div>

      {/* Input Display */}
      <div style={{
        width: '100%', maxWidth: 320, textAlign: 'center',
        padding: '10px 16px', marginBottom: 4, minHeight: 44,
        fontSize: input.length > 12 ? '1.2rem' : '1.6rem',
        fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
        color: isBZTNumber(input) ? '#06b6d4' : '#e2e8f0',
        letterSpacing: '0.05em',
      }}>
        {input || <span style={{ color: '#2a3548', fontSize: '1rem' }}>+243 ou numéro local</span>}
      </div>
      {inputError && (
        <div style={{ marginBottom: 8, color: '#f87171', fontSize: '0.75rem' }}>{inputError}</div>
      )}

      {/* Operator + Rate Badge */}
      {operator && input.length >= 3 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 8,
            background: `${operator.color}12`, border: `1px solid ${operator.color}25`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: operator.color }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: operator.color }}>
              {operator.name}
            </span>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 8, fontSize: '0.65rem',
            background: rate === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: rate === 0 ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
            color: rate === 0 ? '#10b981' : '#f59e0b', fontWeight: 600,
          }}>
            {rate === 0 ? '✓ Gratuit' : `$${rate}/min`}
          </div>
          {!isBZTNumber(input) && input.length >= 8 && (
            <div style={{
              padding: '4px 10px', borderRadius: 8, fontSize: '0.65rem',
              background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)',
              color: '#818cf8', fontWeight: 600,
            }}>
              Est. 1 min: ${estimatedCost.toFixed(2)}
            </div>
          )}
        </div>
      )}

      {/* Matched Contacts */}
      {matchedContacts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 320, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {matchedContacts.map((c) => {
            const op = detectOperator(c.phone);
            return (
              <button key={c.id} onClick={() => callContact(c)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'left', width: '100%', color: '#e2e8f0',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: `${op.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700, color: op.color,
                }}>
                  {getInitials(c.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '0.6rem', color: '#4a5e7a' }}>{c.phone} • {op.name}</div>
                </div>
                <span style={{ fontSize: '0.9rem' }}>📞</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Keypad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 68px)', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        {digits.map((d) => (
          <button key={d} onClick={() => handleDigit(d)} style={{
            width: 68, height: 52, borderRadius: 14, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            color: '#e2e8f0', fontSize: '1.3rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
            {d}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button onClick={handleClear} style={{
          width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
          background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
          color: '#ef4444', fontSize: '0.8rem', fontWeight: 600,
          display: input ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
        }}>C</button>

        <button onClick={handleCall} disabled={!input.trim() || searching} style={{
          width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
          background: input.trim() ? 'linear-gradient(135deg, #06b6d4, #10b981)' : 'rgba(255,255,255,0.05)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: input.trim() ? '0 4px 24px rgba(6, 182, 212, 0.35)' : 'none',
          opacity: !input.trim() || searching ? 0.4 : 1, transition: 'all 0.2s',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
          </svg>
        </button>

        <button onClick={handleDelete} style={{
          width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#e2e8f0', fontSize: '1rem',
          display: input ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
        }}>⌫</button>
      </div>

      {/* Rate Table */}
      <div style={{
        width: '100%', maxWidth: 320, marginTop: 20, padding: 14, borderRadius: 12,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{ fontSize: '0.6rem', color: '#4a5e7a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 600 }}>
          Tarifs par minute
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#06b6d4' }}>BZT → BZT</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>Gratuit</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#ef4444' }}>Airtel</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>${CALL_RATES.airtel}/min</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#f59e0b' }}>MTN</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>${CALL_RATES.mtn}/min</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#ef4444' }}>Vodacom</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>${CALL_RATES.vodacom}/min</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#f97316' }}>Orange</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>${CALL_RATES.orange}/min</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>Autre</span>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>${CALL_RATES.other}/min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
