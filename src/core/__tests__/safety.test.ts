import { describe, expect, it } from 'vitest';
import { createContext, edgeClass, edgeRisk } from '../safety';
import { Flag, WayKind, type Edge } from '../types';

const edge = (over: Partial<Edge> = {}): Edge => ({
  id: 0, a: 0, b: 1, length: 100, kind: WayKind.Footway, name: '', lit: 'yes', lampCoverage: 1, litSource: 'osm', flags: 0,
  coords: [[16.3, 48.2], [16.301, 48.2]], pois: [], ...over,
});
const night = new Date('2026-11-06T23:30:00+01:00');

describe('Farbstufen', () => {
  it('nachts: beleuchtet = grün, unbekannt = gelb, unbeleuchtet = rot', () => {
    const ctx = createContext(night, true);
    expect(edgeClass(edge(), ctx)).toBe('good');
    expect(edgeClass(edge({ lit: 'unknown' }), ctx)).toBe('medium');
    expect(edgeClass(edge({ lit: 'no' }), ctx)).toBe('bad');
  });
  it('schlechte Bewertung macht auch beleuchtete Wege rot', () => {
    const ctx = createContext(night, true, { rating: () => ({ average: 1.5, count: 2 }) });
    expect(edgeClass(edge(), ctx)).toBe('bad');
  });
});

describe('Parks', () => {
  it('Einstellung „egal“ hebt den Park-Aufschlag auf, „stark“ erhöht ihn', () => {
    const park = edge({ flags: Flag.Park });
    const pois = new Map();
    const egal = edgeRisk(park, pois, createContext(night, true, { parkAvoidance: 0 })).risk;
    const normal = edgeRisk(park, pois, createContext(night, true, { parkAvoidance: 2 })).risk;
    const stark = edgeRisk(park, pois, createContext(night, true, { parkAvoidance: 3 })).risk;
    expect(egal).toBeLessThan(normal);
    expect(normal).toBeLessThan(stark);
  });
});

import { remainingAlong } from '../geo';

describe('Restweg', () => {
  it('misst den Rest ab dem nächsten Punkt der Route', () => {
    const line: [number, number][] = [[16.3, 48.2], [16.31, 48.2], [16.32, 48.2]];
    const r = remainingAlong(line, [16.315, 48.2001]);
    expect(Math.round(r.remaining)).toBeGreaterThan(360);
    expect(Math.round(r.remaining)).toBeLessThan(380);
    expect(r.offRoute).toBeLessThan(20);
  });
});
