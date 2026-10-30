import { useState } from 'react';
import { buildMessage, smsLink, telLink, whatsappLink, type Contact, type MessageKind } from '../../core/contacts';
import { EMERGENCY, HELPLINES, SILENT_CALL } from '../../core/helplines';
import type { LngLat } from '../../core/types';
import { ContactsEditor } from './ContactsEditor';
import { Modal } from './Modal';

interface Props {
  contacts: Contact[];
  onContactsChange: (c: Contact[]) => void;
  onClose: () => void;
  /** Verzögerung in Sekunden: 0, 10 oder 30 */
  onFakeCall: (delaySec: number) => void;
  /** Sirene und blinkender Bildschirm */
  onAlarm: () => void;
  /** Während einer Begleitung: zuletzt bekannte Position */
  lastPosition?: { coords: LngLat; time: number } | null;
}

/** Standort einmalig abfragen (nur auf Knopfdruck, wird nicht gespeichert) */
export function currentPosition(): Promise<{ coords: LngLat; time: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation || !window.isSecureContext) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ coords: [p.coords.longitude, p.coords.latitude], time: Date.now() }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export function ContactActions({ contact, kind, lastPosition }: { contact: Contact; kind: MessageKind; lastPosition?: { coords: LngLat; time: number } | null }) {
  const [busy, setBusy] = useState(false);
  const send = async (via: 'sms' | 'whatsapp') => {
    setBusy(true);
    const pos = kind === 'arrived' ? null : (lastPosition ?? (await currentPosition()));
    setBusy(false);
    const body = buildMessage(kind, pos);
    window.location.href = via === 'sms' ? smsLink(contact.phone, body) : whatsappLink(contact.phone, body);
  };
  return (
    <div className="contact-actions">
      <span className="contact-name">{contact.name}</span>
      <a className="btn small" href={telLink(contact.phone)}>
        Anrufen
      </a>
      <button type="button" className="btn small" onClick={() => send('sms')} disabled={busy}>
        SMS
      </button>
      <button type="button" className="btn small" onClick={() => send('whatsapp')} disabled={busy}>
        WhatsApp
      </button>
    </div>
  );
}

export function EmergencyButtons() {
  return (
    <div className="emergency-buttons">
      {EMERGENCY.map((e) => (
        <a key={e.number} className="emergency-btn" href={`tel:${e.number}`}>
          <b>{e.number}</b>
          <span>{e.label}</span>
        </a>
      ))}
    </div>
  );
}

export function SilentCallHint() {
  return (
    <div className="silent-call">
      <p>
        <b>Stiller Notruf:</b> {SILENT_CALL.text}
      </p>
      <p>
        <a href={SILENT_CALL.ios} target="_blank" rel="noreferrer">
          DEC112 für iPhone
        </a>{' '}
        ·{' '}
        <a href={SILENT_CALL.android} target="_blank" rel="noreferrer">
          DEC112 für Android
        </a>{' '}
        ·{' '}
        <a href={SILENT_CALL.info} target="_blank" rel="noreferrer">
          Info von oesterreich.gv.at
        </a>
      </p>
    </div>
  );
}

/** Notfall-Menü: Notrufe, eigene Kontakte, Hilfsstellen, stiller Notruf, Fake-Anruf */
export function EmergencyMenu({ contacts, onContactsChange, onClose, onFakeCall, onAlarm, lastPosition }: Props) {
  const [editContacts, setEditContacts] = useState(false);
  return (
    <Modal title="Hilfe & Notruf" onClose={onClose} variant="sos-modal">
      <section className="sos-section sos-emergency" aria-labelledby="sos-notruf">
        <h3 id="sos-notruf">Notruf</h3>
        <EmergencyButtons />
        <p className="fineprint">Der Anruf startet direkt über dein Telefon. 112 funktioniert auch ohne SIM-PIN.</p>
        <SilentCallHint />
      </section>

      <section className="sos-section" aria-labelledby="sos-reden">
        <h3 id="sos-reden">Hilfe und Reden</h3>
        <ul className="helplines">
          {HELPLINES.map((h) => (
            <li key={h.number}>
              <a className="helpline-call" href={`tel:${h.dial}`}>
                <b>{h.name}</b>
                <span className="helpline-number">{h.number}</span>
              </a>
              <span className="muted">
                <span className={`allday ${h.allDay ? 'yes' : 'no'}`}>{h.allDay ? '24 h' : 'nicht 24 h'}</span> {h.description} {h.allDay ? '' : `(${h.hours}) `}
                <a href={h.source} target="_blank" rel="noreferrer">
                  Quelle
                </a>
              </span>
            </li>
          ))}
        </ul>
        <p className="fineprint">Nummern geprüft im Oktober 2026 auf offiziellen Seiten. Ein eigenes Heimwegtelefon für Wien haben wir nicht gefunden.</p>
      </section>

      <section className="sos-section" aria-labelledby="sos-kontakte">
        <h3 id="sos-kontakte">Meine Kontakte</h3>
        {editContacts ? (
          <>
            <ContactsEditor contacts={contacts} onChange={onContactsChange} />
            <button type="button" className="link-btn" onClick={() => setEditContacts(false)}>
              Fertig
            </button>
          </>
        ) : (
          <>
            {contacts.length === 0 && <p className="muted">Noch keine Kontakte gespeichert.</p>}
            {contacts.map((c) => (
              <ContactActions key={c.id} contact={c} kind="location" lastPosition={lastPosition} />
            ))}
            <button type="button" className="link-btn" onClick={() => setEditContacts(true)}>
              {contacts.length ? 'Kontakte bearbeiten' : '+ Kontakt anlegen'}
            </button>
            <p className="fineprint">SMS und WhatsApp öffnen eine fertige Nachricht mit deinem aktuellen Standort (nie deiner Heimadresse). Du schickst sie selbst ab.</p>
          </>
        )}
      </section>

      <section className="sos-section" aria-labelledby="sos-fake">
        <h3 id="sos-fake">Fake-Anruf</h3>
        <div className="tp-row">
          {[0, 10, 30].map((d) => (
            <button key={d} type="button" className="chip" onClick={() => onFakeCall(d)}>
              📞 {d === 0 ? 'Sofort' : `in ${d} s`}
            </button>
          ))}
        </div>
        <p className="fineprint">Dein Telefon klingelt laut, eine Stimme redet mit dir. Gut, um beschäftigt zu wirken oder einfach Gesellschaft zu haben.</p>
      </section>

      <div className="sos-footer">
        <button type="button" className="alarm-btn" onClick={onAlarm}>
          🚨 ALARM
          <small>sehr laute Sirene + blinkender Bildschirm</small>
        </button>
      </div>
    </Modal>
  );
}
