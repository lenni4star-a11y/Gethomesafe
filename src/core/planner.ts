// Lädt die nötigen Bezirke und berechnet schnellste und sicherste Route.
// Das Laden geschieht über eine übergebene Funktion, damit Web und native App
// ihre eigene Art verwenden können (fetch, Datei aus dem App-Paket, …).

import { summarize, type RouteSummary } from './analysis';
import { bboxAround, bboxIntersects, pointInRing } from './geo';
import { Graph } from './graph';
import { findRoute } from './routing';
import { ratingLookup, timeFilterFor, type Rating } from './ratings';
import { createContext, type ContextOptions } from './safety';
import { isDark } from './sun';
import type { DataIndex, DistrictFile, DistrictInfo, Extras, LngLat } from './types';

export type JsonLoader = <T>(path: string) => Promise<T>;

export interface PlanResult {
  fastest: RouteSummary;
  safest: RouteSummary;
  /** beide Routen sind gleich */
  same: boolean;
}

export class Planner {
  readonly graph = new Graph();
  private loading = new Map<number, Promise<void>>();
  private extrasPromise: Promise<Extras | null> | null = null;

  /** Zusatzdaten der Stadt Wien (Taxistände, WCs, Baustellen); fehlt die Datei, geht es ohne */
  extras(): Promise<Extras | null> {
    this.extrasPromise ??= this.load<Extras>('extras.json').catch(() => null);
    return this.extrasPromise;
  }

  constructor(
    readonly index: DataIndex,
    private load: JsonLoader,
  ) {}

  static async create(load: JsonLoader): Promise<Planner> {
    return new Planner(await load<DataIndex>('index.json'), load);
  }

  /** Liegt der Punkt im Pilotgebiet? */
  districtAt(p: LngLat): DistrictInfo | undefined {
    return this.index.bezirke.find((b) => !b.transit && pointInRing(p, b.outline));
  }

  /** Lädt alle Bezirke, die das Rechteck um die Punkte berühren (mit Rand) */
  async ensureDistricts(points: LngLat[], padMeters = 800): Promise<void> {
    const box = bboxAround(points, padMeters);
    const needed = this.index.bezirke.filter((b) => bboxIntersects(b.bbox, box));
    await Promise.all(needed.map((b) => this.loadDistrict(b)));
  }

  private loadDistrict(b: DistrictInfo): Promise<void> {
    let p = this.loading.get(b.nr);
    if (!p) {
      p = this.load<DistrictFile>(b.file).then((f) => this.graph.addDistrict(f));
      p.catch(() => this.loading.delete(b.nr));
      this.loading.set(b.nr, p);
    }
    return p;
  }

  async plan(from: LngLat, to: LngLat, date: Date, opts: ContextOptions & { ratings?: Rating[] } = {}): Promise<PlanResult | null> {
    await this.ensureDistricts([from, to]);
    // Bewertungen passend zu Wochentag und Uhrzeit
    const rating = opts.ratings?.length ? ratingLookup(this.graph, opts.ratings, timeFilterFor(date)) : opts.rating;
    const extras = await this.extras();
    const activeWorks = new Set((extras?.works ?? []).filter((w) => isActive(w.from, w.to, date)).map((w) => w.id));
    const ctx = createContext(date, isDark(date, from[1], from[0]), { ...opts, rating, activeWorks });
    const fast = findRoute(this.graph, from, to, 'fastest', ctx);
    const safe = findRoute(this.graph, from, to, 'safest', ctx);
    if (!fast || !safe) return null;
    const same = fast.steps.length === safe.steps.length && fast.steps.every((s, i) => s.edge.id === safe.steps[i].edge.id);
    return { fastest: summarize(this.graph, fast, ctx, extras), safest: summarize(this.graph, safe, ctx, extras), same };
  }
}

/** Ist eine Baustelle am gewählten Tag aktiv? (Datum als JJJJ-MM-TT) */
export function isActive(from: string | null, to: string | null, date: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return (!from || from <= day) && (!to || day <= to);
}
