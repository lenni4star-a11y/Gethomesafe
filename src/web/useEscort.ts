// Steuert den Begleitmodus im Browser: Takt, Standort, Speichern, Signale.
// Datenschutz: Standort nur während der Begleitung, gespeichert wird nur die letzte Position, beim Ende wird alles gelöscht.

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyPin, escortReducer, startEscort, type EscortEvent, type EscortState } from '../core/escort';
import { distance, remainingAlong } from '../core/geo';
import { getStops } from './data';
import type { EscortSettings } from '../core/settings';
import type { LngLat } from '../core/types';
import { alertOnce, hashPin, keepScreenOn } from './signals';
import { load, remove, save } from './storage';

export interface EscortSession {
  state: EscortState;
  pinHash: string;
  destination: string;
  contactIds: string[];
  /** geplante Route (für Restweg und Abweichung), nur lokal */
  route?: LngLat[];
  /** Zielpunkt (für Ankunft und Neuberechnung), nur lokal */
  destCoords?: LngLat;
  /** Prüfwert der Täuschungs-PIN */
  decoyHash?: string | null;
}

export interface LastPosition {
  coords: LngLat;
  time: number;
  accuracy?: number;
}

const SESSION_KEY = 'escort.session';
const POS_KEY = 'escort.lastPos';

export function useEscort() {
  const [session, setSession] = useState<EscortSession | null>(null);
  const [lastPos, setLastPos] = useState<LastPosition | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Nach Neuladen eine laufende Begleitung fortsetzen
  useEffect(() => {
    load<EscortSession | null>(SESSION_KEY, null).then((s) => s && setSession(s));
    load<LastPosition | null>(POS_KEY, null).then((p) => p && setLastPos(p));
  }, []);

  const dispatch = useCallback((e: EscortEvent) => {
    const s = sessionRef.current;
    if (!s) return;
    const next = escortReducer(s.state, e);
    if (next === s.state) return;
    const ns = { ...s, state: next };
    sessionRef.current = ns;
    setSession(ns);
    save(SESSION_KEY, ns);
  }, []);

  const active = session !== null;

  // Haltestellen (um Warten an der Haltestelle nicht als „stehen geblieben“ zu werten)
  const stops = useRef<LngLat[]>([]);
  useEffect(() => {
    if (active) getStops().then((list) => (stops.current = list.map((st) => [st.lon, st.lat] as LngLat)));
  }, [active]);

  /** Position an die Logik melden: Abstand zur Route, Restweg, Haltestelle in der Nähe */
  const reportPosition = useCallback(
    (coords: LngLat) => {
      const s = sessionRef.current;
      if (!s) return;
      let offRoute: number | null = null;
      let remaining: number | null = null;
      if (s.route && s.route.length > 1) {
        const r = remainingAlong(s.route, coords);
        offRoute = r.offRoute;
        remaining = r.remaining + r.offRoute;
      } else if (s.destCoords) remaining = distance(coords, s.destCoords);
      if (s.destCoords) remaining = Math.min(remaining ?? Infinity, distance(coords, s.destCoords));
      const atStop = stops.current.some((st) => distance(st, coords) < 40);
      dispatch({ type: 'position', now: Date.now(), coords, offRoute, remaining, atStop });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Takt: jede Sekunde prüfen
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, 1000);
    return () => clearInterval(id);
  }, [active, dispatch]);

  // Standort nur während der Begleitung
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation || !window.isSecureContext) {
      setGeoError('Standort nicht verfügbar (nur über https).');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { coords: [p.coords.longitude, p.coords.latitude] as LngLat, time: Date.now(), accuracy: p.coords.accuracy };
        setLastPos(pos);
        setGeoError(null);
        save(POS_KEY, pos); // nur die letzte Position, wird überschrieben
        reportPosition(pos.coords);
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? 'Standortzugriff nicht erlaubt.' : 'Standort gerade nicht verfügbar.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  // Bildschirm anlassen
  useEffect(() => {
    if (!active) return;
    let release: (() => void) | undefined;
    keepScreenOn().then((r) => (release = r));
    const onVisible = () => document.visibilityState === 'visible' && keepScreenOn().then((r) => (release = r));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      release?.();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);

  // Rückfrage: Ton und Vibration, alle paar Sekunden wiederholt (dazu blinkt der Bildschirm, siehe CSS)
  const phase = session?.state.phase;
  useEffect(() => {
    if (phase !== 'prompt') return;
    alertOnce();
    const id = setInterval(alertOnce, 4000);
    return () => clearInterval(id);
  }, [phase]);

  // Wie lange war die App im Hintergrund / der Bildschirm gesperrt?
  const [awayFor, setAwayFor] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt) {
        const s = Math.round((Date.now() - hiddenAt) / 1000);
        if (s >= 15) setAwayFor(s);
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [active]);

  const start = useCallback(
    async (settings: EscortSettings, pin: string, destination: string, contactIds: string[], route?: LngLat[], destCoords?: LngLat, decoyHash?: string | null) => {
    const s: EscortSession = { state: startEscort(settings, Date.now()), pinHash: await hashPin(pin), destination, contactIds, route, destCoords, decoyHash };
    sessionRef.current = s;
    setSession(s);
    save(SESSION_KEY, s);
  },
    [],
  );

  /** 'real' = echte PIN, 'decoy' = Täuschungs-PIN, null = falsch */
  const checkPin = useCallback(async (pin: string) => {
    const s = sessionRef.current;
    return s ? classifyPin(await hashPin(pin), s.pinHash, s.decoyHash) : null;
  }, []);

  /** Neue Route (bewusst anderer Weg) */
  const setRoute = useCallback(
    (route: LngLat[]) => {
      const s = sessionRef.current;
      if (!s) return;
      const ns = { ...s, route };
      sessionRef.current = ns;
      setSession(ns);
      save(SESSION_KEY, ns);
      dispatch({ type: 'rerouted', now: Date.now() });
    },
    [dispatch],
  );

  /** Begleitung beenden und alle Standortdaten löschen */
  const end = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    setLastPos(null);
    await Promise.all([remove(SESSION_KEY), remove(POS_KEY)]);
  }, []);

  return { session, lastPos, geoError, now, dispatch, start, checkPin, setRoute, end, awayFor, clearAway: () => setAwayFor(null) };
}
