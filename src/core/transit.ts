// Öffi-Routing ohne Server: Fahrplan aus den offenen GTFS-Daten der Wiener Linien (vorverarbeitet in transit.json).
// Suche: zu Fuß zur Haltestelle → bis zu zwei Fahrten (ein Umstieg) → zu Fuß zum Ziel.
// Verfahren ähnlich „RAPTOR“: in Runden wird für jede Haltestelle die früheste Ankunft bestimmt.
// Nachts werden kurze Wartezeiten und beleuchtete Haltestellen bevorzugt.
// Live-Abfahrten (Verspätungen) gibt es noch nicht – dafür bräuchte es einen kleinen Server.

import { distance } from './geo';
import type { LngLat } from './types';

export type DayType = 'mo' | 'fr' | 'sa' | 'so';

export interface TransitData {
  generated: string;
  source: string;
  days: Record<DayType, string>;
  validUntil: string;
  /** [Name, lon, lat, beleuchtet 1/0] */
  stops: [string, number, number, number][];
  /** [Liniennummer, GTFS-Verkehrsmittel, Linienfarbe (optional, z. B. Berlin)] */
  routes: [string, number, string?][];
  patterns: { r: number; h: string; s: number[]; o: number[]; d: Record<DayType, number[]> }[];
}

export interface TransitStop {
  name: string;
  coords: LngLat;
  lit: boolean;
}

export interface WalkLeg {
  type: 'walk';
  from: LngLat;
  to: LngLat;
  meters: number;
  minutes: number;
}

export interface RideLeg {
  type: 'ride';
  line: string;
  /** 0 Straßenbahn, 1 U-Bahn, 2 Zug, 3 Bus */
  mode: number;
  /** Linienfarbe aus den Daten (sonst lineColor) */
  color?: string;
  headsign: string;
  from: TransitStop;
  to: TransitStop;
  /** Minuten ab Mitternacht des Abfahrtstags (kann > 1440 sein) */
  departMin: number;
  arriveMin: number;
  waitMin: number;
  stopCount: number;
  /** Haltestellen entlang der Fahrt (für die Karte) */
  path: LngLat[];
}

export type TransitLeg = WalkLeg | RideLeg;

export interface TransitOption {
  legs: TransitLeg[];
  /** Gesamtdauer in Minuten ab Losgehen */
  totalMin: number;
  /** Ankunft in Minuten ab Mitternacht des Abfahrtstags */
  arriveMin: number;
  waitMin: number;
  walkMeters: number;
  transfers: number;
  /** Bewertung für die Auswahl (Zeit + Zuschläge für Warten und dunkle Haltestellen) */
  cost: number;
}

/** Gehgeschwindigkeit für die Schätzung (Luftlinie × Umwegfaktor) */
const WALK_SPEED = 1.3;
const DETOUR = 1.3;
const MAX_ACCESS = 900; // höchstens so weit (Luftlinie, m) zur ersten / von der letzten Haltestelle
const MAX_TRANSFER = 250; // Umsteigen zu Fuß
const BOARD_BUFFER = 1; // Minuten Puffer beim Einsteigen
const walkMin = (m: number) => (m * DETOUR) / WALK_SPEED / 60;

export function dayTypeOf(d: Date): DayType {
  const wd = d.getDay();
  return wd === 0 ? 'so' : wd === 6 ? 'sa' : wd === 5 ? 'fr' : 'mo';
}

const prevDay = (d: Date): DayType => {
  const p = new Date(d);
  p.setDate(p.getDate() - 1);
  return dayTypeOf(p);
};

export class TransitNetwork {
  readonly stops: TransitStop[];
  private byStop: [number, number][][]; // je Haltestelle: [Muster, Position]
  private near: number[][] = []; // Umsteige-Nachbarn

  constructor(readonly data: TransitData) {
    this.stops = data.stops.map(([name, lon, lat, lit]) => ({ name, coords: [lon, lat], lit: lit === 1 }));
    this.byStop = this.stops.map(() => []);
    data.patterns.forEach((p, pi) => p.s.forEach((s, k) => this.byStop[s].push([pi, k])));
  }

  private transfersOf(s: number): number[] {
    if (!this.near[s]) {
      const c = this.stops[s].coords;
      this.near[s] = [];
      this.stops.forEach((o, i) => {
        if (i !== s && Math.abs(o.coords[1] - c[1]) < 0.003 && distance(o.coords, c) <= MAX_TRANSFER) this.near[s].push(i);
      });
    }
    return this.near[s];
  }

  stopsNear(p: LngLat, max = MAX_ACCESS): { stop: number; meters: number }[] {
    const out: { stop: number; meters: number }[] = [];
    this.stops.forEach((s, i) => {
      if (Math.abs(s.coords[1] - p[1]) > 0.01) return;
      const m = distance(s.coords, p);
      if (m <= max) out.push({ stop: i, meters: m });
    });
    return out;
  }

  /**
   * Beste Öffi-Verbindungen (höchstens `limit`), sortiert nach Bewertung.
   * `date` = Losgeh-Zeit; nachts (dark) zählen Warten und dunkle Haltestellen stärker.
   */
  search(from: LngLat, to: LngLat, date: Date, dark: boolean, limit = 2): TransitOption[] {
    const startMin = date.getHours() * 60 + date.getMinutes();
    const today = dayTypeOf(date);
    const yesterday = prevDay(date);
    const P = this.data.patterns;
    // Abfahrten je Muster für heute plus Nachtfahrten des Vortags (Zeiten > 24:00)
    const depsCache = new Map<number, number[]>();
    const deps = (pi: number) => {
      let d = depsCache.get(pi);
      if (!d) {
        const p = P[pi];
        d = [...p.d[yesterday].filter((x) => x >= 1440 - 120).map((x) => x - 1440), ...p.d[today]].sort((a, b) => a - b);
        depsCache.set(pi, d);
      }
      return d;
    };
    const firstAtOrAfter = (arr: number[], v: number) => {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      return lo < arr.length ? arr[lo] : null;
    };

    type Parent =
      | { kind: 'origin'; meters: number }
      | { kind: 'ride'; pattern: number; board: number; alight: number; base: number; fromStop: number }
      | { kind: 'transfer'; fromStop: number; meters: number };
    const ROUNDS = 2;
    const arr: number[][] = [];
    const parent: (Parent | undefined)[][] = [];
    const n = this.stops.length;

    // Runde 0: zu Fuß zu Haltestellen in der Nähe
    arr[0] = new Array(n).fill(Infinity);
    parent[0] = new Array(n);
    let marked = new Set<number>();
    for (const { stop, meters } of this.stopsNear(from)) {
      arr[0][stop] = startMin + walkMin(meters);
      parent[0][stop] = { kind: 'origin', meters };
      marked.add(stop);
    }

    for (let k = 1; k <= ROUNDS; k++) {
      arr[k] = [...arr[k - 1]];
      parent[k] = [...parent[k - 1]];
      const improved = new Set<number>();
      const patternsToScan = new Map<number, number>(); // Muster -> früheste markierte Position
      for (const s of marked)
        for (const [pi, pos] of this.byStop[s]) {
          const cur = patternsToScan.get(pi);
          if (cur === undefined || pos < cur) patternsToScan.set(pi, pos);
        }
      for (const [pi, startPos] of patternsToScan) {
        const p = P[pi];
        let base: number | null = null;
        let boardPos = -1;
        for (let i = startPos; i < p.s.length; i++) {
          const s = p.s[i];
          if (base !== null) {
            const t = base + p.o[i];
            if (t < arr[k][s]) {
              arr[k][s] = t;
              parent[k][s] = { kind: 'ride', pattern: pi, board: boardPos, alight: i, base, fromStop: p.s[boardPos] };
              improved.add(s);
            }
          }
          const ready = arr[k - 1][s];
          if (ready < Infinity) {
            const buffer = parent[k - 1][s]?.kind === 'origin' ? BOARD_BUFFER : BOARD_BUFFER + 1;
            const d = firstAtOrAfter(deps(pi), ready + buffer - p.o[i]);
            if (d !== null && (base === null || d < base) && d + p.o[i] - ready <= 45) {
              base = d;
              boardPos = i;
            }
          }
        }
      }
      // Umsteigen zu Fuß zu nahen Steigen
      const afterWalk = new Set(improved);
      for (const s of improved)
        for (const o of this.transfersOf(s)) {
          const m = distance(this.stops[s].coords, this.stops[o].coords);
          const t = arr[k][s] + walkMin(m);
          if (t < arr[k][o]) {
            arr[k][o] = t;
            parent[k][o] = { kind: 'transfer', fromStop: s, meters: m };
            afterWalk.add(o);
          }
        }
      marked = afterWalk;
      if (!marked.size) break;
    }

    // Ziel-Haltestellen auswerten
    const options: TransitOption[] = [];
    for (const { stop, meters } of this.stopsNear(to)) {
      for (let k = 1; k <= ROUNDS; k++) {
        if (!(arr[k]?.[stop] < Infinity) || parent[k][stop]?.kind === 'origin') continue;
        const legs = this.reconstruct(k, stop, from, parent);
        if (!legs) continue;
        const last = this.stops[stop].coords;
        const walkEnd = { type: 'walk' as const, from: last, to, meters: meters * DETOUR, minutes: walkMin(meters) };
        legs.push(walkEnd);
        const arriveMin = arr[k][stop] + walkEnd.minutes;
        const rides = legs.filter((l): l is RideLeg => l.type === 'ride');
        if (!rides.length) continue;
        const waitMin = setWaits(legs, startMin);
        const walkMeters = legs.filter((l): l is WalkLeg => l.type === 'walk').reduce((s, l) => s + l.meters, 0);
        const darkStops = rides.filter((r) => !r.from.lit).length + (rides.length && !rides[rides.length - 1].to.lit ? 1 : 0);
        const totalMin = arriveMin - startMin;
        const cost = totalMin + waitMin * (dark ? 0.8 : 0.3) + (dark ? darkStops * 4 : 0) + (rides.length - 1) * 4 + (dark ? walkMeters / 1000 * 3 : 0);
        options.push({ legs, totalMin, arriveMin, waitMin, walkMeters, transfers: rides.length - 1, cost });
      }
    }
    options.sort((a, b) => a.cost - b.cost);
    // gleiche Verbindungen (gleiche Linien und Abfahrt) nur einmal
    const seen = new Set<string>();
    return options
      .filter((o) => {
        const key = o.legs
          .filter((l): l is RideLeg => l.type === 'ride')
          .map((r) => `${r.line}@${r.departMin}`)
          .join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  private reconstruct(
    round: number,
    stop: number,
    from: LngLat,
    parent: (
      | { kind: 'origin'; meters: number }
      | { kind: 'ride'; pattern: number; board: number; alight: number; base: number; fromStop: number }
      | { kind: 'transfer'; fromStop: number; meters: number }
      | undefined
    )[][],
  ): TransitLeg[] | null {
    const legs: TransitLeg[] = [];
    let k = round;
    let s = stop;
    let guard = 0;
    while (guard++ < 10) {
      const p = parent[k][s];
      if (!p) return null;
      if (p.kind === 'origin') {
        legs.unshift({ type: 'walk', from, to: this.stops[s].coords, meters: p.meters * DETOUR, minutes: walkMin(p.meters) });
        break;
      }
      if (p.kind === 'transfer') {
        legs.unshift({ type: 'walk', from: this.stops[p.fromStop].coords, to: this.stops[s].coords, meters: p.meters * DETOUR, minutes: walkMin(p.meters) });
        s = p.fromStop;
        continue;
      }
      const pat = this.data.patterns[p.pattern];
      const [line, mode, color] = this.data.routes[pat.r];
      const departMin = p.base + pat.o[p.board];
      legs.unshift({
        type: 'ride',
        line,
        mode,
        color,
        headsign: pat.h,
        from: this.stops[pat.s[p.board]],
        to: this.stops[pat.s[p.alight]],
        departMin,
        arriveMin: p.base + pat.o[p.alight],
        waitMin: 0,
        stopCount: p.alight - p.board,
        path: pat.s.slice(p.board, p.alight + 1).map((i) => this.stops[i].coords),
      });
      s = p.fromStop;
      k -= 1;
    }
    return legs;
  }
}

/** Wartezeiten eintragen (Ankunft an der Haltestelle bis Abfahrt); gibt die Summe zurück */
function setWaits(legs: TransitLeg[], startMin: number): number {
  let t = startMin;
  let wait = 0;
  for (const l of legs) {
    if (l.type === 'walk') t += l.minutes;
    else {
      l.waitMin = Math.max(0, Math.round(l.departMin - t));
      wait += l.waitMin;
      t = l.arriveMin;
    }
  }
  return wait;
}

export function formatClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const MODE_LABEL: Record<number, string> = { 0: 'Straßenbahn', 1: 'U-Bahn', 2: 'Zug', 3: 'Bus', 7: 'Seilbahn' };

/**
 * Linienfarbe, angelehnt an die Farben der Wiener Linien (U1 rot, U2 violett, U3 orange, U4 grün, U5 türkis, U6 braun).
 * Straßenbahn rot, Bus dunkelblau, Nachtbus (N…) fast schwarz, Züge grau. Werte von Hand gewählt, nicht offiziell geliefert.
 */
const U_COLORS: Record<string, string> = {
  U1: '#e3000f',
  U2: '#a762a3',
  U3: '#ee7d00',
  U4: '#319f49',
  U5: '#2a9d9c',
  U6: '#a0712c',
};
export function lineColor(line: string, mode: number): string {
  if (U_COLORS[line]) return U_COLORS[line];
  if (/^N/.test(line) && mode === 3) return '#1c1f3a';
  if (mode === 0) return '#c8102e';
  if (mode === 3) return '#1f4e9c';
  return '#5c6670';
}
