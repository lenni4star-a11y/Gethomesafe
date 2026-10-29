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
};

/** Beleuchtung → Risiko */
export function lightRisk(e: Edge): number {
  if (e.lit === 'yes') return 0;
  if (e.lit === 'no') return 1;
  // unbekannt: Stadt-Wien-Daten geben einen Hinweis
  if (e.lampCoverage >= 0.3) return 0.35;
  return 0.65;
}

/** Art des Weges → Risiko */
export function wayRisk(e: Edge, dark: boolean): number {
  const park = (e.flags & Flag.Park) !== 0;
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
  if (park) r += dark ? 0.45 : 0.15;
  if ((e.flags & Flag.Tunnel) !== 0) r += 0.6;
  if ((e.flags & Flag.Passage) !== 0) r += 0.15;
  if ((e.flags & Flag.NoSidewalk) !== 0) r += 0.1;
  return Math.min(1, r);
}

export interface SafetyContext {
  date: Date;
  dark: boolean;
  open: (poi: Poi) => OpenState;
  /** Ab Phase 3: eigene Bewertungen (1–5) für ein Wegstück, oder null */
  rating?: (e: Edge) => { average: number; count: number } | null;
}

export function createContext(date: Date, dark: boolean): SafetyContext {
  const memo = new Map<string, OpenState>();
  return {
    date,
    dark,
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
  const way = wayRisk(e, ctx.dark);
  const life = lifeRisk(e, pois, ctx);
  let risk = w.light * light + w.way * way + w.life * life;

  // Phase 3: Bewertungen verschieben das Ergebnis, je mehr es gibt, desto stärker
  const rating = ctx.rating?.(e);
  if (rating && rating.count > 0) {
    const ratingRisk = (5 - rating.average) / 4;
    const trust = Math.min(0.6, rating.count * 0.15);
    risk = risk * (1 - trust) + ratingRisk * trust;
  }
  return { risk: Math.max(0, Math.min(1, risk)), light, way, life };
}

/** Sicherheitswert 1–10 aus mittlerem Risiko */
export function scoreFromRisk(meanRisk: number): number {
  return Math.max(1, Math.min(10, Math.round(10 - 9 * meanRisk)));
}
