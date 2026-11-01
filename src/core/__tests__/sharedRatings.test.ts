import { describe, expect, it } from 'vitest';
import { newRating } from '../ratings';
import { aggregateShared, ageWeight, SHARING_RULES, toShared, type SharedRating } from '../sharedRatings';

const now = new Date('2026-11-01T12:00:00Z');
const r = (device: string, score: 1 | 2 | 3 | 4 | 5, daysAgo = 0, key = 'edge:1-2'): SharedRating => ({
  device,
  targetKey: key,
  score,
  weekday: 5,
  hour: 23,
  reasons: [],
  createdAt: new Date(now.getTime() - daysAgo * 864e5).toISOString(),
});

describe('Gemeinsame Bewertungen (Vorbereitung)', () => {
  it('zählen erst ab drei verschiedenen Geräten', () => {
    expect(aggregateShared([r('a', 1), r('b', 1)], now).size).toBe(0);
    expect(aggregateShared([r('a', 1), r('b', 1), r('c', 2)], now).get('edge:1-2')?.average).toBeCloseTo(4 / 3);
  });

  it('ein Gerät kann nicht mehrfach zählen (nur die neueste Bewertung)', () => {
    const list = [r('a', 1, 3), r('a', 1, 2), r('a', 1, 1), r('b', 5), r('c', 5)];
    expect(aggregateShared(list, now).get('edge:1-2')?.average).toBeCloseTo((1 + 5 + 5) / 3);
  });

  it('alte Bewertungen verlieren Gewicht und verfallen', () => {
    expect(ageWeight(new Date(now.getTime() - SHARING_RULES.halfLifeDays * 864e5).toISOString(), now)).toBeCloseTo(0.5);
    expect(ageWeight(new Date(now.getTime() - 800 * 864e5).toISOString(), now)).toBe(0);
    const res = aggregateShared([r('a', 1, 400), r('b', 5), r('c', 5)], now).get('edge:1-2')!;
    expect(res.average).toBeGreaterThan(4); // die alte schlechte Bewertung zählt kaum noch
  });

  it('Ratenbegrenzung: höchstens 20 pro Gerät und Tag', () => {
    const spam = Array.from({ length: 50 }, (_, i) => r('spam', 1, 0, `edge:${i}`));
    const others = Array.from({ length: 50 }, (_, i) => [r('b', 5, 0, `edge:${i}`), r('c', 5, 0, `edge:${i}`)]).flat();
    const res = aggregateShared([...spam, ...others], now);
    const affected = [...res.values()].filter((v) => v.average < 5).length;
    expect(affected).toBe(SHARING_RULES.maxPerDevicePerDay);
  });

  it('geteilt werden nie Notizen und keine freien Orte', () => {
    const edge = newRating({ target: { type: 'edge', key: '1-2', name: 'X' }, coords: [16.3, 48.2], score: 2, weekday: 5, hour: 23, reasons: ['dark'], note: 'privat' });
    const shared = toShared(edge, 'dev')!;
    expect(JSON.stringify(shared)).not.toContain('privat');
    expect(shared).not.toHaveProperty('coords');
    const place = newRating({ target: { type: 'place', name: 'Ort' }, coords: [16.3, 48.2], score: 2, weekday: 5, hour: 23, reasons: [], note: '' });
    expect(toShared(place, 'dev')).toBeNull();
  });
});
