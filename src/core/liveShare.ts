// Live-Standort-Link: Regeln und Datenformat (ohne Browser-Funktionen, für die native App wiederverwendbar).
//
// Ablauf: Während der Begleitung erstellt das Handy einen Link. Der Standort wird im Handy verschlüsselt
// und alle paar Sekunden an den Server geschickt. Der Schlüssel steht nur im Link (nach dem #),
// der Server sieht nur unlesbaren Text. Kontakte öffnen den Link und sehen den aktuellen Standort,
// bis die Begleitung endet. Nie geteilt werden: Ziel, Zuhause, Route, Name.

import type { LngLat } from './types';

export const LIVE_RULES = {
  /** frühestens so oft wird gesendet (Sekunden) */
  minIntervalSec: 15,
  /** spätestens so oft, auch ohne Bewegung (Sekunden), damit Kontakte sehen, dass die App noch läuft */
  maxIntervalSec: 60,
  /** bei so viel Bewegung (Meter) früher senden, sobald minIntervalSec vorbei ist */
  moveMeters: 20,
  /** so lange bleibt ein Eintrag nach der letzten Aktualisierung gültig (Minuten), dann löscht ihn der Server */
  expiryMinutes: 60,
  /** längstens so lange läuft ein Link insgesamt (Stunden) */
  maxHours: 4,
  /** so oft fragt die Ansicht der Kontakte nach (Sekunden) */
  pollSec: 15,
};

/** Inhalt, der verschlüsselt übertragen wird */
export interface LivePayload {
  v: 1;
  /** Längengrad, Breitengrad (auf ca. 1 m gerundet) */
  c: LngLat;
  /** Genauigkeit in Metern */
  a?: number;
  /** Zeitpunkt der Standortmessung (ms) */
  t: number;
}

export function makePayload(coords: LngLat, time: number, accuracy?: number): LivePayload {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return { v: 1, c: [r(coords[0]), r(coords[1])], t: time, ...(accuracy != null ? { a: Math.round(accuracy) } : {}) };
}

/** Prüft entschlüsselte Daten, bevor sie angezeigt werden */
export function parsePayload(text: string): LivePayload | null {
  try {
    const p = JSON.parse(text);
    if (p?.v !== 1 || !Array.isArray(p.c) || p.c.length !== 2) return null;
    const [lon, lat] = p.c.map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    if (!Number.isFinite(p.t)) return null;
    return { v: 1, c: [lon, lat], t: Number(p.t), ...(Number.isFinite(p.a) ? { a: Number(p.a) } : {}) };
  } catch {
    return null;
  }
}

const MX = 111320 * Math.cos((48.2 * Math.PI) / 180);
const MY = 110540;

/** Soll jetzt eine neue Position gesendet werden? */
export function shouldSend(last: { coords: LngLat; sentAt: number } | null, coords: LngLat, now: number): boolean {
  if (!last) return true;
  const sec = (now - last.sentAt) / 1000;
  if (sec < LIVE_RULES.minIntervalSec) return false;
  if (sec >= LIVE_RULES.maxIntervalSec) return true;
  const moved = Math.hypot((coords[0] - last.coords[0]) * MX, (coords[1] - last.coords[1]) * MY);
  return moved >= LIVE_RULES.moveMeters;
}

/** Ist der Link schon zu lange aktiv? */
export function isTooOld(createdAt: number, now: number): boolean {
  return now - createdAt > LIVE_RULES.maxHours * 3600_000;
}

/** „gerade eben“, „vor 3 min“, „vor 1 h 5 min“ */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  return `vor ${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Nachricht an Kontakte mit dem Link (Absenden immer selbst) */
export function liveMessage(link: string): string {
  return `Ich bin auf dem Heimweg und teile meinen Standort live mit dir, bis ich angekommen bin: ${link} (Goodway, der Link funktioniert nur während meiner Begleitung)`;
}
