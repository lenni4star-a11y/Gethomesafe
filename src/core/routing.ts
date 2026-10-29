import { distance } from './geo';
import type { Graph } from './graph';
import { edgeRisk, WEIGHTS, type SafetyContext } from './safety';
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
