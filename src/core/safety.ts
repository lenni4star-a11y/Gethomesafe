// Wie „sicher“ fühlt sich ein Wegstück an? Ergebnis ist ein Risiko-Wert von 0 (gut) bis 1 (schlecht).
// Alle Gewichte stehen hier gesammelt, damit sie leicht angepasst werden können.

import { openState, type OpenState } from './openingHours';
import { Flag, WayKind, type Edge, type Poi } from './types';

export const WEIGHTS = {
  /** Nachts: Anteil von Beleuchtung, Art des Weges und „Belebtheit“ am Risiko */
  night: { light: 0.45, way: 0.35, life: 0.2 },
  /** Tagsüber spielt Beleuchtung keine Rolle */
  day: { light: 0, way: 0.75, life: 0.25 },
  /** Wie stark die sicherste Route Umwege in Kauf nimmt (Kosten = Länge × (1 + avoid × Risiko)) */
  avoid: 3,
  /** Aufschlag für Wege durch Parks / direkt neben Parks (nachts, tagsüber), wird mit der Einstellung multipliziert */
  park: { inside: { night: 0.45, day: 0.15 }, near: { night: 0.2, day: 0 } },
};

/** Einstellung „Parks meiden“ → Faktor */
export const PARK_FACTORS = { 0: 0, 1: 0.5, 2: 1, 3: 1.7 } as const;
export type ParkAvoidance = keyof typeof PARK_FACTORS;

/** Beleuchtung → Risiko */
export function lightRisk(e: Edge): number {
  if (e.lit === 'yes') return 0;
  if (e.lit === 'no') return 1;
  // unbekannt: Stadt-Wien-Daten geben einen Hinweis
  if (e.lampCoverage >= 0.3) return 0.35;
  return 0.65;
}

/** Art des Weges → Risiko */
export function wayRisk(e: Edge, dark: boolean, parkFactor = 1): number {
  let r: number;
  switch (e.kind) {
    case WayKind.Main:
      r = 0;
      break;
    case WayKind.Residential:
      r = 0.1;
      break;
    case WayKind.Pedestrian:
      r = 0.1;
      break;
    case WayKind.Service:
      r = 0.35;
      break;
    case WayKind.Footway:
      r = (e.flags & Flag.Crossing) !== 0 ? 0.05 : 0.3;
      break;
    case WayKind.Steps:
      r = 0.45;
      break;
    case WayKind.Track:
      r = 0.7;
      break;
  }
  const time = dark ? 'night' : 'day';
  if (e.flags & Flag.Park) r += WEIGHTS.park.inside[time] * parkFactor;
  else if (e.flags & Flag.ParkNear) r += WEIGHTS.park.near[time] * parkFactor;
  if ((e.flags & Flag.Tunnel) !== 0) r += 0.6;
  if ((e.flags & Flag.Passage) !== 0) r += 0.15;
  if ((e.flags & Flag.NoSidewalk) !== 0) r += 0.1;
  return Math.min(1, r);
}

export interface EdgeRating {
  average: number;
  count: number;
}

export interface SafetyContext {
  date: Date;
  dark: boolean;
  /** 0 = Parks egal … 1,7 = Parks stark meiden */
  parkFactor: number;
  open: (poi: Poi) => OpenState;
  /** Eigene Bewertungen (1–5) für ein Wegstück zur gewählten Zeit, oder null */
  rating?: (e: Edge) => EdgeRating | null;
}

export interface ContextOptions {
  parkAvoidance?: ParkAvoidance;
  rating?: (e: Edge) => EdgeRating | null;
}

export function createContext(date: Date, dark: boolean, opts: ContextOptions = {}): SafetyContext {
  const memo = new Map<string, OpenState>();
  return {
    date,
    dark,
    parkFactor: PARK_FACTORS[opts.parkAvoidance ?? 2],
    rating: opts.rating,
    open: (poi) => {
      let s = memo.get(poi.id);
      if (!s) memo.set(poi.id, (s = openState(poi, date)));
      return s;
    },
  };
}

export function openPoisNear(e: Edge, pois: Map<string, Poi>, ctx: SafetyContext): Poi[] {
  const out: Poi[] = [];
  for (const id of e.pois) {
    const p = pois.get(id);
    if (p && ctx.open(p) === 'open') out.push(p);
  }
  return out;
}

/** „Belebtheit“ → Risiko (geöffnete Orte am Weg senken es) */
export function lifeRisk(e: Edge, pois: Map<string, Poi>, ctx: SafetyContext): number {
  const open = openPoisNear(e, pois, ctx);
  if (open.some((p) => p.cat === 'police' || p.cat === 'hospital')) return 0;
  if (open.length >= 2) return 0.2;
  if (open.length === 1) return 0.5;
  return 1;
}

export interface EdgeRisk {
  risk: number;
  light: number;
  way: number;
  life: number;
}

export function edgeRisk(e: Edge, pois: Map<string, Poi>, ctx: SafetyContext): EdgeRisk {
  const w = ctx.dark ? WEIGHTS.night : WEIGHTS.day;
  const light = lightRisk(e);
  const way = wayRisk(e, ctx.dark, ctx.parkFactor);
  const life = lifeRisk(e, pois, ctx);
  let risk = w.light * light + w.way * way + w.life * life;

  // Bewertungen verschieben das Ergebnis, je mehr es gibt, desto stärker
  const rating = ctx.rating?.(e);
  if (rating && rating.count > 0) {
    const ratingRisk = (5 - rating.average) / 4;
    const trust = Math.min(0.7, 0.3 + rating.count * 0.1);
    risk = risk * (1 - trust) + ratingRisk * trust;
  }
  return { risk: Math.max(0, Math.min(1, risk)), light, way, life };
}

/** Farbstufe eines Wegstücks: grün, gelb oder rot */
export type SafetyClass = 'good' | 'medium' | 'bad';

export function edgeClass(e: Edge, ctx: SafetyContext): SafetyClass {
  const rating = ctx.rating?.(e);
  if (rating && rating.count > 0 && rating.average < 2.5) return 'bad';
  if (ctx.dark && e.lit === 'no') return 'bad';
  if (rating && rating.count > 0 && rating.average < 3.5) return 'medium';
  if (!ctx.dark || e.lit === 'yes') return 'good';
  // nachts: teilweise beleuchtet oder keine Daten
  return 'medium';
}

/** Sicherheitswert 1–10 aus mittlerem Risiko */
export function scoreFromRisk(meanRisk: number): number {
  return Math.max(1, Math.min(10, Math.round(10 - 9 * meanRisk)));
}
