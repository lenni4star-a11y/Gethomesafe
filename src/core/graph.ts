import { distance } from './geo';
import type { DistrictFile, Edge, LitState, LngLat, Poi } from './types';

/** Ab diesem Anteil an Leuchten in der Nähe gilt ein Weg als beleuchtet (Stadt-Wien-Daten) */
export const LAMP_COVERAGE_LIT = 0.6;

const CELL = 0.002; // ca. 150–220 m

/**
 * Das Wegenetz. Bezirke können nacheinander hinzugefügt werden;
 * gemeinsame Kreuzungen an Bezirksgrenzen werden über die OSM-ID verbunden.
 */
export class Graph {
  readonly coords: LngLat[] = [];
  readonly adjacency: number[][] = [];
  readonly edges: Edge[] = [];
  readonly pois = new Map<string, Poi>();
  readonly loaded = new Set<number>();
  /** OSM-ID je Knoten (für stabile Schlüssel, z. B. bei Bewertungen) */
  private osmIds: number[] = [];
  private nodeByOsm = new Map<number, number>();
  private grid = new Map<string, number[]>();
  /** Größe des zusammenhängenden Teilnetzes je Knoten (wird bei Bedarf berechnet) */
  private componentSize: Int32Array | null = null;

  addDistrict(file: DistrictFile): void {
    if (this.loaded.has(file.bezirk)) return;
    this.loaded.add(file.bezirk);
    this.componentSize = null;

    const local: number[] = [];
    for (let i = 0; i < file.nodes.length; i += 3) {
      const osm = file.nodes[i];
      let idx = this.nodeByOsm.get(osm);
      if (idx === undefined) {
        idx = this.coords.length;
        this.nodeByOsm.set(osm, idx);
        this.osmIds.push(osm);
        const c: LngLat = [file.nodes[i + 1] / 1e5, file.nodes[i + 2] / 1e5];
        this.coords.push(c);
        this.adjacency.push([]);
        const key = cellKey(c);
        const cell = this.grid.get(key);
        if (cell) cell.push(idx);
        else this.grid.set(key, [idx]);
      }
      local.push(idx);
    }

    for (const p of file.pois) this.pois.set(p.id, p);

    for (const raw of file.edges) {
      const [la, lb, length, kind, nameIdx, osmLit, cov, flags, geom, pois] = raw;
      const a = local[la];
      const b = local[lb];
      const coords: LngLat[] = [this.coords[a]];
      for (let i = 0; i < geom.length; i += 2) coords.push([geom[i] / 1e5, geom[i + 1] / 1e5]);
      coords.push(this.coords[b]);

      const lampCoverage = cov / 100;
      let lit: LitState = 'unknown';
      let litSource: Edge['litSource'] = 'none';
      if (osmLit === 1) [lit, litSource] = ['yes', 'osm'];
      else if (osmLit === 0) [lit, litSource] = ['no', 'osm'];
      else if (lampCoverage >= LAMP_COVERAGE_LIT) [lit, litSource] = ['yes', 'stadt'];

      const id = this.edges.length;
      this.edges.push({ id, a, b, length, kind, name: file.names[nameIdx] ?? '', lit, lampCoverage, litSource, flags, coords, pois });
      this.adjacency[a].push(id);
      this.adjacency[b].push(id);
    }
  }

  /**
   * Nächster Netzknoten. Kleine, abgeschnittene Wegstücke (z. B. Bahnsteige, Innenhöfe)
   * werden übersprungen, damit die Route immer ans Hauptnetz anschließt.
   */
  nearestNode(p: LngLat, maxMeters = 400): number | null {
    const sizes = this.components();
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    let best: number | null = null;
    let bestD = maxMeters;
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        const cell = this.grid.get(`${cx + dx}:${cy + dy}`);
        if (!cell) continue;
        for (const n of cell) {
          if (sizes[n] < 200) continue;
          const d = distance(p, this.coords[n]);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    return best;
  }

  osmIdOf(node: number): number {
    return this.osmIds[node];
  }

  /** Kanten mit mindestens einem Endpunkt im Umkreis (grobe Vorauswahl) */
  edgesNear(p: LngLat, meters: number): Edge[] {
    const out = new Set<Edge>();
    const r = Math.ceil(meters / 150) + 1;
    const cx = Math.floor(p[0] / CELL);
    const cy = Math.floor(p[1] / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (const n of this.grid.get(`${cx + dx}:${cy + dy}`) ?? [])
          if (distance(p, this.coords[n]) <= meters + 150) for (const eid of this.adjacency[n]) out.add(this.edges[eid]);
    return [...out];
  }

  /** Nächstes Wegstück zu einem Punkt (Abstand zur Linie), oder null */
  nearestEdge(p: LngLat, maxMeters = 30): { edge: Edge; distance: number } | null {
    let best: { edge: Edge; distance: number } | null = null;
    for (const e of this.edgesNear(p, maxMeters)) {
      for (let i = 1; i < e.coords.length; i++) {
        const d = distToSegment(p, e.coords[i - 1], e.coords[i]);
        if (d <= maxMeters && (!best || d < best.distance)) best = { edge: e, distance: d };
      }
    }
    return best;
  }

  private components(): Int32Array {
    if (this.componentSize) return this.componentSize;
    const n = this.coords.length;
    const comp = new Int32Array(n).fill(-1);
    const sizes: number[] = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] !== -1) continue;
      const id = sizes.length;
      let count = 0;
      const stack = [s];
      comp[s] = id;
      while (stack.length) {
        const cur = stack.pop()!;
        count++;
        for (const eid of this.adjacency[cur]) {
          const o = this.other(this.edges[eid], cur);
          if (comp[o] === -1) {
            comp[o] = id;
            stack.push(o);
          }
        }
      }
      sizes.push(count);
    }
    this.componentSize = Int32Array.from(comp, (c) => sizes[c]);
    return this.componentSize;
  }

  other(edge: Edge, node: number): number {
    return edge.a === node ? edge.b : edge.a;
  }
}

function distToSegment(p: LngLat, a: LngLat, b: LngLat): number {
  // lokale Projektion in Meter
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110540;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function cellKey(c: LngLat): string {
  return `${Math.floor(c[0] / CELL)}:${Math.floor(c[1] / CELL)}`;
}
