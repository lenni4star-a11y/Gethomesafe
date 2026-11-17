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
