import { describe, expect, it } from 'vitest';
import { decodeLights } from '../lights';

describe('Lichtpunkte', () => {
  it('rechnet die Differenzen zurück in Koordinaten', () => {
    const pts = decodeLights({ v: 1, scale: 1e5, n: 3, d: [1636000, 4820000, 5, -2, 10, 3] });
    expect(pts).toEqual([
      [16.36, 48.2],
      [16.36005, 48.19998],
      [16.36015, 48.20001],
    ]);
  });
});

import { aggregateLights, lightsInBox } from '../lights';

describe('Lichtpunkte zusammenfassen', () => {
  const pts: [number, number][] = [
    [16.36, 48.2],
    [16.36001, 48.20001],
    [16.37, 48.21],
  ];
  it('fasst nahe Laternen zu einem Feld zusammen', () => {
    const cells = aggregateLights(pts, 100);
    expect(cells.length).toBe(2);
    expect(cells.reduce((s, c) => s + c.n, 0)).toBe(3);
  });
  it('liefert nur Laternen im Ausschnitt', () => {
    expect(lightsInBox(pts, [16.35, 48.19, 16.365, 48.205])).toHaveLength(2);
  });
});
