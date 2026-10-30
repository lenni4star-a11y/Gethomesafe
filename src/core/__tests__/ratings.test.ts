import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Planner } from '../planner';
import { edgeKey, matchesTime, newRating, timeFilterFor } from '../ratings';

const load = async <T,>(file: string): Promise<T> => JSON.parse(readFileSync(`public/data/${file}`, 'utf8')) as T;

describe('Zeitfenster', () => {
  it('Samstag 2 Uhr passt zu Freitag 23 Uhr (gleiche Wochenend-Nacht)', () => {
    const f = timeFilterFor(new Date('2026-11-07T02:00:00'), 3);
    expect(matchesTime({ weekday: 5, hour: 23 }, f)).toBe(true);
  });
  it('Dienstagnacht passt nicht zu Samstagnacht', () => {
    const f = timeFilterFor(new Date('2026-11-07T02:00:00'), 3);
    expect(matchesTime({ weekday: 2, hour: 2 }, f)).toBe(false);
  });
  it('Uhrzeit außerhalb des Fensters passt nicht', () => {
    const f = timeFilterFor(new Date('2026-11-06T23:00:00'), 2);
    expect(matchesTime({ weekday: 5, hour: 15 }, f)).toBe(false);
  });
});

describe('Bewertungen im Routing', () => {
  it('schlechte Bewertungen auf der schnellsten Route verschieben die sicherste Route', async () => {
    const planner = await Planner.create(load);
    const night = new Date('2026-11-06T23:30:00+01:00');
    const from: [number, number] = [16.3375, 48.1967];
    const to: [number, number] = [16.3478, 48.2105];
    const before = (await planner.plan(from, to, night))!;
    // die mittleren Wegstücke der bisher sichersten Route schlecht bewerten
    const route = before.safest;
    const g = planner.graph;
    const mids = route.coords.slice(Math.floor(route.coords.length * 0.3), Math.floor(route.coords.length * 0.7));
    const ratings = [];
    for (const c of mids.filter((_, i) => i % 3 === 0)) {
      const hit = g.nearestEdge(c, 5);
      if (hit)
        ratings.push(
          newRating({ target: { type: 'edge', key: edgeKey(g, hit.edge), name: hit.edge.name }, coords: c, score: 1, weekday: 5, hour: 23, reasons: ['uneasy'], note: '' }),
        );
    }
    expect(ratings.length).toBeGreaterThan(3);
    const after = (await planner.plan(from, to, night, { ratings }))!;
    const shared = after.safest.coords.filter((c) => mids.some((m) => m[0] === c[0] && m[1] === c[1])).length;
    expect(shared).toBeLessThan(mids.length * 0.5);
    expect(after.safest.classes.bad).toBeLessThan(0.2);
  });
});
