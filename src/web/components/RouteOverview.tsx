// „Weg im Überblick“: die gewählte Route als Streifen von Start bis Ziel,
// damit man vor der Entscheidung sieht, wie der Weg aufgebaut ist – ohne die Karte lesen zu müssen.

import type { Hint, RouteSummary } from '../../core/analysis';
import { lineLength } from '../../core/geo';
import type { LngLat } from '../../core/types';
import { formatDistance } from '../format';
import { PLACE_META, PLACE_ORDER } from '../places';
import { CLASS_COLORS } from './MapView';
import { LineBadge } from './Icon';
import { formatClock, lineColor } from '../../core/transit';

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
  let ride = 0;
  const color = (l: { line: string; mode: number; color?: string }) => l.color ?? lineColor(l.line, l.mode);
  return (
    <section className="overview" aria-labelledby="overview-h">
      <h3 id="overview-h">Weg im Überblick</h3>

      {/* Kurzfassung wie in Karten-Apps: Gehen › U3 › U1 › Gehen */}
      <p className="tr-chain">
        {legs.map((l, i) => (
          <span key={i} className="tr-chain-item">
            {i > 0 && <span className="tr-sep" aria-hidden="true">›</span>}
            {l.type === 'walk' ? (
              <span className="tr-walk">
                <WalkIcon /> {Math.max(1, Math.round(l.minutes))}
              </span>
            ) : (
              <LineBadge line={l.line} mode={l.mode} color={color(l)} />
            )}
          </span>
        ))}
      </p>

      <ol className="tr-steps">
        {legs.map((l, i) => {
          if (l.type === 'walk')
            return (
              <li key={i} className="tr-step tr-step-walk">
                <span className="tr-rail tr-rail-walk" aria-hidden="true" />
                <span>
                  zu Fuß {formatDistance(l.meters)} · etwa {Math.max(1, Math.round(l.minutes))} min
                </span>
              </li>
            );
          const c = color(l);
          ride++;
          return (
            <li key={i} className="tr-step">
              <span className="tr-rail" style={{ background: c }} aria-hidden="true" />
              <span className="tr-ride">
                <b>
                  {formatClock(l.departMin)} {l.from.name}
                </b>
                <span>
                  <LineBadge line={l.line} mode={l.mode} color={c} /> Richtung {l.headsign}
                </span>
                <span className="muted">
                  {l.stopCount} {l.stopCount === 1 ? 'Station' : 'Stationen'} · {Math.max(1, l.arriveMin - l.departMin)} min
                  {l.waitMin ? ` · ${l.waitMin} min warten${ride > 1 ? ' (Umstieg)' : ''}` : ''}
                  {route.dark && !l.from.lit ? ' · Haltestelle: Beleuchtung unbekannt' : ''}
                </span>
                <b>
                  {formatClock(l.arriveMin)} {l.to.name}
                </b>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WalkIcon() {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-label="zu Fuß" role="img">
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m10 21 2-6 3 3v3M9.5 11.5 12 8l3 3 2.5 1M12 8l-2 7" />
    </svg>
  );
}
