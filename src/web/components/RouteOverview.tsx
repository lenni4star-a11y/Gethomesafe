// „Weg im Überblick“: die gewählte Route als Streifen von Start bis Ziel,
// damit man vor der Entscheidung sieht, wie der Weg aufgebaut ist – ohne die Karte lesen zu müssen.

import type { Hint, RouteSummary } from '../../core/analysis';
import { lineLength } from '../../core/geo';
import type { LngLat } from '../../core/types';
import { formatDistance } from '../format';
import { PLACE_META, PLACE_ORDER } from '../places';
import { CLASS_COLORS } from './MapView';

const HINT_LABEL: Record<Hint['kind'], string> = {
  dark: 'dunkel',
  unknown: 'Licht unbekannt',
  park: 'Park',
  tunnel: 'Unterführung',
  steps: 'Stiege',
  track: 'Feldweg',
};

const CLASS_LABEL = { good: 'gut', medium: 'mittel', bad: 'schlecht' } as const;

interface Props {
  route: RouteSummary;
  onFocus: (p: LngLat) => void;
}

export function RouteOverview({ route, onFocus }: Props) {
  // Öffi-Routen: Fahrten sind nicht Teil des Streifens, deshalb nur bei Fußrouten
  if (route.mode === 'transit') return <TransitOverview route={route} />;

  const parts = route.segments.map((s) => ({ cls: s.cls, len: lineLength(s.coords) }));
  const total = parts.reduce((a, p) => a + p.len, 0) || 1;
  const hints = route.hints.filter((h) => h.kind !== 'park' || route.dark);
  const groups = PLACE_ORDER.map((cat) => ({ cat, n: route.openPlaces.filter((p) => p.cat === cat).length })).filter((g) => g.n);

  return (
    <section className="overview" aria-labelledby="overview-h">
      <h3 id="overview-h">Weg im Überblick</h3>

      <div className="ov-strip-wrap">
        <div
          className="ov-strip"
          role="img"
          aria-label={`Von Start bis Ziel: ${parts.map((p) => `${formatDistance(p.len)} ${CLASS_LABEL[p.cls]}`).join(', ')}`}
        >
          {parts.map((p, i) => (
            <span
              key={i}
              className={`ov-part ov-${p.cls}`}
              style={{ width: `${(p.len / total) * 100}%`, background: CLASS_COLORS[p.cls] }}
            />
          ))}
        </div>
        {hints.map((h, i) => (
          <span key={i} className="ov-tick" style={{ left: `${Math.min(100, ((h.offset + h.length / 2) / total) * 100)}%` }} aria-hidden="true" />
        ))}
        <div className="ov-ends" aria-hidden="true">
          <span>Start</span>
          <span>Ziel</span>
        </div>
      </div>

      <ul className="ov-list">
        <li>
          {Math.round(route.classes.good * 100)} % gut, {Math.round(route.classes.medium * 100)} % mittel,{' '}
          {Math.round(route.classes.bad * 100)} % schlecht
          {route.dark ? ` · ${Math.round(route.lit.yes * 100)} % beleuchtet` : ''}
        </li>
        {hints.length > 0 ? (
          hints.slice(0, 4).map((h, i) => (
            <li key={i}>
              <button type="button" className="link-btn ov-hint" onClick={() => onFocus(h.at)}>
                nach {formatDistance(h.offset)}: {HINT_LABEL[h.kind]} ({formatDistance(h.length)})
              </button>
            </li>
          ))
        ) : (
          <li>Keine Unterführungen, Stiegen oder dunklen Stücke.</li>
        )}
        {hints.length > 4 && <li className="muted">und {hints.length - 4} weitere Stellen (siehe Details)</li>}
        <li>
          {route.openPlaces.length
            ? `${route.openPlaces.length} geöffnete Orte am Weg: ${groups.map((g) => `${g.n} ${PLACE_META[g.cat].label}`).join(', ')}`
            : 'Zur gewählten Zeit keine geöffneten Orte direkt am Weg bekannt'}
        </li>
      </ul>
    </section>
  );
}

function TransitOverview({ route }: { route: RouteSummary }) {
  const legs = route.transit?.legs ?? [];
  return (
    <section className="overview" aria-labelledby="overview-h">
      <h3 id="overview-h">Weg im Überblick</h3>
      <ol className="ov-list ov-steps">
        {legs.map((l, i) =>
          l.type === 'walk' ? (
            <li key={i}>zu Fuß {formatDistance(l.meters)}</li>
          ) : (
            <li key={i}>
              {l.line} von {l.from.name} bis {l.to.name}
              {l.waitMin ? ` (${l.waitMin} min warten)` : ''}
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
