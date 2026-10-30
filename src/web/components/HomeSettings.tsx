import type { Place } from '../geocode';
import { PlaceInput } from './PlaceInput';

interface Props {
  home: Place | null;
  onHomeChange: (p: Place | null) => void;
  favorites: Place[];
  onFavoritesChange: (f: Place[]) => void;
  showOnMap: boolean;
  onShowOnMapChange: (v: boolean) => void;
  bbox: [number, number, number, number];
  onPickOnMap: () => void;
  onLocate: () => void;
}

/** Zuhause und Lieblingsorte verwalten (nur auf diesem Gerät gespeichert) */
export function HomeSettings({ home, onHomeChange, favorites, onFavoritesChange, showOnMap, onShowOnMapChange, bbox, onPickOnMap, onLocate }: Props) {
  return (
    <section className="settings-section">
      <h3>Zuhause</h3>
      <PlaceInput
        label={home ? `Gespeichert: ${home.label}` : 'Adresse suchen'}
        value={null}
        onChange={(p) => p && onHomeChange({ ...p, kind: 'home' })}
        bbox={bbox}
        onLocate={onLocate}
        onPickOnMap={onPickOnMap}
        picking={false}
      />
      <label className="check-row">
        <input type="checkbox" checked={showOnMap} onChange={(e) => onShowOnMapChange(e.target.checked)} />
        <span>Zuhause auf der Karte zeigen (neutrales Symbol ohne Beschriftung)</span>
      </label>
      {home && (
        <button type="button" className="btn small" onClick={() => window.confirm('Zuhause wirklich löschen?') && onHomeChange(null)}>
          Zuhause löschen
        </button>
      )}
      <p className="fineprint">
        Deine Heimadresse bleibt nur auf diesem Gerät. Sie kommt nie in Bewertungen, auf einen Server oder in Nachrichten an Kontakte – die bekommen nur deinen aktuellen Standort.
      </p>

      <h3>Lieblingsorte</h3>
      {favorites.length === 0 && <p className="muted">Noch keine. Bei einem Ziel auf „☆ Merken“ tippen.</p>}
      <ul className="contact-list">
        {favorites.map((f, i) => (
          <li key={i}>
            <span>{f.label}</span>
            <button type="button" className="link-btn" onClick={() => onFavoritesChange(favorites.filter((_, j) => j !== i))}>
              Entfernen
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
