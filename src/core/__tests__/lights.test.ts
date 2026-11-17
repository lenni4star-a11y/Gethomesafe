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
