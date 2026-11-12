import type { Settings } from '../../core/settings';
import type { ParkAvoidance } from '../../core/safety';
import { Modal } from './Modal';
import { getMapStyle, setMapStyle, type MapStyleChoice } from '../mapStyle';

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
      <h2 className="settings-group">Weg und Karte</h2>
      <section className="settings-section">
        <h3>Parks</h3>
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
        <p className="fineprint">Nachts zugesperrte Parks werden immer umgangen.</p>
      </section>

      <section className="settings-section">
        <h3>Karte</h3>
        <label className="field">
          <select
            aria-label="Aussehen der Karte"
            value={getMapStyle()}
            onChange={(e) => {
              setMapStyle(e.target.value as MapStyleChoice);
              window.location.reload(); // Karte mit neuem Stil laden
            }}
          >
            <option value="auto">Automatisch: tagsüber hell, nachts dunkel</option>
            <option value="hell">Immer hell</option>
            <option value="dunkel">Immer dunkel</option>
          </select>
        </label>
        <p className="fineprint">Lädt die App kurz neu.</p>
      </section>

      {children}
    </Modal>
  );
}
