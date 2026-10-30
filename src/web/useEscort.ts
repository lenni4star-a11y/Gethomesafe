// Steuert den Begleitmodus im Browser: Takt, Standort, Speichern, Signale.
// Datenschutz: Standort nur während der Begleitung, gespeichert wird nur die letzte Position, beim Ende wird alles gelöscht.

import { useCallback, useEffect, useRef, useState } from 'react';
import { escortReducer, startEscort, type EscortEvent, type EscortState } from '../core/escort';
import type { EscortSettings } from '../core/settings';
import type { LngLat } from '../core/types';
import { beep, hashPin, keepScreenOn, vibrate } from './signals';
import { load, remove, save } from './storage';

export interface EscortSession {
  state: EscortState;
  pinHash: string;
  destination: string;
  contactIds: string[];
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

  // Rückfrage: Vibration und Ton, alle paar Sekunden wiederholt
  const phase = session?.state.phase;
  useEffect(() => {
    if (phase !== 'prompt') return;
    const signal = () => {
      vibrate([500, 200, 500]);
      beep(3);
    };
    signal();
    const id = setInterval(signal, 5000);
    return () => clearInterval(id);
  }, [phase]);

  const start = useCallback(async (settings: EscortSettings, pin: string, destination: string, contactIds: string[]) => {
    const s: EscortSession = { state: startEscort(settings, Date.now()), pinHash: await hashPin(pin), destination, contactIds };
    sessionRef.current = s;
    setSession(s);
    save(SESSION_KEY, s);
  }, []);

  const checkPin = useCallback(async (pin: string) => {
    const s = sessionRef.current;
    return !!s && (await hashPin(pin)) === s.pinHash;
  }, []);

  /** Begleitung beenden und alle Standortdaten löschen */
  const end = useCallback(async () => {
    sessionRef.current = null;
    setSession(null);
    setLastPos(null);
    await Promise.all([remove(SESSION_KEY), remove(POS_KEY)]);
  }, []);

  return { session, lastPos, geoError, now, dispatch, start, checkPin, end };
}
