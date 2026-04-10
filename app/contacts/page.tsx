'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/app/components/AppProvider';
import ContactCard from '@/app/components/ContactCard';
import AddContactModal from '@/app/components/AddContactModal';
import { filterContacts } from '@/app/lib/utils';

export default function ContactsPage() {
  const { contacts, addContact, deleteContact, toggleFavorite, startCall } = useApp();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'internal' | 'external' | 'favorites'>('all');

  const filtered = useMemo(() => {
    let result = contacts;
    if (filter === 'internal') result = result.filter((c) => c.isInternal);
    else if (filter === 'external') result = result.filter((c) => !c.isInternal);
    else if (filter === 'favorites') result = result.filter((c) => c.isFavorite);
    return filterContacts(result, search);
  }, [contacts, search, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const internalCount = contacts.filter((c) => c.isInternal).length;
  const externalCount = contacts.filter((c) => !c.isInternal).length;

  return (
    <div className="page-container">
      <div className="glow-bg" />

      <h1 className="page-header" style={{ position: 'relative', zIndex: 1 }}>
        <span className="page-header-gradient">Contacts</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--foreground-muted)', marginLeft: 8 }}>
          ({contacts.length})
        </span>
      </h1>

      <div className="search-wrapper">
        <div className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher un contact ou numéro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          id="contact-search"
        />
      </div>

      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Tous ({contacts.length})
        </button>
        <button className={`filter-tab ${filter === 'internal' ? 'active' : ''}`} onClick={() => setFilter('internal')}>
          Bizaflow ({internalCount})
        </button>
        <button className={`filter-tab ${filter === 'external' ? 'active' : ''}`} onClick={() => setFilter('external')}>
          Externes ({externalCount})
        </button>
        <button className={`filter-tab ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilter('favorites')}>
          ★ Favoris
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-text">
            {search ? 'Aucun contact trouvé' : 'Aucun contact'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((contact, i) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onCall={startCall}
              onToggleFavorite={toggleFavorite}
              onDelete={deleteContact}
              delay={i * 40}
            />
          ))}
        </div>
      )}

      <button className="fab" onClick={() => setShowAddModal(true)} id="add-contact-fab">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <AddContactModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addContact}
      />
    </div>
  );
}
