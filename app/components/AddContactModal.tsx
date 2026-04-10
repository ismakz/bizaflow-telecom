'use client';

import { useState } from 'react';
import { isBZTNumber } from '@/app/lib/utils';
import { getUserByTelecomNumber } from '@/app/lib/firestore';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (contact: { name: string; phone: string; isInternal: boolean }) => Promise<void>;
}

export default function AddContactModal({ isOpen, onClose, onAdd }: AddContactModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [isInternal, setIsInternal] = useState<boolean | null>(null);

  if (!isOpen) return null;

  const checkPhone = async (phoneNumber: string) => {
    setPhone(phoneNumber);
    setIsInternal(null);

    const cleaned = phoneNumber.trim();
    if (isBZTNumber(cleaned)) {
      setChecking(true);
      try {
        const found = await getUserByTelecomNumber(cleaned.toUpperCase());
        setIsInternal(!!found);
      } catch {
        setIsInternal(false);
      } finally {
        setChecking(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    const cleanPhone = phone.trim().toUpperCase();
    await onAdd({
      name: name.trim(),
      phone: cleanPhone,
      isInternal: isInternal === true,
    });

    setName('');
    setPhone('');
    setIsInternal(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} id="add-contact-modal">
      <div className="modal-content">
        <div className="modal-handle" />
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 20 }}>
          Nouveau contact
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom complet</label>
            <input
              className="input-field"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jean Kabongo"
              required
              id="contact-name"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.7rem', color: 'var(--foreground-secondary)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Numéro Bizaflow Telecom</label>
            <input
              className="input-field"
              type="text"
              value={phone}
              onChange={(e) => checkPhone(e.target.value)}
              placeholder="BZT-10001"
              required
              id="contact-phone"
            />
            <div style={{ marginTop: 6, minHeight: 20 }}>
              {checking && (
                <span style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)' }}>
                  Vérification...
                </span>
              )}
              {!checking && isInternal === true && (
                <span className="badge badge-free">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  Utilisateur Bizaflow — Appels gratuits
                </span>
              )}
              {!checking && isInternal === false && isBZTNumber(phone) && (
                <span className="badge badge-paid">
                  Numéro non trouvé
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 1 }} id="submit-contact">
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
