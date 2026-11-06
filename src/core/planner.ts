// Lädt die nötigen Bezirke und berechnet schnellste und sicherste Route.
// Das Laden geschieht über eine übergebene Funktion, damit Web und native App
// ihre eigene Art verwenden können (fetch, Datei aus dem App-Paket, …).

import { summarize, type RouteSummary } from './analysis';
import { bboxAround, bboxIntersects, pointInRing } from './geo';
import { Graph } from './graph';
import { findRoute } from './routing';
import { formatClock, MODE_LABEL, TransitNetwork, type RideLeg, type TransitData } from './transit';
import { ratingLookup, timeFilterFor, type Rating } from './ratings';
import { createContext, type ContextOptions } from './safety';
import { isDark } from './sun';
import type { DataIndex, DistrictFile, DistrictInfo, Extras, LngLat } from './types';

export type JsonLoader = <T>(path: string) => Promise<T>;

export interface PlanResult {
  fastest: RouteSummary;
  safest: RouteSummary;
  /** Öffi-Verbindung (zu Fuß → Öffi → zu Fuß), nur wenn sie sich lohnt */
  transit?: RouteSummary | null;
  /** beide Routen sind gleich */
  same: boolean;
}

export class Planner {
  readonly graph = new Graph();
  private loading = new Map<number, Promise<void>>();
  private extrasPromise: Promise<Extras | null> | null = null;
  private transitPromise: Promise<TransitNetwork | null> | null = null;

  /** Öffi-Fahrplan (transit.json); fehlt die Datei, gibt es keine Öffi-Vorschläge */
  transitNetwork(): Promise<TransitNetwork | null> {
    this.transitPromise ??= this.load<TransitData>('transit.json')
      .then((d) => new TransitNetwork(d))
      .catch(() => null);
    return this.transitPromise;
  }

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

  async plan(from: LngLat, to: LngLat, date: Date, opts: ContextOptions & { ratings?: Rating[]; transit?: boolean } = {}): Promise<PlanResult | null> {
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
    const fastest = summarize(this.graph, fast, ctx, extras);
    const safest = summarize(this.graph, safe, ctx, extras);
    // Öffis nur vorschlagen, wenn der Fußweg nicht ganz kurz ist
    // Öffis immer anbieten (wie in Karten-Apps), außer bei ganz kurzen Wegen
    const transit = opts.transit === false || fastest.seconds < 5 * 60 ? null : await this.planTransit(from, to, date, ctx, extras, safest.seconds);
    return { fastest, safest, same, transit };
  }

  /** Kombinierte Route zu Fuß → Öffi → zu Fuß. Die Fußwege werden als sicherste Fußwege berechnet. */
  private async planTransit(from: LngLat, to: LngLat, date: Date, ctx: ReturnType<typeof createContext>, extras: Extras | null, walkSeconds: number): Promise<RouteSummary | null> {
    const net = await this.transitNetwork();
    if (!net) return null;
    const [opt] = net.search(from, to, date, ctx.dark, 1);
    if (!opt) return null;
    // Auch anzeigen, wenn es nicht schneller ist: Die Wahl trifft die Person (z. B. weniger Fußweg in der Nacht).
    const notFaster = opt.totalMin * 60 > walkSeconds - 4 * 60;
    const rides = opt.legs.filter((l): l is RideLeg => l.type === 'ride');
    const first = rides[0].from.coords;
    const last = rides[rides.length - 1].to.coords;
    await this.ensureDistricts([from, to, first, last], 300);
    const walkTo = findRoute(this.graph, from, first, 'safest', ctx);
    const walkFrom = findRoute(this.graph, last, to, 'safest', ctx);
    const a = walkTo ? summarize(this.graph, walkTo, ctx, extras) : null;
    const b = walkFrom ? summarize(this.graph, walkFrom, ctx, extras) : null;
    const walks = [a, b].filter(Boolean) as RouteSummary[];
    const walkLen = walks.reduce((s, w) => s + w.length, 0) || 1;
    const scoreWalk = walks.reduce((s, w) => s + w.score * w.length, 0) / walkLen;
    const darkStops = ctx.dark ? [rides[0].from, rides[rides.length - 1].to].filter((st) => !st.lit).length : 0;
    const score = transitScore({
      walkScore: walks.length ? scoreWalk : 8,
      walkMin: walks.reduce((m, w) => m + w.seconds / 60, 0),
      rides: rides.map((r) => ({ minutes: r.arriveMin - r.departMin, mode: r.mode })),
      waitMin: opt.waitMin,
      darkStops,
      dark: ctx.dark,
    });
    const lineText = rides.map((r) => r.line).join(' → ');
    const reasons = [
      `${lineText}, ab ${formatClock(rides[0].departMin)}`,
      opt.waitMin ? `${opt.waitMin} min Wartezeit` : 'ohne Wartezeit',
      `${Math.round(walkLen / 10) * 10} m zu Fuß`,
      ctx.dark ? (rides[0].from.lit ? 'Einstiegs-Haltestelle beleuchtet' : 'Einstiegs-Haltestelle: Beleuchtung unbekannt') : null,
      opt.transfers ? '1 Umstieg' : null,
      'Fahrt zählt als sicherer Teil (Fahrgäste, Personal, Notsprechstelle)',
      notFaster ? 'zu Fuß etwa gleich schnell oder schneller' : null,
      'Fahrplan, ohne Live-Verspätungen',
    ].filter(Boolean) as string[];
    const sumLit = (k: 'yes' | 'no' | 'unknown') => walks.reduce((s, w) => s + w.lit[k] * w.length, 0) / walkLen;
    const sumCls = (k: 'good' | 'medium' | 'bad') => walks.reduce((s, w) => s + w.classes[k] * w.length, 0) / walkLen;
    const instructions = [
      ...(a ? [{ text: `Zu Fuß zur Haltestelle ${rides[0].from.name}`, length: a.length, at: from, hints: a.hints }] : []),
      ...rides.map((r, i) => ({
        text: `${i ? 'Umsteigen: ' : ''}${MODE_LABEL[r.mode] ?? 'Linie'} ${r.line} Richtung ${r.headsign}, ab ${formatClock(r.departMin)}${r.waitMin ? ` (${r.waitMin} min warten)` : ''}, ${r.stopCount} ${r.stopCount === 1 ? 'Station' : 'Stationen'} bis ${r.to.name}`,
        length: 0,
        at: r.from.coords,
        hints: [],
      })),
      ...(b ? [{ text: `Zu Fuß von ${rides[rides.length - 1].to.name} zum Ziel`, length: b.length, at: last, hints: b.hints }] : []),
    ];
    return {
      mode: 'transit',
      transit: opt,
      rides: rides.map((r) => r.path),
      coords: [...(a?.coords ?? [from]), ...rides.flatMap((r) => r.path), ...(b?.coords ?? [to])],
      length: walkLen,
      seconds: Math.max(opt.totalMin * 60, (a?.seconds ?? 0) + (b?.seconds ?? 0)),
      score,
      reasons,
      lit: { yes: sumLit('yes'), no: sumLit('no'), unknown: sumLit('unknown') },
      classes: { good: sumCls('good'), medium: sumCls('medium'), bad: sumCls('bad') },
      segments: walks.flatMap((w) => w.segments),
      openPlaces: walks.flatMap((w) => w.openPlaces),
      instructions,
      hints: walks.flatMap((w) => w.hints),
      dark: ctx.dark,
      litSources: a?.litSources ?? { osm: 0, stadt: 0, mapillary: 0 },
      works: walks.flatMap((w) => w.works),
      taxi: a?.taxi ?? b?.taxi ?? null,
      toilets: walks.flatMap((w) => w.toilets),
      policeFromCity: walks.reduce((s, w) => s + w.policeFromCity, 0),
    };
  }
}

/**
 * Soll die App die Öffi-Variante gleich vorauswählen? Ja, wenn der Fußweg lang ist (ab 25 min)
 * und die Öffis mindestens ein Drittel schneller sind. Sonst bleibt die sicherste Fußroute vorausgewählt.
 */
export function recommendTransit(plan: Pick<PlanResult, 'safest' | 'transit'>): boolean {
  const t = plan.transit;
  if (!t) return false;
  // Nachts: Öffis vorauswählen, wenn sie mindestens so sicher sind und höchstens 5 min länger dauern
  if (plan.safest.dark && t.score >= plan.safest.score && t.seconds <= plan.safest.seconds + 5 * 60) return true;
  return plan.safest.seconds >= 25 * 60 && t.seconds <= plan.safest.seconds * (2 / 3);
}

/**
 * Sicherheitswert einer Öffi-Route (1–10): Mittel über die Zeit.
 * Fahren gilt als sicherster Teil (andere Fahrgäste, Fahrer*in, Notsprechstellen, Kameras):
 * U-Bahn und Zug 9, Straßenbahn und Bus 9 am Tag und 8 in der Nacht.
 * Warten: am Tag 8; nachts 7 an beleuchteten, 5 an dunklen bzw. unbekannten Haltestellen.
 * Fußwege zählen mit ihrem eigenen Wert (sicherste Fußroute).
 */
export function transitScore(p: {
  walkScore: number;
  walkMin: number;
  rides: { minutes: number; mode: number }[];
  waitMin: number;
  darkStops: number;
  dark: boolean;
}): number {
  const rideScore = (mode: number) => (mode === 1 || mode === 2 ? 9 : p.dark ? 8 : 9);
  const waitScore = !p.dark ? 8 : p.darkStops > 0 ? 5 : 7;
  const parts = [
    { min: Math.max(p.walkMin, 0), score: p.walkScore },
    ...p.rides.map((r) => ({ min: Math.max(r.minutes, 0), score: rideScore(r.mode) })),
    { min: Math.max(p.waitMin, 0), score: waitScore },
  ];
  const total = parts.reduce((s, x) => s + x.min, 0);
  if (total <= 0) return Math.max(1, Math.min(10, Math.round(p.walkScore)));
  const avg = parts.reduce((s, x) => s + x.min * x.score, 0) / total;
  return Math.max(1, Math.min(10, Math.round(avg)));
}

/** Ist eine Baustelle am gewählten Tag aktiv? (Datum als JJJJ-MM-TT) */
export function isActive(from: string | null, to: string | null, date: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return (!from || from <= day) && (!to || day <= to);
}
