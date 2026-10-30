import type { Hint, RouteSummary } from '../../core/analysis';
import { closesAt } from '../../core/openingHours';
import type { LngLat, Poi } from '../../core/types';
import { formatDistance, formatDuration } from '../format';
import { PLACE_META, PLACE_ORDER, placeKindLabel, placeName } from '../places';
import { CLASS_COLORS } from './MapView';

const HINT_ICON: Record<Hint['kind'], string> = {
  dark: '●',
  unknown: '◐',
  park: '🌳',
  tunnel: '⤓',
  steps: '≡',
  track: '∿',
};

/** Straßenfotos von Mapillary auf der Webseite (ohne Schlüssel ansehbar) */
export const mapillaryUrl = ([lon, lat]: LngLat) => `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=18&focus=photo`;

interface Props {
  route: RouteSummary;
  date: Date;
  onFocus: (p: LngLat) => void;
}

export function RouteDetails({ route, date, onFocus }: Props) {
  const sensitive = route.hints.filter((h) => h.kind !== 'steps');
  return (
    <div className="details">
      <ClassBar route={route} />
      {route.dark && (
        <p className="fineprint">
          Beleuchtung: {Math.round(route.lit.yes * 100)} % beleuchtet, {Math.round(route.lit.unknown * 100)} % unbekannt, {Math.round(route.lit.no * 100)} % unbeleuchtet.
        </p>
      )}

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
        </section>
      )}

      <OpenPlaces places={route.openPlaces} date={date} onFocus={onFocus} />

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

      <p className="fineprint">Dauer: ca. {formatDuration(route.seconds)} bei gemütlichem Gehtempo.</p>
    </div>
  );
}

function OpenPlaces({ places, date, onFocus }: { places: Poi[]; date: Date; onFocus: (p: LngLat) => void }) {
  const when = date.toLocaleString('de-AT', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  if (!places.length)
    return (
      <section aria-labelledby="places-h">
        <h3 id="places-h">Geöffnet am Weg</h3>
        <p className="muted">Zur gewählten Zeit ({when}) ist uns kein geöffneter Ort direkt am Weg bekannt.</p>
      </section>
    );
  const groups = PLACE_ORDER.map((cat) => ({ cat, list: places.filter((p) => p.cat === cat) })).filter((g) => g.list.length);
  return (
    <section aria-labelledby="places-h">
      <h3 id="places-h">
        Geöffnet am Weg <span className="muted">({places.length}, {when})</span>
      </h3>
      {groups.map((g) => (
        <details key={g.cat} className="place-group" open={g.cat === 'police' || g.list.length <= 4}>
          <summary>
            <span aria-hidden>{PLACE_META[g.cat].icon}</span> {PLACE_META[g.cat].label} ({g.list.length})
          </summary>
          <ul className="places">
            {g.list.map((p) => {
              const until = closesAt(p, date);
              return (
                <li key={p.id}>
                  <button type="button" className="link-btn" onClick={() => onFocus([p.lon, p.lat])}>
                    {placeName(p)}
                  </button>
                  <span className="muted">
                    {' '}
                    · {placeKindLabel(p)}
                    {until ? ` · bis ${until.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      <p className="fineprint">
        Laut Öffnungszeiten in OpenStreetMap, Öffi-Stationen laut ungefähren Betriebszeiten der Wiener Linien. Orte ohne Öffnungszeiten zählen wir nicht mit.
      </p>
    </section>
  );
}

export function ClassBar({ route }: { route: RouteSummary }) {
  const parts = [
    { key: 'good', label: 'grün', v: route.classes.good },
    { key: 'medium', label: 'gelb', v: route.classes.medium },
    { key: 'bad', label: 'rot', v: route.classes.bad },
  ] as const;
  return (
    <div className="litbar-wrap">
      <div className="litbar" role="img" aria-label={parts.map((p) => `${Math.round(p.v * 100)} % ${p.label}`).join(', ')}>
        {parts.map((p) =>
          p.v > 0 ? <span key={p.key} className={`seg-${p.key}`} style={{ width: `${p.v * 100}%`, background: CLASS_COLORS[p.key] }} /> : null,
        )}
      </div>
      <div className="legend" aria-hidden>
        {parts.map((p) => (
          <span key={p.key}>
            <i className="dot" style={{ background: CLASS_COLORS[p.key] }} /> {p.label} {Math.round(p.v * 100)} %
          </span>
        ))}
      </div>
    </div>
  );
}
