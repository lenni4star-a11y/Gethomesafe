// Bewertungen: Wie sicher hat sich ein Ort / Wegstück angefühlt?
// Im Prototyp lokal gespeichert. Die Struktur ist so gewählt, dass sie später an einen Server
// mit gemeinsamen Bewertungen geschickt werden kann (stabile IDs, Version, keine Personendaten).

import { distance } from './geo';
import type { Graph } from './graph';
import type { EdgeRating } from './safety';
import type { Edge, LngLat } from './types';

/** Gründe beschreiben nur Ort und Situation, nie Personen oder Personengruppen */
export const REASONS = {
  dark: 'dunkel',
  empty: 'menschenleer',
  lively: 'belebt',
  visible: 'gut einsehbar',
  uneasy: 'unangenehme Situation / bedrängt',
  harassed: 'Belästigung erlebt',
} as const;
export type Reason = keyof typeof REASONS;

export type RatingTarget =
  /** Wegstück, identifiziert über die OSM-Knoten an beiden Enden (bleibt bei neuen Daten gleich) */
  | { type: 'edge'; key: string; name: string }
  /** Haltestelle / Station */
  | { type: 'stop'; key: string; name: string }
  /** freier Ort auf der Karte */
  | { type: 'place'; name: string };

export interface Rating {
  /** zufällige ID, später auch auf dem Server eindeutig */
  id: string;
  version: 1;
  target: RatingTarget;
  coords: LngLat;
  /** Sicherheitsgefühl 1 (sehr unsicher) bis 5 (sehr sicher) */
  score: 1 | 2 | 3 | 4 | 5;
  /** 0 = Sonntag … 6 = Samstag */
  weekday: number;
  /** Stunde 0–23 */
  hour: number;
  reasons: Reason[];
  note: string;
  /** optional: Mapillary-Foto, auf dem bewertet wurde (keine Personendaten) */
  photoId?: string;
  createdAt: string;
}

export const SCORE_LABELS = ['', 'sehr unsicher', 'eher unsicher', 'neutral', 'eher sicher', 'sehr sicher'] as const;

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Zeitfenster für Filter und Routing */
export interface TimeFilter {
  weekday: number;
  hour: number;
  /** ± Stunden um die gewählte Uhrzeit */
  hourWindow: number;
  /** nur gleicher Wochentag (sonst: ähnliche Tage, also Werktag bzw. Wochenende) */
  sameDayOnly: boolean;
}

/** Nächte zählen zum Vortag: Samstag 2 Uhr gehört zur Nacht von Freitag auf Samstag */
function nightDay(weekday: number, hour: number): number {
  return hour < 6 ? (weekday + 6) % 7 : weekday;
}

const isWeekendNight = (d: number) => d === 5 || d === 6; // Fr-, Sa-Abend/Nacht

export function matchesTime(r: Pick<Rating, 'weekday' | 'hour'>, f: TimeFilter): boolean {
  const diff = Math.abs(r.hour - f.hour);
  if (Math.min(diff, 24 - diff) > f.hourWindow) return false;
  const a = nightDay(r.weekday, r.hour);
  const b = nightDay(f.weekday, f.hour);
  return f.sameDayOnly ? a === b : isWeekendNight(a) === isWeekendNight(b);
}

export function timeFilterFor(date: Date, hourWindow = 2, sameDayOnly = false): TimeFilter {
  return { weekday: date.getDay(), hour: date.getHours(), hourWindow, sameDayOnly };
}

export function edgeKey(graph: Graph, e: Edge): string {
  const a = graph.osmIdOf(e.a);
  const b = graph.osmIdOf(e.b);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Wirkungsradius einer Orts- oder Stationsbewertung auf umliegende Wegstücke */
const PLACE_RADIUS = 40;

/**
 * Bewertungen für die gewählte Zeit auf Wegstücke verteilen.
 * Wegstück-Bewertungen zählen voll, Orts-/Stationsbewertungen für Wegstücke im Umkreis von 40 m.
 */
export function ratingLookup(graph: Graph, ratings: Rating[], filter: TimeFilter): (e: Edge) => EdgeRating | null {
  const relevant = ratings.filter((r) => matchesTime(r, filter));
  if (!relevant.length) return () => null;

  const byKey = new Map<string, { sum: number; count: number }>();
  const add = (key: string, score: number, weight: number) => {
    const v = byKey.get(key) ?? { sum: 0, count: 0 };
    v.sum += score * weight;
    v.count += weight;
    byKey.set(key, v);
  };

  for (const r of relevant) {
    if (r.target.type === 'edge') add(r.target.key, r.score, 1);
    else
      for (const e of graph.edgesNear(r.coords, PLACE_RADIUS)) {
        const mid = e.coords[Math.floor(e.coords.length / 2)];
        if (distance(mid, r.coords) <= PLACE_RADIUS) add(edgeKey(graph, e), r.score, 0.7);
      }
  }

  return (e) => {
    const v = byKey.get(edgeKey(graph, e));
    return v ? { average: v.sum / v.count, count: v.count } : null;
  };
}

export function newRating(input: Omit<Rating, 'id' | 'version' | 'createdAt'>): Rating {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { ...input, id, version: 1, createdAt: new Date().toISOString() };
}

/**
 * Hinweis, wenn eine Notiz Personen statt Ort/Situation beschreibt.
 * Sehr einfache Prüfung; ersetzt keine Moderation (die braucht es bei gemeinsamen Bewertungen auf einem Server).
 */
export function noteWarning(note: string): string | null {
  const n = note.toLowerCase();
  // Begriffe für Personengruppen (Herkunft, Religion, Lebenslage …): nur ein sanfter Hinweis, kein Verbot
  const personWords =
    /\b(ausländer\w*|migrant\w*|flüchtling\w*|asylant\w*|türke\w*|araber\w*|afghan\w*|syrer\w*|tschetschen\w*|afrikaner\w*|roma|zigeuner\w*|obdachlose\w*|bettler\w*|junkie\w*|drogensüchtig\w*|drogenabhängig\w*|muslim\w*|juden?|jüdisch\w*)\b/;
  if (personWords.test(n))
    return 'Bitte beschreibe den Ort und die Situation (z. B. „dunkle Unterführung, niemand unterwegs“), nicht Menschen oder Gruppen. So bleibt die Karte fair für alle.';
  return null;
}
