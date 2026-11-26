import { distance } from './geo';
import type { Graph } from './graph';
import { edgeRisk, parkClosed, WEIGHTS, type SafetyContext } from './safety';
import { WayKind, type Edge, type LngLat } from './types';

/** Gehgeschwindigkeit in m/s (≈ 4,7 km/h) */
export const WALK_SPEED = 1.3;

export type RouteMode = 'fastest' | 'safest';

export interface RouteStep {
  edge: Edge;
  /** true = Kante wird von a nach b begangen */
  forward: boolean;
}

export interface RawRoute {
  mode: RouteMode;
  steps: RouteStep[];
  from: LngLat;
  to: LngLat;
}

export function edgeSeconds(e: Edge): number {
  return e.length / (e.kind === WayKind.Steps ? WALK_SPEED * 0.6 : WALK_SPEED);
}

/** Klassischer A*-Algorithmus mit binärem Heap */
export function findRoute(graph: Graph, from: LngLat, to: LngLat, mode: RouteMode, ctx: SafetyContext): RawRoute | null {
  const start = graph.nearestNode(from);
  const goal = graph.nearestNode(to);
  if (start === null || goal === null) return null;

  const n = graph.coords.length;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameBy = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const riskCache = new Float32Array(graph.edges.length).fill(-1);
  const goalC = graph.coords[goal];

  const cost = (e: Edge): number => {
    // zugesperrter Park: nie durchführen (auch nicht beim schnellsten Weg)
    if (e.parkHours && parkClosed(e, ctx.date)) return Infinity;
    if (mode === 'fastest') return edgeSeconds(e) * WALK_SPEED;
    let r = riskCache[e.id];
    if (r < 0) riskCache[e.id] = r = edgeRisk(e, graph.pois, ctx).risk;
    return edgeSeconds(e) * WALK_SPEED * (1 + WEIGHTS.avoid * r);
  };

  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(start, distance(graph.coords[start], goalC));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const eid of graph.adjacency[cur]) {
      const e = graph.edges[eid];
      const next = graph.other(e, cur);
      if (closed[next]) continue;
      const g = gScore[cur] + cost(e);
      if (g < gScore[next]) {
        gScore[next] = g;
        cameBy[next] = eid;
        heap.push(next, g + distance(graph.coords[next], goalC));
      }
    }
  }

  if (start !== goal && cameBy[goal] === -1) return null;

  const steps: RouteStep[] = [];
  let node = goal;
  while (node !== start) {
    const e = graph.edges[cameBy[node]];
    const prev = graph.other(e, node);
    steps.push({ edge: e, forward: e.a === prev });
    node = prev;
  }
  steps.reverse();
  return { mode, steps, from, to };
}

/**
 * Echte Gehwege ab einem Punkt (für die Öffi-Suche): Dijkstra mit denselben Kosten wie die sicherste Route,
 * Ergebnis je Knoten = Länge (m) dieses Weges. So kennt die Öffi-Suche die Fußwege, die die App später zeigt,
 * statt mit der Luftlinie zu schätzen. Gesucht wird nur bis `maxMeters` Weglänge.
 * Das Wegenetz ist ungerichtet, deshalb gilt das Ergebnis auch für den Weg zurück zu diesem Punkt.
 */
export function walkReach(graph: Graph, from: LngLat, ctx: SafetyContext, maxMeters: number): ((p: LngLat) => number | null) | null {
  const start = graph.nearestNode(from);
  if (start === null) return null;
  const cost = new Map<number, number>([[start, 0]]);
  const len = new Map<number, number>([[start, 0]]);
  const done = new Set<number>();
  const riskCache = new Map<number, number>();
  const heap = new MinHeap();
  heap.push(start, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (done.has(cur)) continue;
    done.add(cur);
    const curLen = len.get(cur)!;
    if (curLen > maxMeters) continue;
    for (const eid of graph.adjacency[cur]) {
      const e = graph.edges[eid];
      if (e.parkHours && parkClosed(e, ctx.date)) continue;
      const next = graph.other(e, cur);
      if (done.has(next)) continue;
      let r = riskCache.get(e.id);
      if (r === undefined) riskCache.set(e.id, (r = edgeRisk(e, graph.pois, ctx).risk));
      const c = cost.get(cur)! + edgeSeconds(e) * WALK_SPEED * (1 + WEIGHTS.avoid * r);
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        len.set(next, curLen + e.length);
        heap.push(next, c);
      }
    }
  }
  const startOffset = distance(graph.coords[start], from);
  return (p) => {
    const n = graph.nearestNode(p, 150);
    if (n === null || !done.has(n)) return null;
    const m = len.get(n)!;
    return m > maxMeters ? null : m + startOffset + distance(graph.coords[n], p);
  };
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    const it = this.items;
    const pr = this.prio;
    let i = it.length;
    it.push(item);
    pr.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= p) break;
      it[i] = it[parent];
      pr[i] = pr[parent];
      i = parent;
    }
    it[i] = item;
    pr[i] = p;
  }
  pop(): number {
    const it = this.items;
    const pr = this.prio;
    const top = it[0];
    const lastI = it.pop()!;
    const lastP = pr.pop()!;
    if (it.length) {
      let i = 0;
      const len = it.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= len) break;
        const r = l + 1;
        const c = r < len && pr[r] < pr[l] ? r : l;
        if (pr[c] >= lastP) break;
        it[i] = it[c];
        pr[i] = pr[c];
        i = c;
      }
      it[i] = lastI;
      pr[i] = lastP;
    }
    return top;
  }
}
