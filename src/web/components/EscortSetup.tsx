import { useState } from 'react';
import type { Contact } from '../../core/contacts';
import type { EscortSettings } from '../../core/settings';
import { canVibrate, isIOS, keepScreenOn, unlockAudio, vibrate } from '../signals';
import { SoundCheck } from './SoundCheck';
import { ContactsEditor } from './ContactsEditor';
import { PinPad } from './PinPad';
import { Modal } from './Modal';

interface Props {
  destination: string;
  contacts: Contact[];
  onContactsChange: (c: Contact[]) => void;
  settings: EscortSettings;
  onSettingsChange: (s: EscortSettings) => void;
  onStart: (pin: string, destination: string, contactIds: string[]) => void;
  onClose: () => void;
}

export function EscortSettingsFields({ settings, onChange }: { settings: EscortSettings; onChange: (s: EscortSettings) => void }) {
  return (
    <>
      <fieldset className="field radio-group">
        <legend>Wie soll ich nachfragen?</legend>
        <label>
          <input type="radio" name="mode" checked={settings.mode === 'interval'} onChange={() => onChange({ ...settings, mode: 'interval' })} />
          <span>
            <b>Regelmäßig bestätigen</b>
            <br />
            <span className="muted">Du tippst alle {settings.intervalSec} Sekunden auf „Alles okay“.</span>
          </span>
        </label>
        <label>
          <input type="radio" name="mode" checked={settings.mode === 'hold'} onChange={() => onChange({ ...settings, mode: 'hold' })} />
          <span>
            <b>Knopf gedrückt halten</b>
            <br />
            <span className="muted">Lässt du los, frage ich nach, ob alles okay ist.</span>
          </span>
        </label>
      </fieldset>
      {settings.mode === 'interval' && (
        <label className="field">
          <span>Bestätigen alle</span>
          <select value={settings.intervalSec} onChange={(e) => onChange({ ...settings, intervalSec: Number(e.target.value) })}>
            {[30, 60, 90, 120, 180, 300].map((s) => (
              <option key={s} value={s}>
                {s < 60 ? `${s} Sekunden` : `${s / 60} ${s === 60 ? 'Minute' : 'Minuten'}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Zeit zum Antworten auf die Rückfrage</span>
        <select value={settings.responseSec} onChange={(e) => onChange({ ...settings, responseSec: Number(e.target.value) })}>
          {[10, 15, 20, 30, 45, 60].map((s) => (
            <option key={s} value={s}>
              {s} Sekunden
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Anrufversuche, bevor Kontakte benachrichtigt werden</span>
        <select value={settings.callAttempts} onChange={(e) => onChange({ ...settings, callAttempts: Number(e.target.value) })}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Begleitung starten: Ziel, Kontakte, Modus, PIN */
export function EscortSetup({ destination, contacts, onContactsChange, settings, onSettingsChange, onStart, onClose }: Props) {
  const [dest, setDest] = useState(destination);
  const [selected, setSelected] = useState<string[]>(contacts.map((c) => c.id));
  const [pin, setPin] = useState('');
  const [pinStep, setPinStep] = useState<'first' | 'repeat' | null>(null);
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [editContacts, setEditContacts] = useState(contacts.length === 0);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    if (pin.length < 4) return setError('Bitte zuerst eine PIN festlegen.');
    // Direkt im Tipp: Ton, Sprache, Vibration und wacher Bildschirm freischalten
    unlockAudio();
    vibrate(150);
    void keepScreenOn();
    onStart(pin, dest.trim() || 'nach Hause', selected.filter((id) => contacts.some((c) => c.id === id)));
  };

  return (
    <Modal title="Begleitung starten" onClose={onClose}>
      <label className="field">
        <span>Ziel</span>
        <input type="text" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="z. B. nach Hause" />
      </label>

      <section className="settings-section">
        <h3>Notfallkontakte</h3>
        {editContacts ? (
          <>
            <ContactsEditor
              contacts={contacts}
              onChange={(c) => {
                onContactsChange(c);
                setSelected(c.map((x) => x.id));
              }}
            />
            {contacts.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setEditContacts(false)}>
                Fertig
              </button>
            )}
          </>
        ) : (
          <>
            {contacts.map((c) => (
              <label key={c.id} className="check-row">
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
                />
                <span>
                  {c.name} <span className="muted">{c.phone}</span>
                </span>
              </label>
            ))}
            <button type="button" className="link-btn" onClick={() => setEditContacts(true)}>
              Kontakte bearbeiten
            </button>
          </>
        )}
        {contacts.length === 0 && <p className="fineprint">Ohne Kontakt geht die Eskalation direkt zum Notruf-Bildschirm.</p>}
      </section>

      <section className="settings-section">
        <EscortSettingsFields settings={settings} onChange={onSettingsChange} />
      </section>

      <section className="settings-section">
        <h3>PIN zum Beenden</h3>
        <p className="fineprint">Mit dieser PIN beendest du die Begleitung oder brichst einen Fehlalarm ab. So kann das niemand anderes einfach tun.</p>
        <button type="button" className="btn" onClick={() => (setPinError(null), setPinStep('first'))}>
          {pin ? '✓ PIN festgelegt · ändern' : 'PIN festlegen'}
        </button>
      </section>

      <section className="settings-section">
        <h3>Vorher kurz testen</h3>
        <p className="fineprint">
          <b>Medienlautstärke hochdrehen</b> (Lautstärketaste drücken, während der Testton läuft). Rückfragen und Anrufe sollen laut sein, auch zur Abschreckung.
        </p>
        <SoundCheck voiceMode="auto" />
        {(isIOS() || !canVibrate()) && (
          <p className="fineprint">
            Auf dem iPhone können Web-Apps nicht vibrieren. Stattdessen gibt es einen lauten Ton, einen blinkenden Bildschirm und eine große Anzeige.
          </p>
        )}
      </section>

      <div className="notice">
        <b>Wichtig: Bildschirm anlassen.</b> Die App hält den Bildschirm wach. Sperrst du ihn oder wechselst du in eine andere App, pausiert der Browser die Begleitung: keine Rückfragen,
        kein Ton, kein Standort. Kommst du zurück, holt die App verpasste Rückfragen sofort nach. Dein Standort wird nur während der Begleitung verwendet, gespeichert wird nur die letzte
        Position, beim Beenden wird sie gelöscht. <b>Kein Ersatz für den Notruf.</b>
      </div>

      {error && <p className="message">{error}</p>}
      {pinStep && (
        <PinPad
          title={pinStep === 'first' ? 'PIN festlegen' : 'PIN wiederholen'}
          text={pinStep === 'first' ? 'Mindestens 4 Ziffern. Damit beendest du die Begleitung.' : 'Bitte gib die PIN noch einmal ein.'}
          confirmLabel={pinStep === 'first' ? 'Weiter' : 'Speichern'}
          error={pinError}
          onCancel={() => setPinStep(null)}
          onSubmit={(p) => {
            if (pinStep === 'first') {
              setFirstPin(p);
              setPinError(null);
              setPinStep('repeat');
            } else if (p === firstPin) {
              setPin(p);
              setError(null);
              setPinStep(null);
            } else {
              setPinError('Die PINs stimmen nicht überein. Bitte neu festlegen.');
              setPinStep('first');
            }
          }}
        />
      )}
      <button type="button" className="btn primary big" onClick={start}>
        Begleitung starten
      </button>
    </Modal>
  );
}
