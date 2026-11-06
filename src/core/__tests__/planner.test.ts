import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Planner, recommendTransit, transitScore } from '../planner';

const load = async <T,>(file: string): Promise<T> => JSON.parse(readFileSync(`public/data/${file}`, 'utf8')) as T;

describe('Planner (echte Daten)', () => {
  it('findet nachts schnellste und sicherste Route Westbahnhof → Josefstädter Straße', async () => {
    const planner = await Planner.create(load);
    const night = new Date('2026-11-06T23:30:00+01:00');
    const res = await planner.plan([16.3375, 48.1967], [16.3478, 48.2105], night);
    expect(res).not.toBeNull();
    const { fastest, safest } = res!;
    for (const r of [fastest, safest]) {
      console.log(r.mode, Math.round(r.length), 'm', Math.round(r.seconds / 60), 'min', 'Wert', r.score, r.reasons.join(' · '));
      console.log('  ', r.instructions.map((i) => `${i.text} (${Math.round(i.length)} m)${i.hints.length ? ' ⚠ ' + i.hints.map((h) => h.text).join(', ') : ''}`).join('\n   '));
    }
    expect(safest.score).toBeGreaterThanOrEqual(fastest.score);
    expect(fastest.length).toBeLessThanOrEqual(safest.length + 1);
  });

  it('Prater-Route: nachts meidet die sicherste Route dunkle Parkwege', async () => {
    const planner = await Planner.create(load);
    const night = new Date('2026-11-06T23:30:00+01:00');
    const res = (await planner.plan([16.3958, 48.2166], [16.4115, 48.2071], night))!;
    for (const r of [res.fastest, res.safest]) console.log(r.mode, Math.round(r.length), 'm', 'Wert', r.score, r.reasons.join(' · '));
    expect(res.safest.score).toBeGreaterThanOrEqual(res.fastest.score);
  });
});

describe('Sicherheitswert mit Öffis', () => {
  const base = { walkScore: 5, walkMin: 10, waitMin: 2, darkStops: 0, dark: true };

  it('Fahrzeit hebt den Wert über den der Fußwege', () => {
    expect(transitScore({ ...base, rides: [{ minutes: 20, mode: 1 }] })).toBeGreaterThan(base.walkScore);
  });

  it('langes Warten an dunkler Haltestelle senkt den Wert', () => {
    const lit = transitScore({ ...base, waitMin: 15, rides: [{ minutes: 10, mode: 3 }] });
    const darkStop = transitScore({ ...base, waitMin: 15, darkStops: 1, rides: [{ minutes: 10, mode: 3 }] });
    expect(darkStop).toBeLessThan(lit);
  });

  it('bleibt zwischen 1 und 10', () => {
    expect(transitScore({ ...base, walkScore: 10, rides: [{ minutes: 60, mode: 1 }] })).toBeLessThanOrEqual(10);
    expect(transitScore({ ...base, walkScore: 1, walkMin: 0, waitMin: 0, rides: [] })).toBe(1);
  });

  it('nachts vorausgewählt, wenn sicherer und kaum länger', () => {
    const safest = { seconds: 20 * 60, score: 6, dark: true } as never;
    expect(recommendTransit({ safest, transit: { seconds: 22 * 60, score: 8 } as never })).toBe(true);
    expect(recommendTransit({ safest, transit: { seconds: 35 * 60, score: 8 } as never })).toBe(false);
    const day = { seconds: 20 * 60, score: 6, dark: false } as never;
    expect(recommendTransit({ safest: day, transit: { seconds: 22 * 60, score: 8 } as never })).toBe(false);
  });
});
