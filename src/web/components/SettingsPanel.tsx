import type { Settings } from '../../core/settings';
import type { ParkAvoidance } from '../../core/safety';
import { Modal } from './Modal';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  /** weitere Abschnitte (z. B. Begleitmodus) */
  children?: React.ReactNode;
}

const PARK_LABELS: Record<ParkAvoidance, string> = {
  0: 'egal',
  1: 'leicht meiden',
  2: 'meiden (Standard)',
  3: 'stark meiden',
};

export function SettingsPanel({ settings, onChange, onClose, children }: Props) {
  return (
    <Modal title="Einstellungen" onClose={onClose}>
      <section className="settings-section">
        <h3>Route</h3>
        <label className="field">
          <span>
            Parks nachts: <b>{PARK_LABELS[settings.parkAvoidance]}</b>
          </span>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={settings.parkAvoidance}
            onChange={(e) => onChange({ ...settings, parkAvoidance: Number(e.target.value) as ParkAvoidance })}
            aria-valuetext={PARK_LABELS[settings.parkAvoidance]}
          />
        </label>
        <p className="fineprint">Wege durch oder direkt neben Parks werden nachts abgewertet, aber nie ganz ausgeschlossen.</p>
      </section>

      <section className="settings-section">
        <h3>Straßenfotos (Mapillary)</h3>
        <label className="field">
          <span>Zugangsschlüssel (optional)</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="MLY|…"
            value={settings.mapillaryToken}
            onChange={(e) => onChange({ ...settings, mapillaryToken: e.target.value.trim() })}
          />
        </label>
        <p className="fineprint">
          Mit einem kostenlosen Schlüssel von Mapillary zeigt die Vorschau echte Straßenfotos. Ohne Schlüssel gibt es eine Kamerafahrt über die Karte. Der Schlüssel bleibt nur auf diesem Gerät.
        </p>
      </section>

      {children}
    </Modal>
  );
}
