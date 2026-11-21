// Lichtpunkte (Laternen-Standorte) für die Licht-Ansicht der Karte.
// Datei lichter-<stadt>.json aus dem Datenbau: Koordinaten × scale als fortlaufende Differenzen [dx, dy, dx, dy, …].

import type { LngLat } from './types';

export interface LightsFile {
  v: 1;
  scale: number;
  n: number;
  d: number[];
}

/** Differenzen zurück in Koordinaten rechnen */
export function decodeLights(f: LightsFile): LngLat[] {
  const out: LngLat[] = new Array(f.n);
  let x = 0;
  let y = 0;
  for (let i = 0, j = 0; i + 1 < f.d.length; i += 2, j++) {
    x += f.d[i];
    y += f.d[i + 1];
    out[j] = [x / f.scale, y / f.scale];
  }
  return out;
}

/** Für die Ansicht von weit weg: Laternen in Felder von etwa `cell` Metern zusammenfassen (Mittelpunkt und Anzahl) */
export function aggregateLights(pts: LngLat[], cell = 100): { at: LngLat; n: number }[] {
  if (!pts.length) return [];
  const lat0 = pts[0][1];
  const dy = cell / 111320;
  const dx = cell / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const cells = new Map<string, { x: number; y: number; n: number }>();
  for (const [x, y] of pts) {
    const k = Math.floor(x / dx) + ':' + Math.floor(y / dy);
    const c = cells.get(k);
    if (c) {
      c.x += x;
      c.y += y;
      c.n++;
    } else cells.set(k, { x, y, n: 1 });
  }
  return [...cells.values()].map((c) => ({ at: [c.x / c.n, c.y / c.n] as LngLat, n: c.n }));
}

/** Für die Nahansicht: nur die Laternen im sichtbaren Ausschnitt. Sind es mehr als `max`, wird gleichmäßig
 *  ausgedünnt (jede k-te), damit der ganze Ausschnitt gefüllt bleibt – nicht nur ein Streifen. */
export function lightsInBox(pts: LngLat[], box: [number, number, number, number], max = 30000): LngLat[] {
  const inside: LngLat[] = [];
  for (const p of pts) {
    if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3]) continue;
    inside.push(p);
  }
  if (inside.length <= max) return inside;
  const step = inside.length / max;
  const out: LngLat[] = [];
  for (let k = 0; k < max; k++) out.push(inside[Math.floor(k * step)]);
  return out;
}
