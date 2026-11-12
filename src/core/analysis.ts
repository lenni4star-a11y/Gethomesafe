// Aus einer berechneten Route werden hier Zahlen und Texte für die Anzeige gemacht:
// Länge, Dauer, Sicherheitswert mit Begründung, Beleuchtungs-Abschnitte und Wegbeschreibung.

import { along, bearing, distance, lineLength, turnAngle } from './geo';
import type { Graph } from './graph';
import { edgeSeconds, WALK_SPEED, type RawRoute, type RouteMode, type RouteStep } from './routing';
import { edgeClass, edgeRisk, openPoisNear, scoreFromRisk, type SafetyClass, type SafetyContext } from './safety';
import { simpleHoursState, type OpenState } from './openingHours';
import type { TransitOption } from './transit';
import { Flag, WayKind, type Edge, type Extras, type LngLat, type Poi, type PublicToilet, type Roadworks, type TaxiStand } from './types';

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
  mode: RouteMode | 'transit';
  /** Öffi-Fahrten (nur bei mode 'transit'), für die Karte */
  rides?: LngLat[][];
  /** zu jeder Fahrt: Linie, Verkehrsmittel und Farbe (gleiche Reihenfolge wie rides) */
  rideInfo?: { line: string; mode: number; color: string }[];
  /** die Öffi-Verbindung (nur bei mode 'transit') */
  transit?: TransitOption;
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
  /** Woher die Beleuchtungsinfo stammt (Anteile an der beleuchteten Strecke) */
  litSources: { osm: number; stadt: number; mapillary: number };
  /** zur gewählten Zeit aktive Baustellen am Weg */
  works: Roadworks[];
  /** nächster Taxistand nahe der Route (Stadt Wien) */
  taxi: { stand: TaxiStand; distance: number; offset: number } | null;
  /** öffentliche WCs bis 100 m neben der Route, mit Zustand zur gewählten Zeit */
  toilets: { wc: PublicToilet; state: OpenState; offset: number }[];
  /** Polizei-Standorte am Weg, die aus den Daten der Stadt Wien stammen */
  policeFromCity: number;
}

const pct = (v: number) => Math.round(v * 100);

export function stepCoords(s: RouteStep): LngLat[] {
  return s.forward ? s.edge.coords : [...s.edge.coords].reverse();
}

export function summarize(graph: Graph, route: RawRoute, ctx: SafetyContext, extras: Extras | null = null): RouteSummary {
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
  const litSrc = { osm: 0, stadt: 0, mapillary: 0 };
  const workIds = new Set<string>();
  let parkLen = 0;
  let mainLen = 0;
  let shopLen = 0;
  let kboLen = 0;
  let atlasLen = 0;
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
    if (e.lit === 'yes' && e.litSource !== 'none') litSrc[e.litSource] += e.length;
    if (ctx.activeWorks) for (const id of e.works) if (ctx.activeWorks.has(id)) workIds.add(id);
    if (e.flags & Flag.Park) parkLen += e.length;
    if (e.kind === WayKind.Main) mainLen += e.length;
    if ((e.frontage ?? 0) >= 5) shopLen += e.length;
    if (ctx.crimeData !== false && e.crime === 3) kboLen += e.length;
    else if (ctx.crimeData !== false && (e.crime ?? 0) >= 1) atlasLen += e.length;
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
  const policeFromCity = openList.filter((p) => p.cat === 'police' && p.source === 'stadt').length;
  if (openList.some((p) => p.cat === 'police')) reasons.push(`vorbei an einer Polizeiinspektion${policeFromCity ? ' (laut Stadt Wien)' : ''}`);

  // Woher die Beleuchtungsinfo stammt
  const litTotal = Math.max(1, litSrc.osm + litSrc.stadt + litSrc.mapillary);
  const litSources = { osm: litSrc.osm / litTotal, stadt: litSrc.stadt / litTotal, mapillary: litSrc.mapillary / litTotal };
  if (ctx.dark && litLen.yes > 0) {
    const parts = [
      litSources.osm >= 0.05 ? `${pct(litSources.osm)} % laut OpenStreetMap` : null,
      litSources.stadt >= 0.05 ? `${pct(litSources.stadt)} % laut Leuchtenstandorten der Stadt` : null,
      litSources.mapillary >= 0.05 ? `${pct(litSources.mapillary)} % Laternen auf Mapillary-Fotos erkannt` : null,
    ].filter(Boolean);
    if (parts.length) reasons.push(`Beleuchtung: ${parts.join(', ')}`);
  }

  // Baustellen, Taxistand, WCs (Stadt Wien)
  const works = (extras?.works ?? []).filter((w) => workIds.has(w.id));
  for (const w of works.slice(0, 2)) reasons.push(`Baustelle am Weg${w.to ? ` (bis ${formatDay(w.to)})` : ''}`);
  const taxi = nearestAlong(coords, extras?.taxi ?? [], 200);
  if (taxi) reasons.push(taxi.distance <= 30 ? 'Taxistand direkt am Weg' : `Taxistand ${Math.round(taxi.distance / 10) * 10} m neben dem Weg`);
  const toilets = (extras?.wc ?? [])
    .map((wc) => ({ wc, hit: closestOnLine(coords, [wc.lon, wc.lat]) }))
    .filter((t) => t.hit.distance <= 100)
    .map((t) => ({ wc: t.wc, state: simpleHoursState(t.wc.hours, ctx.date), offset: t.hit.offset }))
    .sort((a, b) => a.offset - b.offset);
  if (parkLen >= 100) reasons.push(`${Math.round(parkLen / 10) * 10} m durch Parks`);
  if (tunnels) reasons.push(tunnels === 1 ? '1 Unterführung' : `${tunnels} Unterführungen`);
  if (mainLen / netLen >= 0.5) reasons.push('überwiegend Hauptstraßen');
  if (shopLen / netLen >= 0.3) reasons.push(`${pct(shopLen / netLen)} % Geschäftsstraße (Schaufenster, Eingänge)`);
  if (kboLen >= 50) reasons.push(`${Math.round(kboLen / 10) * 10} m durch einen kriminalitätsbelasteten Ort (laut Polizei Berlin, kleiner Abzug)`);
  if (atlasLen / netLen >= 0.2) reasons.push(`${pct(atlasLen / netLen)} % in Gegenden mit mehr Straßenraub und Körperverletzung (Kriminalitätsatlas, kleiner Abzug)`);

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
    litSources,
    works,
    taxi: taxi && { stand: taxi.item, distance: taxi.distance, offset: taxi.offset },
    toilets,
    policeFromCity,
  };
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}

/** Nächster Punkt auf einer Linie: Abstand und Strecke ab Start */
function closestOnLine(line: LngLat[], p: LngLat): { distance: number; offset: number } {
  let best = { distance: Infinity, offset: 0 };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const segLen = distance(line[i - 1], line[i]);
    // grob: Abstand zum näheren Endpunkt oder zur Mitte genügt bei kurzen Kanten
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const q: LngLat = [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
      const d = distance(q, p);
      if (d < best.distance) best = { distance: d, offset: acc + segLen * t };
    }
    acc += segLen;
  }
  return best;
}

function nearestAlong<T extends { lon: number; lat: number }>(line: LngLat[], items: T[], max: number): { item: T; distance: number; offset: number } | null {
  let best: { item: T; distance: number; offset: number } | null = null;
  for (const item of items) {
    const hit = closestOnLine(line, [item.lon, item.lat]);
    if (hit.distance <= max && (!best || hit.distance < best.distance)) best = { item, ...hit };
  }
  return best;
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
