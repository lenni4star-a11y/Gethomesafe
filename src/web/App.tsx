import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlanResult, Planner } from '../core/planner';
import type { RouteMode } from '../core/routing';
import { DEFAULT_SETTINGS, withDefaults, type Settings } from '../core/settings';
import { isDark } from '../core/sun';
import type { LngLat } from '../core/types';
import type { Contact } from '../core/contacts';
import { distance, remainingAlong } from '../core/geo';
import { WALK_SPEED } from '../core/routing';
import { edgeKey, matchesTime, newRating, SCORE_LABELS, timeFilterFor, WEEKDAY_SHORT, type Rating, type RatingTarget } from '../core/ratings';
import { RatingForm } from './components/RatingForm';
import { RatingsPanel, type RatingsView } from './components/RatingsPanel';
import { AlarmScreen } from './components/AlarmScreen';
import { CallScreen } from './components/CallScreen';
import { ContactActions, EmergencyMenu } from './components/EmergencyMenu';
import { EscortSettingsFields, EscortSetup } from './components/EscortSetup';
import { EscortView } from './components/EscortView';
import { HomeSettings } from './components/HomeSettings';
import { Legend } from './components/Legend';
import { Modal } from './components/Modal';
import { MapView, type MapHandle } from './components/MapView';
import { PlaceInput } from './components/PlaceInput';
import { RouteDetails } from './components/RouteDetails';
import { SettingsPanel } from './components/SettingsPanel';
import { StreetPreview } from './components/StreetPreview';
import { TimePicker } from './components/TimePicker';
import { getPlanner, getStops } from './data';
import { formatDistance, formatDuration, formatTime } from './format';
import type { Place } from './geocode';
import { useStored } from './storage';
import { useEscort } from './useEscort';
import { unlockAudio } from './signals';

type Pick = 'start' | 'end' | 'rate' | 'home' | null;
type SheetState = 'collapsed' | 'half' | 'full';

export function App() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [settings, setSettings] = useStored<Settings>('settings', DEFAULT_SETTINGS, withDefaults);
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [customTime, setCustomTime] = useState<Date | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planTime, setPlanTime] = useState<Date>(new Date());
  const [selected, setSelected] = useState<RouteMode>('safest');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Pick>(null);
  const [flying, setFlying] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /** Routen-Menü: eingeklappt, halb oder ganz offen */
  const [sheet, setSheet] = useState<SheetState>('collapsed');
  const [escortCompact, setEscortCompact] = useState(true);
  const [showTime, setShowTime] = useState(false);
  const [contacts, setContacts] = useStored<Contact[]>('contacts', []);
  const [showSos, setShowSos] = useState(false);
  const [fakeCall, setFakeCall] = useState(false);
  const [fakeAt, setFakeAt] = useState<number | null>(null);
  const [alarm, setAlarm] = useState(false);
  const [showEscortSetup, setShowEscortSetup] = useState(false);
  const [arrived, setArrived] = useState<string[] | null>(null);
  const escort = useEscort();
  const [ratings, setRatings] = useStored<Rating[]>('ratings', []);
  const [ratingsView, setRatingsView] = useStored<RatingsView>('ratingsView', 'time');
  const [showRatings, setShowRatings] = useState(false);
  const [draft, setDraft] = useState<{ target: RatingTarget; coords: LngLat } | null>(null);
  const [home, setHome] = useStored<Place | null>('home', null);
  const [favorites, setFavorites] = useStored<Place[]>('favorites', []);
  const [homePromptDone, setHomePromptDone] = useStored<boolean>('homePromptDone', false);
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

  useEffect(() => {
    map.current?.setHome(settings.showHomeOnMap && home ? home.coords : null);
  }, [home, settings.showHomeOnMap]);

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
    const when = customTime ?? new Date();
    setBusy(true);
    setMessage(null);
    planner
      .plan(start.coords, end.coords, when, { parkAvoidance: settings.parkAvoidance, ratings })
      .then((res) => {
        if (cancelled) return;
        if (!res) setMessage('Für diese Strecke haben wir leider keinen Fußweg gefunden.');
        else setSheet('collapsed');
        setPlan(res);
        setPlanTime(when);
      })
      .catch(() => !cancelled && setMessage('Beim Berechnen ist etwas schiefgegangen. Bitte versuch es noch einmal.'))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [planner, start, end, customTime, settings.parkAvoidance, ratings]);

  // Bewertungen auf der Karte, gefiltert nach Wochentag und Uhrzeit
  const ratingTime = customTime ?? new Date();
  const visibleRatings = useMemo(() => {
    if (ratingsView === 'off') return [];
    if (ratingsView === 'all') return ratings;
    const f = timeFilterFor(ratingTime);
    return ratings.filter((r) => matchesTime(r, f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratings, ratingsView, customTime, Math.floor(Date.now() / 600000)]);
  useEffect(() => {
    map.current?.setRatings(
      visibleRatings.map((r) => ({
        id: r.id,
        coords: r.coords,
        score: r.score,
        label: `${r.target.name || 'Ort'}: ${r.score} – ${SCORE_LABELS[r.score]} (${WEEKDAY_SHORT[r.weekday]} ${r.hour}:00)`,
      })),
    );
  }, [visibleRatings]);

  /** Was wurde angetippt? Haltestelle (bis 40 m), sonst Wegstück (bis 25 m), sonst freier Ort */
  const resolveTarget = useCallback(
    async (p: LngLat): Promise<RatingTarget> => {
      const stops = await getStops();
      let best: { name: string; id: string; d: number } | null = null;
      for (const s of stops) {
        const d = distance(p, [s.lon, s.lat]);
        if (d < 40 && (!best || d < best.d)) best = { name: s.name, id: s.id, d };
      }
      if (best) return { type: 'stop', key: `${best.name}`, name: best.name };
      if (planner) {
        await planner.ensureDistricts([p], 100);
        const hit = planner.graph.nearestEdge(p, 25);
        if (hit) return { type: 'edge', key: edgeKey(planner.graph, hit.edge), name: hit.edge.name || 'Fußweg' };
      }
      return { type: 'place', name: 'Ort auf der Karte' };
    },
    [planner],
  );

  useEffect(() => {
    map.current?.showPlan(plan, selected, planTime);
  }, [plan, selected, planTime]);

  const locate = useCallback((use: (p: Place) => void = setStart) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage('Der Standort ist nur über eine sichere Verbindung (https) verfügbar. Wähle den Start bitte über die Suche oder die Karte.');
      return;
    }
    setMessage('Standort wird gesucht …');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMessage(null);
        use({ label: 'Mein Standort', coords: [pos.coords.longitude, pos.coords.latitude], kind: 'location' });
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
      if (!pick) {
        setSheet('collapsed');
        setEscortCompact(true);
        return;
      }
      setSheet('collapsed');
      if (pick === 'home') {
        setPick(null);
        setHome({ label: 'Punkt auf der Karte', coords: p, kind: 'home' });
        setShowSettings(true);
        return;
      }
      if (pick === 'rate') {
        setPick(null);
        resolveTarget(p).then((target) => setDraft({ target, coords: p }));
        return;
      }
      const place: Place = { label: pick === 'start' ? 'Punkt auf der Karte (Start)' : 'Punkt auf der Karte (Ziel)', coords: p, kind: 'map' };
      if (pick === 'start') setStart(place);
      else setEnd(place);
      setPick(null);
    },
    [pick, resolveTarget],
  );

  /** Sofort die sicherste Route nach Hause planen */
  const goHome = useCallback(() => {
    if (!home) {
      setShowSettings(true);
      return;
    }
    setSelected('safest');
    setEnd({ ...home, label: 'Zuhause', kind: 'home' });
    if (!start) locate();
  }, [home, start, locate]);

  const isFavorite = !!end && favorites.some((f) => f.coords[0] === end.coords[0] && f.coords[1] === end.coords[1]);

  const chosen = plan?.[selected];

  // Restweg während der Begleitung (aus geplanter Route und letzter Position)
  const escortRemaining = useMemo(() => {
    const route = escort.session?.route;
    if (!route || !escort.lastPos) return null;
    const r = remainingAlong(route, escort.lastPos.coords);
    return { meters: r.remaining, seconds: r.remaining / WALK_SPEED, offRoute: r.offRoute > 60 };
  }, [escort.session?.route, escort.lastPos]);
  const extra = plan && !plan.same ? plan.safest.seconds - plan.fastest.seconds : 0;

  const fly = () => {
    if (!chosen) return;
    setPhotos(false);
    setFlying(true);
    setSheet('collapsed');
    map.current?.flyAlong(chosen, () => setFlying(false));
  };

  return (
    <div className="app">
      <MapView ref={map} index={planner?.index ?? null} onMapClick={onMapClick} />

      <header className="topbar">
        <span className="brand">Gethomesafe</span>
        <span className="badge">Prototyp</span>
      </header>
      <button type="button" className="settings-btn" onClick={() => setShowSettings(true)} aria-label="Einstellungen">
        ⚙
      </button>
      <button type="button" className="ratings-btn" onClick={() => setShowRatings(true)} aria-label="Bewertungen">
        ⭐
      </button>

      {chosen && !flying && <Legend dark={plan?.safest.dark ?? dark} />}

      {pick && (
        <div className="pick-banner" role="status">
          {pick === 'rate'
            ? 'Tippe auf den Weg, den Ort oder die Haltestelle, die du bewerten möchtest.'
            : pick === 'home'
              ? 'Tippe auf die Karte, um dein Zuhause festzulegen.'
              : `Tippe auf die Karte, um ${pick === 'start' ? 'den Start' : 'das Ziel'} festzulegen.`}
          <button type="button" className="link-btn" onClick={() => setPick(null)}>
            Abbrechen
          </button>
        </div>
      )}

      {flying && (
        <>
          <div className="fly-label" role="status">
            Kartenfahrt (keine Fotos)
          </div>
          <button type="button" className="stop-fly" onClick={() => (map.current?.stopFly(), setFlying(false))}>
            Vorschau beenden
          </button>
        </>
      )}

      {escort.session && !flying && (
        <EscortView
          session={escort.session}
          now={escort.now}
          lastPos={escort.lastPos}
          geoError={escort.geoError}
          contacts={contacts}
          dispatch={escort.dispatch}
          checkPin={escort.checkPin}
          onTalkCall={() => (unlockAudio(), setFakeCall(true))}
          voiceMode={settings.voice}
          awayFor={escort.awayFor}
          onClearAway={escort.clearAway}
          compact={escortCompact}
          onToggleCompact={() => setEscortCompact((c) => !c)}
          remaining={escortRemaining}
          onEnd={async (didArrive) => {
            const ids = escort.session?.contactIds ?? [];
            await escort.end();
            if (didArrive) setArrived(ids);
          }}
        />
      )}

      {!flying && !escort.session && (
        <section className={`sheet sheet-${sheet}`} aria-label="Heimweg planen">
          <SheetGrabber state={sheet} onChange={setSheet} />
          {sheet === 'collapsed' ? (
            <div className="collapsed-row">
              {chosen ? (
                <button type="button" className="collapsed-main" onClick={() => setSheet('half')} aria-label="Routen-Menü öffnen">
                  <small>{selected === 'safest' ? 'Sicherste Route' : 'Schnellste Route'} · Wert {chosen.score}/10</small>
                  <b>
                    {formatDuration(chosen.seconds)} · {formatDistance(chosen.length)}
                  </b>
                </button>
              ) : (
                <button type="button" className="collapsed-main where" onClick={() => setSheet('half')}>
                  🔍 Wohin?
                </button>
              )}
              <button type="button" className="icon-btn home-btn" onClick={goHome} aria-label="Nach Hause: sicherste Route planen" title="Nach Hause">
                🏠
              </button>
            </div>
          ) : (
            <>
          <div className="inputs">
            <PlaceInput label="Von" value={start} onChange={setStart} bbox={bbox} onLocate={() => locate()} onPickOnMap={() => (setPick(pick === 'start' ? null : 'start'), setSheet('collapsed'))} picking={pick === 'start'} />
            <PlaceInput label="Nach" value={end} onChange={setEnd} bbox={bbox} onPickOnMap={() => (setPick(pick === 'end' ? null : 'end'), setSheet('collapsed'))} picking={pick === 'end'} />
          </div>

          <div className="quick-row" aria-label="Schnellwahl">
            <button type="button" className="chip home-chip" onClick={goHome}>
              🏠 Nach Hause
            </button>
            {favorites.map((f, i) => (
              <button key={i} type="button" className="chip" onClick={() => setEnd({ ...f, kind: 'favorite' })}>
                ★ {f.label}
              </button>
            ))}
            {end && end.kind !== 'home' && !isFavorite && favorites.length < 6 && (
              <button type="button" className="chip" onClick={() => setFavorites([...favorites, { label: end.label, coords: end.coords, kind: 'favorite' }])}>
                ☆ Merken
              </button>
            )}
          </div>
          {!home && !homePromptDone && (
            <div className="notice home-prompt">
              <b>Zuhause festlegen?</b> Dann planst du mit einem Tipp den sichersten Heimweg. Bleibt nur auf deinem Gerät.
              <div className="tp-row">
                <button type="button" className="chip active" onClick={() => (setHomePromptDone(true), setShowSettings(true))}>
                  Festlegen
                </button>
                <button type="button" className="chip" onClick={() => setHomePromptDone(true)}>
                  Später
                </button>
              </div>
            </div>
          )}

          <div className="time-row">
            <span className={`daynight ${dark ? 'night' : 'day'}`}>{dark ? '☾ dunkel' : '☀ hell'}</span>
            <button type="button" className="link-btn time-toggle" onClick={() => setShowTime((v) => !v)} aria-expanded={showTime}>
              {customTime ? `Losgehen: ${formatTime(customTime)}` : 'Losgehen: jetzt'} ▾
            </button>
          </div>
          {showTime && <TimePicker value={customTime} onChange={setCustomTime} />}

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
                    <button type="button" className="btn primary" onClick={() => (setPhotos(true), setSheet('collapsed'))}>
                      Weg ansehen
                    </button>
                    <button type="button" className="btn" onClick={() => setSheet(sheet === 'full' ? 'half' : 'full')} aria-expanded={sheet === 'full'}>
                      {sheet === 'full' ? 'Weniger' : 'Details'}
                    </button>
                  </div>
                  {sheet === 'full' && (
                    <RouteDetails
                      route={chosen}
                      date={planTime}
                      onFocus={(p) => {
                        setSheet('collapsed');
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

          <button type="button" className="btn escort-start" onClick={() => setShowEscortSetup(true)}>
            🫂 Begleitung starten
          </button>


              <p className="disclaimer">Prototyp: Die Bewertung beruht auf offenen Daten und kann Lücken haben. Im Notfall: 133 (Polizei), 144 (Rettung) oder 112.</p>
            </>
          )}
        </section>
      )}

      {photos && chosen && (
        <StreetPreview
          route={chosen}
          token={settings.mapillaryToken}
          onClose={() => setPhotos(false)}
          onMapFlight={fly}
          onOpenSettings={() => (setPhotos(false), setShowSettings(true))}
        />
      )}

      {showSettings && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)}>
          <HomeSettings
            home={home}
            onHomeChange={setHome}
            favorites={favorites}
            onFavoritesChange={setFavorites}
            showOnMap={settings.showHomeOnMap}
            onShowOnMapChange={(v) => setSettings({ ...settings, showHomeOnMap: v })}
            bbox={bbox}
            onPickOnMap={() => (setShowSettings(false), setPick('home'))}
            onLocate={() => locate((p) => setHome({ ...p, label: 'Mein Standort (beim Speichern)', kind: 'home' }))}
          />
          <section className="settings-section">
            <h3>Begleitmodus</h3>
            <EscortSettingsFields settings={settings.escort} onChange={(e) => setSettings({ ...settings, escort: e })} />
          </section>
        </SettingsPanel>
      )}

      {!fakeCall && (
        <button type="button" className="sos-btn" onClick={() => setShowSos(true)} aria-label="Hilfe und Notruf">
          SOS
        </button>
      )}

      {showSos && (
        <EmergencyMenu
          contacts={contacts}
          onContactsChange={setContacts}
          onClose={() => setShowSos(false)}
          onFakeCall={(delay) => {
            unlockAudio();
            setShowSos(false);
            if (delay === 0) setFakeCall(true);
            else setFakeAt(Date.now() + delay * 1000);
          }}
          lastPosition={escort.lastPos}
          onAlarm={() => {
            unlockAudio();
            setShowSos(false);
            setAlarm(true);
          }}
        />
      )}

      {alarm && <AlarmScreen onStop={() => setAlarm(false)} />}

      {showEscortSetup && (
        <EscortSetup
          destination={end?.kind === 'home' || (!end && home) ? 'Zuhause' : (end?.label ?? '')}
          contacts={contacts}
          onContactsChange={setContacts}
          settings={settings.escort}
          onSettingsChange={(e) => setSettings({ ...settings, escort: e })}
          onClose={() => setShowEscortSetup(false)}
          onStart={(pin, dest, ids) => {
            setShowEscortSetup(false);
            escort.start(settings.escort, pin, dest, ids, chosen?.coords);
            setEscortCompact(true);
          }}
        />
      )}

      {arrived && (
        <Modal title="Schön, dass du da bist" onClose={() => setArrived(null)}>
          <p>Die Begleitung ist beendet, dein Standort wurde gelöscht.</p>
          {contacts.filter((c) => arrived.includes(c.id)).length > 0 && (
            <>
              <p>Möchtest du Bescheid geben, dass du angekommen bist?</p>
              {contacts
                .filter((c) => arrived.includes(c.id))
                .map((c) => (
                  <ContactActions key={c.id} contact={c} kind="arrived" />
                ))}
            </>
          )}
          <button type="button" className="btn primary" onClick={() => (setArrived(null), setPick('rate'))}>
            ⭐ Eine Stelle deines Wegs bewerten
          </button>
          <button type="button" className="btn" onClick={() => setArrived(null)}>
            Schließen
          </button>
        </Modal>
      )}

      {showRatings && (
        <RatingsPanel
          ratings={ratings}
          view={ratingsView}
          onViewChange={setRatingsView}
          timeLabel={formatTime(ratingTime)}
          visibleCount={visibleRatings.length}
          onStartRating={() => (setShowRatings(false), setSheet('collapsed'), setPick('rate'))}
          onDelete={(id) => setRatings((rs) => rs.filter((r) => r.id !== id))}
          onFocus={(p) => (setShowRatings(false), map.current?.focus(p))}
          onClose={() => setShowRatings(false)}
        />
      )}

      {draft && (
        <RatingForm
          target={draft.target}
          coords={draft.coords}
          when={customTime ?? undefined}
          onClose={() => setDraft(null)}
          onSave={(r) => {
            setRatings((rs) => [...rs, newRating(r)]);
            setDraft(null);
          }}
        />
      )}

      {fakeAt && <FakeCallCountdown at={fakeAt} onFire={() => (setFakeAt(null), setFakeCall(true))} onCancel={() => setFakeAt(null)} />}

      {fakeCall && <CallScreen kind="fake" caller="Sam" voiceMode={settings.voice} onHangup={() => setFakeCall(false)} />}
    </div>
  );
}

/** Fake-Anruf zeitversetzt: kleiner Hinweis mit Abbrechen */
function FakeCallCountdown({ at, onFire, onCancel }: { at: number; onFire: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(Math.ceil((at - Date.now()) / 1000));
  useEffect(() => {
    const id = setInterval(() => {
      const l = Math.ceil((at - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) onFire();
    }, 250);
    return () => clearInterval(id);
  }, [at, onFire]);
  return (
    <div className="fake-countdown" role="status">
      Anruf kommt in {Math.max(0, left)} s
      <button type="button" className="link-btn" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

/** Griff des Routen-Menüs: tippen oder nach oben/unten wischen */
function SheetGrabber({ state, onChange }: { state: SheetState; onChange: (s: SheetState) => void }) {
  const order: SheetState[] = ['collapsed', 'half', 'full'];
  const startY = useRef<number | null>(null);
  const step = (dir: 1 | -1) => onChange(order[Math.max(0, Math.min(2, order.indexOf(state) + dir))]);
  return (
    <button
      type="button"
      className="sheet-grabber"
      aria-label={state === 'full' ? 'Routen-Menü verkleinern' : 'Routen-Menü vergrößern'}
      onPointerDown={(e) => (startY.current = e.clientY)}
      onPointerUp={(e) => {
        if (startY.current === null) return;
        const dy = e.clientY - startY.current;
        startY.current = null;
        if (dy < -30) step(1);
        else if (dy > 30) step(-1);
        else onChange(state === 'full' ? 'collapsed' : order[order.indexOf(state) + 1]);
      }}
    >
      <span />
    </button>
  );
}
