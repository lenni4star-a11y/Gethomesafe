// Aus einer berechneten Route werden hier Zahlen und Texte für die Anzeige gemacht:
// Länge, Dauer, Sicherheitswert mit Begründung, Beleuchtungs-Abschnitte und Wegbeschreibung.

import { along, bearing, distance, lineLength, turnAngle } from './geo';
import type { Graph } from './graph';
import { edgeSeconds, WALK_SPEED, type RawRoute, type RouteMode, type RouteStep } from './routing';
import { edgeClass, edgeRisk, openPoisNear, scoreFromRisk, type SafetyClass, type SafetyContext } from './safety';
import { Flag, WayKind, type Edge, type LngLat, type Poi } from './types';

/** Abschnitt mit gleicher Farbstufe (grün/gelb/rot) */
export interface ColorSegment {
  cls: SafetyClass;
  coords: LngLat[];
}

export type HintKind = 'dark' | 'unknown' | 'park' | 'tunnel' | 'steps' | 'track';

export interface Hint {
  kind: HintKind;
  text: string;
  /** Ort des Abschnitts (Mitte), z. B. für Straßenfotos */
  at: LngLat;
  /** Abstand vom Start in Metern */
  offset: number;
  length: number;
}

export interface Instruction {
  text: string;
  length: number;
  at: LngLat;
  hints: Hint[];
}

export interface RouteSummary {
  mode: RouteMode;
  coords: LngLat[];
  length: number;
  seconds: number;
  score: number;
  reasons: string[];
  lit: { yes: number; no: number; unknown: number };
  /** Anteile der Farbstufen (nach Länge) */
  classes: Record<SafetyClass, number>;
  segments: ColorSegment[];
  openPlaces: Poi[];
  instructions: Instruction[];
  hints: Hint[];
  dark: boolean;
}

const pct = (v: number) => Math.round(v * 100);

export function stepCoords(s: RouteStep): LngLat[] {
  return s.forward ? s.edge.coords : [...s.edge.coords].reverse();
}

export function summarize(graph: Graph, route: RawRoute, ctx: SafetyContext): RouteSummary {
  const coords: LngLat[] = [route.from];
  const segments: ColorSegment[] = [];
  const classLen: Record<SafetyClass, number> = { good: 0, medium: 0, bad: 0 };
  const hints: Hint[] = [];
  const open = new Map<string, Poi>();
  let length = distance(route.from, route.steps.length ? stepCoords(route.steps[0])[0] : route.to);
  const approach = length;
  let seconds = 0;
  let riskSum = 0;
  const litLen = { yes: 0, no: 0, unknown: 0 };
  let parkLen = 0;
  let mainLen = 0;
  let tunnels = 0;

  // Laufende Abschnitte für Hinweise
  let run: { kind: HintKind; start: number; length: number; coords: LngLat[] } | null = null;
  const closeRun = () => {
    if (!run) return;
    const min = run.kind === 'tunnel' || run.kind === 'steps' ? 0 : run.kind === 'park' ? 100 : 60;
    if (run.length >= min) {
      const m = Math.round(run.length / 10) * 10;
      const text = {
        dark: `${m} m unbeleuchteter Abschnitt`,
        unknown: `${m} m, Beleuchtung unbekannt`,
        park: `${m} m durch einen Park`,
        tunnel: `Unterführung (${m} m)`,
        steps: `Stiege (${m} m)`,
        track: `${m} m unbefestigter Weg`,
      }[run.kind];
      hints.push({ kind: run.kind, text, at: along(run.coords, run.length / 2), offset: run.start, length: run.length });
    }
    run = null;
  };

  for (const s of route.steps) {
    const e = s.edge;
    const c = stepCoords(s);
    coords.push(...c);
    const r = edgeRisk(e, graph.pois, ctx);
    riskSum += r.risk * e.length;
    seconds += edgeSeconds(e);
    litLen[e.lit] += e.length;
    if (e.flags & Flag.Park) parkLen += e.length;
    if (e.kind === WayKind.Main) mainLen += e.length;
    if (e.flags & Flag.Tunnel) tunnels++;
    for (const p of openPoisNear(e, graph.pois, ctx)) open.set(p.id, p);

    const cls = edgeClass(e, ctx);
    classLen[cls] += e.length;
    const last = segments[segments.length - 1];
    if (last && last.cls === cls) last.coords.push(...c.slice(1));
    else segments.push({ cls, coords: [...c] });

    const kind: HintKind | null =
      e.flags & Flag.Tunnel
        ? 'tunnel'
        : e.kind === WayKind.Steps
          ? 'steps'
          : ctx.dark && e.lit === 'no'
            ? 'dark'
            : ctx.dark && e.lit === 'unknown'
              ? 'unknown'
              : e.flags & Flag.Park
                ? 'park'
                : e.kind === WayKind.Track
                  ? 'track'
                  : null;
    if (run && run.kind !== kind) closeRun();
    if (kind) {
      if (!run) run = { kind, start: length, length: 0, coords: [] };
      run.length += e.length;
      run.coords.push(...(run.coords.length ? c.slice(1) : c));
    }
    length += e.length;
  }
  closeRun();

  const tail = distance(coords[coords.length - 1], route.to);
  coords.push(route.to);
  length += tail;
  seconds += (approach + tail) / WALK_SPEED;

  const netLen = Math.max(1, litLen.yes + litLen.no + litLen.unknown);
  const lit = { yes: litLen.yes / netLen, no: litLen.no / netLen, unknown: litLen.unknown / netLen };
  const meanRisk = riskSum / netLen;
  const score = scoreFromRisk(meanRisk);

  const reasons: string[] = [];
  if (ctx.dark) {
    reasons.push(`${pct(lit.yes)} % beleuchtet`);
    if (lit.no >= 0.01) reasons.push(`${pct(lit.no)} % unbeleuchtet`);
    if (lit.unknown >= 0.05) reasons.push(`${pct(lit.unknown)} % Beleuchtung unbekannt`);
  } else {
    reasons.push('Tageslicht');
  }
  const openList = [...open.values()];
  reasons.push(
    openList.length === 0
      ? 'keine geöffneten Orte direkt am Weg bekannt'
      : `${openList.length} ${openList.length === 1 ? 'geöffneter Ort' : 'geöffnete Orte'} am Weg`,
  );
  if (openList.some((p) => p.cat === 'police')) reasons.push('vorbei an einer Polizeiinspektion');
  if (parkLen >= 100) reasons.push(`${Math.round(parkLen / 10) * 10} m durch Parks`);
  if (tunnels) reasons.push(tunnels === 1 ? '1 Unterführung' : `${tunnels} Unterführungen`);
  if (mainLen / netLen >= 0.5) reasons.push('überwiegend Hauptstraßen');

  return {
    mode: route.mode,
    coords,
    length,
    seconds,
    score,
    reasons,
    lit,
    classes: { good: classLen.good / netLen, medium: classLen.medium / netLen, bad: classLen.bad / netLen },
    segments,
    openPlaces: openList,
    instructions: buildInstructions(route, hints, approach),
    hints,
    dark: ctx.dark,
  };
}

// ---------------------------------------------------------------- Wegbeschreibung

function label(e: Edge): string {
  if (e.name) return e.name;
  if (e.flags & Flag.Tunnel) return 'Unterführung';
  if (e.kind === WayKind.Steps) return 'Stiege';
  if (e.flags & Flag.Crossing) return 'Übergang';
  if (e.flags & Flag.Park) return 'Weg durch den Park';
  if (e.kind === WayKind.Pedestrian) return 'Fußgängerzone';
  if (e.kind === WayKind.Track) return 'Unbefestigter Weg';
  if (e.kind === WayKind.Service) return 'Zufahrt';
  return 'Fußweg';
}

function headingAt(coords: LngLat[], fromEnd: boolean): number {
  const len = lineLength(coords);
  const d = Math.min(15, len);
  if (fromEnd) return bearing(along(coords, len - d), coords[coords.length - 1]);
  return bearing(coords[0], along(coords, d));
}

function turnWord(angle: number): string {
  const a = Math.abs(angle);
  const side = angle > 0 ? 'rechts' : 'links';
  if (a < 25) return 'Weiter';
  if (a < 60) return `Leicht ${side}`;
  if (a < 150) return `${side === 'rechts' ? 'Rechts' : 'Links'} abbiegen`;
  return 'Umdrehen';
}

interface Group {
  label: string;
  length: number;
  coords: LngLat[];
  start: number;
}

function buildInstructions(route: RawRoute, hints: Hint[], approach: number): Instruction[] {
  const groups: Group[] = [];
  let offset = approach;
  for (const s of route.steps) {
    const c = stepCoords(s);
    const l = label(s.edge);
    const last = groups[groups.length - 1];
    if (last && (last.label === l || (s.edge.length < 25 && !s.edge.name))) {
      last.length += s.edge.length;
      last.coords.push(...c.slice(1));
    } else {
      groups.push({ label: l, length: s.edge.length, coords: [...c], start: offset });
    }
    offset += s.edge.length;
  }

  // Sehr kurze Stücke an die vorherige Gruppe anhängen
  const merged: Group[] = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    if (prev && g.length < 20) {
      prev.length += g.length;
      prev.coords.push(...g.coords.slice(1));
    } else merged.push({ ...g, coords: [...g.coords] });
  }

  return merged.map((g, i) => {
    let text: string;
    if (i === 0) text = `Los geht's: ${g.label}`;
    else {
      const angle = turnAngle(headingAt(merged[i - 1].coords, true), headingAt(g.coords, false));
      text = `${turnWord(angle)}: ${g.label}`;
    }
    const end = g.start + g.length;
    return {
      text,
      length: g.length,
      at: g.coords[0],
      hints: hints.filter((h) => h.offset >= g.start - 1 && h.offset < end),
    };
  });
}
