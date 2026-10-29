import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlanResult, Planner } from '../core/planner';
import type { RouteMode } from '../core/routing';
import { isDark } from '../core/sun';
import type { LngLat } from '../core/types';
import { MapView, type MapHandle } from './components/MapView';
import { PlaceInput } from './components/PlaceInput';
import { RouteDetails } from './components/RouteDetails';
import { getPlanner } from './data';
import { formatDistance, formatDuration, formatTime, toLocalInput } from './format';
import type { Place } from './geocode';

type Pick = 'start' | 'end' | null;

export function App() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [customTime, setCustomTime] = useState<Date | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState<RouteMode>('safest');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Pick>(null);
  const [flying, setFlying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const map = useRef<MapHandle>(null);

  useEffect(() => {
    getPlanner()
      .then(setPlanner)
      .catch(() => setMessage('Die Kartendaten konnten nicht geladen werden. Bitte Seite neu laden.'));
  }, []);

  const bbox = useMemo<[number, number, number, number]>(() => {
    if (!planner) return [16.28, 48.17, 16.43, 48.24];
    const b = planner.index.bezirke.filter((x) => !x.transit);
    return [Math.min(...b.map((x) => x.bbox[0])), Math.min(...b.map((x) => x.bbox[1])), Math.max(...b.map((x) => x.bbox[2])), Math.max(...b.map((x) => x.bbox[3]))];
  }, [planner]);

  const time = customTime ?? new Date();
  const dark = isDark(time);

  useEffect(() => {
    map.current?.setPoints(start?.coords ?? null, end?.coords ?? null);
  }, [start, end]);

  // Route berechnen, sobald Start und Ziel feststehen
  useEffect(() => {
    if (!planner || !start || !end) {
      setPlan(null);
      return;
    }
    const outside = [start, end].filter((p) => !planner.districtAt(p.coords));
    if (outside.length) {
      setPlan(null);
      setMessage(
        `${outside.map((p) => (p === start ? 'Der Start' : 'Das Ziel')).join(' und ')} liegt außerhalb des Pilotgebiets. ` +
          `Im Moment gibt es Daten für: ${planner.index.bezirke.filter((b) => !b.transit).map((b) => b.name).join(', ')}.`,
      );
      return;
    }
    let cancelled = false;
    setBusy(true);
    setMessage(null);
    planner
      .plan(start.coords, end.coords, customTime ?? new Date())
      .then((res) => {
        if (cancelled) return;
        if (!res) setMessage('Für diese Strecke haben wir leider keinen Fußweg gefunden.');
        setPlan(res);
      })
      .catch(() => !cancelled && setMessage('Beim Berechnen ist etwas schiefgegangen. Bitte versuch es noch einmal.'))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [planner, start, end, customTime]);

  useEffect(() => {
    map.current?.showPlan(plan, selected);
  }, [plan, selected]);

  const locate = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage('Der Standort ist nur über eine sichere Verbindung (https) verfügbar. Wähle den Start bitte über die Suche oder die Karte.');
      return;
    }
    setMessage('Standort wird gesucht …');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMessage(null);
        setStart({ label: 'Mein Standort', coords: [pos.coords.longitude, pos.coords.latitude], kind: 'location' });
      },
      (err) =>
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Du hast den Standortzugriff nicht erlaubt. Das ist in Ordnung, du kannst den Start auch suchen oder auf der Karte wählen.'
            : 'Dein Standort konnte gerade nicht bestimmt werden.',
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  const onMapClick = useCallback(
    (p: LngLat) => {
      if (!pick) return;
      const place: Place = { label: pick === 'start' ? 'Punkt auf der Karte (Start)' : 'Punkt auf der Karte (Ziel)', coords: p, kind: 'map' };
      if (pick === 'start') setStart(place);
      else setEnd(place);
      setPick(null);
    },
    [pick],
  );

  const chosen = plan?.[selected];
  const extra = plan && !plan.same ? plan.safest.seconds - plan.fastest.seconds : 0;

  const fly = () => {
    if (!chosen) return;
    setFlying(true);
    setExpanded(false);
    map.current?.flyAlong(chosen, () => setFlying(false));
  };

  return (
    <div className="app">
      <MapView ref={map} index={planner?.index ?? null} onMapClick={onMapClick} />

      <header className="topbar">
        <span className="brand">Gethomesafe</span>
        <span className="badge">Prototyp</span>
      </header>

      {pick && (
        <div className="pick-banner" role="status">
          Tippe auf die Karte, um {pick === 'start' ? 'den Start' : 'das Ziel'} festzulegen.
          <button type="button" className="link-btn" onClick={() => setPick(null)}>
            Abbrechen
          </button>
        </div>
      )}

      {flying && (
        <button type="button" className="stop-fly" onClick={() => (map.current?.stopFly(), setFlying(false))}>
          Vorschau beenden
        </button>
      )}

      {!flying && (
        <section className={`sheet ${expanded ? 'expanded' : ''}`} aria-label="Heimweg planen">
          <button type="button" className="grabber" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Bereich verkleinern' : 'Bereich vergrößern'}>
            <span />
          </button>

          <div className="inputs">
            <PlaceInput label="Von" value={start} onChange={setStart} bbox={bbox} onLocate={locate} onPickOnMap={() => setPick(pick === 'start' ? null : 'start')} picking={pick === 'start'} />
            <PlaceInput label="Nach" value={end} onChange={setEnd} bbox={bbox} onPickOnMap={() => setPick(pick === 'end' ? null : 'end')} picking={pick === 'end'} />
          </div>

          <div className="time-row">
            <span className={`daynight ${dark ? 'night' : 'day'}`}>{dark ? '☾ dunkel' : '☀ hell'}</span>
            <span>{customTime ? `Losgehen: ${formatTime(customTime)}` : 'Losgehen: jetzt'}</span>
            <label className="time-edit">
              <span className="sr-only">Uhrzeit ändern</span>
              <input
                type="datetime-local"
                value={toLocalInput(time)}
                onChange={(e) => setCustomTime(e.target.value ? new Date(e.target.value) : null)}
              />
            </label>
            {customTime && (
              <button type="button" className="link-btn" onClick={() => setCustomTime(null)}>
                Jetzt
              </button>
            )}
          </div>

          {message && (
            <p className="message" role="status">
              {message}
            </p>
          )}
          {busy && <p className="message" role="status">Route wird berechnet …</p>}

          {plan && (
            <>
              <div className="route-cards" role="radiogroup" aria-label="Route wählen">
                {(['safest', 'fastest'] as const).map((m) => {
                  const r = plan[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={selected === m}
                      className={`route-card ${selected === m ? 'selected' : ''}`}
                      onClick={() => setSelected(m)}
                    >
                      <span className="rc-title">{m === 'safest' ? 'Sicherste' : 'Schnellste'}</span>
                      <span className="rc-score" aria-label={`Sicherheitswert ${r.score} von 10`}>
                        <b>{r.score}</b>
                        <small>/10</small>
                      </span>
                      <span className="rc-meta">
                        {formatDuration(r.seconds)} · {formatDistance(r.length)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {plan.same ? (
                <p className="fineprint">Hier ist der schnellste Weg auch der sicherste.</p>
              ) : (
                extra > 30 && <p className="fineprint">Die sicherste Route dauert etwa {formatDuration(extra)} länger.</p>
              )}

              {chosen && (
                <>
                  <p className="reasons">{chosen.reasons.join(' · ')}</p>
                  <div className="actions">
                    <button type="button" className="btn primary" onClick={fly}>
                      Vorschau abfliegen
                    </button>
                    <button type="button" className="btn" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
                      {expanded ? 'Weniger' : 'Details'}
                    </button>
                  </div>
                  {expanded && (
                    <RouteDetails
                      route={chosen}
                      onFocus={(p) => {
                        setExpanded(false);
                        map.current?.focus(p);
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}

          {!plan && !message && !busy && (
            <p className="intro">
              Wähle Start und Ziel. Wir zeigen dir den schnellsten und den sichersten Weg, mit Beleuchtung und geöffneten Orten unterwegs.
            </p>
          )}

          <p className="disclaimer">Prototyp: Die Bewertung beruht auf offenen Daten und kann Lücken haben. Im Notfall: 133 (Polizei) oder 112.</p>
        </section>
      )}
    </div>
  );
}
