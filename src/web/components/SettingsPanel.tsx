import type { Settings } from '../../core/settings';
import type { ParkAvoidance } from '../../core/safety';
import { Modal } from './Modal';
import { SoundCheck } from './SoundCheck';
import { BUILT_IN_TOKEN } from '../mapillary';

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
        <h3>Ton, Stimme und Vibration</h3>
        <SoundCheck voiceMode={settings.voice} />
        <label className="field">
          <span>Stimme im Anruf</span>
          <select value={settings.voice} onChange={(e) => onChange({ ...settings, voice: e.target.value as Settings['voice'] })}>
            <option value="auto">Automatisch (Gerätestimme, sonst Aufnahme)</option>
            <option value="device">Nur Gerätestimme</option>
            <option value="recording">Nur aufgenommene Stimme</option>
          </select>
        </label>
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
          {BUILT_IN_TOKEN
            ? 'Die Straßenfotos sind für alle eingerichtet. Hier nur einen eigenen Schlüssel eintragen, wenn du einen anderen verwenden möchtest.'
            : 'In dieser Version ist noch kein Schlüssel eingebaut. Mit einem eigenen kostenlosen Mapillary-Schlüssel siehst du trotzdem Straßenfotos.'}{' '}
          Ein hier eingetragener Schlüssel bleibt nur auf diesem Gerät.
        </p>
      </section>

      {children}
    </Modal>
  );
}
