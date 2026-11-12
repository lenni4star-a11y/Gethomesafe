import { useState } from 'react';
import type { Contact } from '../../core/contacts';
import type { Place } from '../geocode';
import { ContactsEditor } from './ContactsEditor';
import { PlaceInput } from './PlaceInput';
import { SoundCheck } from './SoundCheck';
import { emergencyText } from '../../core/helplines';
import { currentCity } from '../region';

interface Props {
  home: Place | null;
  onHomeChange: (p: Place | null) => void;
  contacts: Contact[];
  onContactsChange: (c: Contact[]) => void;
  bbox: [number, number, number, number];
  onLocateHome: () => void;
  onShowPrivacy: () => void;
  onDone: () => void;
}

const STEPS = 4;

/** Kurze Einführung beim ersten Start (überspringbar, in den Einstellungen erneut aufrufbar) */
export function Onboarding({ home, onHomeChange, contacts, onContactsChange, bbox, onLocateHome, onShowPrivacy, onDone }: Props) {
  const [step, setStep] = useState(0);
  const next = () => (step < STEPS - 1 ? setStep(step + 1) : onDone());

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Einführung">
      <div className="ob-card">
        <div className="ob-top">
          <span className="ob-dots" aria-label={`Schritt ${step + 1} von ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <i key={i} className={i === step ? 'on' : ''} />
            ))}
          </span>
          <button type="button" className="link-btn" onClick={onDone}>
            Überspringen
          </button>
        </div>

        {step === 0 && (
          <section>
            <h2>Willkommen bei Goodway</h2>
            <p className="ob-claim">Komm gut heim.</p>
            <p>Diese App hilft dir, abends und nachts sicherer nach Hause zu kommen.</p>
            <ul className="ob-list">
              <li>
                <b>Sicherster Heimweg:</b> bevorzugt beleuchtete Wege und Orte, die gerade offen sind.
              </li>
              <li>
                <b>Wege bewerten:</b> Wie sicher hast du dich wo und wann gefühlt?
              </li>
              <li>
                <b>Begleitung:</b> Die App fragt regelmäßig nach, ob alles okay ist, und hilft dir, Kontakte zu benachrichtigen.
              </li>
              <li>
                <b>SOS-Knopf:</b> Notrufe, Hilfsstellen, Fake-Anruf und lauter Alarm – immer rechts unten.
              </li>
            </ul>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2>Was die App nicht kann</h2>
            <ul className="ob-list warn">
              <li>
                <b>Kein Ersatz für den Notruf.</b> Im Notfall direkt {emergencyText(currentCity())} anrufen. Die App ruft nie selbst die Polizei.
              </li>
              <li>
                <b>Bildschirm anlassen:</b> Bei gesperrtem Bildschirm oder in einer anderen App pausiert der Browser die Begleitung.
              </li>
              <li>
                <b>iPhone vibriert nicht:</b> Web-Apps dürfen dort nicht vibrieren. Stattdessen gibt es lauten Ton und einen blinkenden Bildschirm.
              </li>
              <li>
                <b>Prototyp:</b> Die Einschätzungen beruhen auf offenen Daten und können Lücken haben. Nachrichten an Kontakte schickst du selbst ab.
              </li>
            </ul>
            <button type="button" className="link-btn" onClick={onShowPrivacy}>
              Was wird gespeichert? (Datenschutz)
            </button>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2>Zuhause und Notfallkontakte</h2>
            <p className="muted">Beides ist freiwillig und bleibt nur auf diesem Gerät.</p>
            <PlaceInput
              label={home ? `Zuhause: ${home.label}` : 'Zuhause (Adresse suchen)'}
              value={null}
              onChange={(p) => p && onHomeChange({ ...p, kind: 'home' })}
              bbox={bbox}
              onLocate={onLocateHome}
              onPickOnMap={() => {}}
              picking={false}
              hidePick
            />
            <h3>Notfallkontakte</h3>
            <ContactsEditor contacts={contacts} onChange={onContactsChange} />
          </section>
        )}

        {step === 3 && (
          <section>
            <h2>Ton testen</h2>
            <p>
              Rückfragen, Fake-Anruf und Alarm sollen laut sein. Tippe auf „Testton“ und dreh die <b>Medienlautstärke</b> hoch, während der Ton läuft.
            </p>
            <SoundCheck voiceMode="auto" />
            <p className="fineprint">Die Einführung findest du später wieder unter ⚙ Einstellungen.</p>
          </section>
        )}

        <div className="ob-actions">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              Zurück
            </button>
          )}
          <button type="button" className="btn primary" onClick={next}>
            {step < STEPS - 1 ? 'Weiter' : "Los geht's"}
          </button>
        </div>
      </div>
    </div>
  );
}
