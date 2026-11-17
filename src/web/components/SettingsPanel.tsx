import type { Settings } from '../../core/settings';
import { Modal } from './Modal';
import { getMapStyle, setMapStyle, type MapStyleChoice } from '../mapStyle';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  /** weitere Abschnitte (z. B. Begleitmodus) */
  children?: React.ReactNode;
}


export function SettingsPanel({ settings, onChange, onClose, children }: Props) {
  return (
    <Modal title="Einstellungen" onClose={onClose}>
      <h2 className="settings-group">Weg und Karte</h2>
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
        <label className="check-row">
          <input type="checkbox" checked={settings.nightLights !== false} onChange={(e) => onChange({ ...settings, nightLights: e.target.checked })} />
          <span>Nachts beleuchtete Straßen zeigen</span>
        </label>
      </section>

      {children}
    </Modal>
  );
}
