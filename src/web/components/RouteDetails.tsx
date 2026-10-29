import type { Hint, RouteSummary } from '../../core/analysis';
import type { LngLat } from '../../core/types';
import { formatDistance, formatDuration } from '../format';
import { LIT_COLORS, placeLabel } from './MapView';

const HINT_ICON: Record<Hint['kind'], string> = {
  dark: '●',
  unknown: '◐',
  park: '🌳',
  tunnel: '⤓',
  steps: '≡',
  track: '∿',
};

/** Straßenfotos von Mapillary (frei, ohne Account ansehbar) */
export const mapillaryUrl = ([lon, lat]: LngLat) => `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=18&focus=photo`;

interface Props {
  route: RouteSummary;
  onFocus: (p: LngLat) => void;
}

export function RouteDetails({ route, onFocus }: Props) {
  const sensitive = route.hints.filter((h) => h.kind !== 'steps');
  return (
    <div className="details">
      <LitBar route={route} />

      {sensitive.length > 0 && (
        <section aria-labelledby="hints-h">
          <h3 id="hints-h">Darauf kannst du dich einstellen</h3>
          <ul className="hint-list">
            {sensitive.map((h, i) => (
              <li key={i} className={`hint hint-${h.kind}`}>
                <span className="hint-icon" aria-hidden>
                  {HINT_ICON[h.kind]}
                </span>
                <span className="hint-text">
                  {h.text}
                  <span className="muted"> · nach {formatDistance(h.offset)}</span>
                </span>
                <span className="hint-actions">
                  <button type="button" className="link-btn" onClick={() => onFocus(h.at)}>
                    Zeigen
                  </button>
                  <a className="link-btn" href={mapillaryUrl(h.at)} target="_blank" rel="noreferrer">
                    Fotos
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <p className="fineprint">„Fotos“ öffnet Straßenbilder von Mapillary (von Freiwilligen aufgenommen, nicht überall vorhanden, oft bei Tag).</p>
        </section>
      )}

      <section aria-labelledby="steps-h">
        <h3 id="steps-h">Schritt für Schritt</h3>
        <ol className="steps">
          {route.instructions.map((s, i) => (
            <li key={i}>
              <button type="button" className="step" onClick={() => onFocus(s.at)}>
                <span>{s.text}</span>
                <span className="muted">{formatDistance(s.length)}</span>
              </button>
              {s.hints.length > 0 && <span className="step-hints">{s.hints.map((h) => h.text).join(' · ')}</span>}
            </li>
          ))}
          <li>
            <span className="step final">Ziel erreicht</span>
          </li>
        </ol>
      </section>

      {route.openPlaces.length > 0 && (
        <section aria-labelledby="places-h">
          <h3 id="places-h">Gerade geöffnet am Weg</h3>
          <ul className="places">
            {route.openPlaces.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button type="button" className="link-btn" onClick={() => onFocus([p.lon, p.lat])}>
                  {p.name ?? placeLabel(p.cat)}
                </button>
                <span className="muted"> · {placeLabel(p.cat)}</span>
              </li>
            ))}
            {route.openPlaces.length > 12 && <li className="muted">und {route.openPlaces.length - 12} weitere</li>}
          </ul>
          <p className="fineprint">Laut Öffnungszeiten in OpenStreetMap. Orte ohne Angaben zählen wir nicht mit.</p>
        </section>
      )}

      <p className="fineprint">
        Dauer: ca. {formatDuration(route.seconds)} bei gemütlichem Gehtempo.
      </p>
    </div>
  );
}

export function LitBar({ route }: { route: RouteSummary }) {
  const parts = [
    { key: 'yes', label: 'beleuchtet', v: route.lit.yes },
    { key: 'unknown', label: 'unbekannt', v: route.lit.unknown },
    { key: 'no', label: 'unbeleuchtet', v: route.lit.no },
  ] as const;
  return (
    <div className="litbar-wrap">
      <div className="litbar" role="img" aria-label={parts.map((p) => `${Math.round(p.v * 100)} % ${p.label}`).join(', ')}>
        {parts.map((p) =>
          p.v > 0 ? (
            <span key={p.key} className={`lit-${p.key}`} style={{ width: `${p.v * 100}%`, background: LIT_COLORS[p.key] }} />
          ) : null,
        )}
      </div>
      <div className="legend" aria-hidden>
        {parts.map((p) => (
          <span key={p.key}>
            <i className={`dot lit-${p.key}`} style={{ background: LIT_COLORS[p.key] }} /> {p.label} {Math.round(p.v * 100)} %
          </span>
        ))}
      </div>
    </div>
  );
}
