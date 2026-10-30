import { useState } from 'react';
import { normalizePhone, type Contact } from '../../core/contacts';

interface Props {
  contacts: Contact[];
  onChange: (c: Contact[]) => void;
}

/** Notfallkontakte anlegen, bearbeiten, löschen (nur auf diesem Gerät gespeichert) */
export function ContactsEditor({ contacts, onChange }: Props) {
  // Ohne Kontakte gleich das Formular zeigen
  const [editing, setEditing] = useState<Contact | null>(contacts.length === 0 ? { id: '', name: '', phone: '' } : null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEdit = (c: Contact | null) => {
    setEditing(c ?? { id: '', name: '', phone: '' });
    setName(c?.name ?? '');
    setPhone(c?.phone ?? '');
    setError(null);
  };

  const saveContact = () => {
    if (!name.trim()) return setError('Bitte einen Namen eingeben.');
    if (normalizePhone(phone).replace(/\D/g, '').length < 6) return setError('Bitte eine gültige Telefonnummer eingeben.');
    const c: Contact = { id: editing?.id || crypto.randomUUID?.() || String(Date.now()), name: name.trim(), phone: phone.trim() };
    onChange(editing?.id ? contacts.map((x) => (x.id === c.id ? c : x)) : [...contacts, c]);
    setEditing(null);
  };

  return (
    <div className="contacts-editor">
      {contacts.length === 0 && !editing && <p className="muted">Noch keine Kontakte. Lege eine Person an, die dir im Notfall hilft.</p>}
      <ul className="contact-list">
        {contacts.map((c) => (
          <li key={c.id}>
            <span>
              <b>{c.name}</b> <span className="muted">{c.phone}</span>
            </span>
            <span className="row-actions">
              <button type="button" className="link-btn" onClick={() => startEdit(c)}>
                Bearbeiten
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => window.confirm(`${c.name} wirklich löschen?`) && onChange(contacts.filter((x) => x.id !== c.id))}
              >
                Löschen
              </button>
            </span>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="contact-form">
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Telefonnummer</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0664 1234567" autoComplete="tel" />
          </label>
          {error && <p className="message">{error}</p>}
          <div className="actions">
            <button type="button" className="btn primary" onClick={saveContact}>
              Speichern
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => startEdit(null)}>
          + Kontakt hinzufügen
        </button>
      )}
      <p className="fineprint">Kontakte bleiben nur auf diesem Gerät gespeichert.</p>
    </div>
  );
}
