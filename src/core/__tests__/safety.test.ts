import { describe, expect, it } from 'vitest';
import { createContext, edgeClass, edgeRisk, parkClosed } from '../safety';
import { Flag, WayKind, type Edge } from '../types';

const edge = (over: Partial<Edge> = {}): Edge => ({
  id: 0, a: 0, b: 1, length: 100, kind: WayKind.Footway, name: '', lit: 'yes', lampCoverage: 1, litSource: 'osm', mlyCoverage: 0, works: [], flags: 0,
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

describe('amtliche Kriminalitätsdaten', () => {
  it('Abzug: Stufe 3 etwa drei Punkte, abschaltbar, tagsüber halb so stark', () => {
    const pois = new Map();
    const base = edgeRisk(edge(), pois, createContext(night, true)).risk;
    const kbo = edgeRisk(edge({ crime: 3 }), pois, createContext(night, true)).risk;
    const off = edgeRisk(edge({ crime: 3 }), pois, createContext(night, true, { crimeData: false })).risk;
    expect(kbo - base).toBeGreaterThan(0.3);
    expect(kbo - base).toBeLessThan(0.36);
    expect(off).toBe(base);
    const day = new Date('2026-11-06T13:00:00+01:00');
    const dayDiff = edgeRisk(edge({ crime: 2 }), pois, createContext(day, false)).risk - edgeRisk(edge(), pois, createContext(day, false)).risk;
    expect(dayDiff).toBeCloseTo(0.11, 2);
  });
});

describe('nachts zugesperrte Parks', () => {
  it('gesperrt außerhalb der Öffnungszeiten, offen tagsüber, ohne Zeiten nie gesperrt', () => {
    const p = edge({ flags: Flag.Park, parkHours: 'Mo-Su 06:00-22:00' });
    expect(parkClosed(p, night)).toBe(true);
    expect(parkClosed(p, new Date('2026-11-06T14:00:00+01:00'))).toBe(false);
    expect(parkClosed(edge({ flags: Flag.Park }), night)).toBe(false);
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

import { simpleHoursState } from '../openingHours';
import { isActive } from '../planner';

describe('Zusatzdaten Stadt Wien', () => {
  it('liest WC-Öffnungszeiten', () => {
    const at = (h: number) => new Date(2026, 10, 1, h, 0);
    expect(simpleHoursState('00:00-24:00 Uhr', at(3))).toBe('open');
    expect(simpleHoursState('06:00-22:00 Uhr', at(23))).toBe('closed');
    expect(simpleHoursState('06:00-22:00 Uhr', at(12))).toBe('open');
    expect(simpleHoursState('Lokalöffnungszeiten', at(12))).toBe('unknown');
  });
  it('Baustellen gelten nur in ihrem Zeitraum', () => {
    const d = new Date(2026, 10, 1);
    expect(isActive('2026-10-01', '2026-11-15', d)).toBe(true);
    expect(isActive('2026-11-02', '2026-11-15', d)).toBe(false);
    expect(isActive('2026-01-01', '2026-10-31', d)).toBe(false);
  });
  it('Laternen nur auf Fotos erkannt zählen schwächer als Stadt-Wien-Daten', () => {
    const ctx = createContext(night, true);
    const pois = new Map();
    const city = edgeRisk(edge({ litSource: 'stadt' }), pois, ctx).light;
    const photo = edgeRisk(edge({ litSource: 'mapillary' }), pois, ctx).light;
    expect(photo).toBeGreaterThan(city);
    expect(photo).toBeLessThan(edgeRisk(edge({ lit: 'unknown', litSource: 'none', lampCoverage: 0 }), pois, ctx).light);
  });
});

describe('Geschäftsstraßen', () => {
  it('senken nachts das Risiko, auch wenn nichts geöffnet hat', () => {
    const ctx = createContext(night, true);
    const pois = new Map();
    const plain = edgeRisk(edge(), pois, ctx);
    const shops = edgeRisk(edge({ frontage: 12 }), pois, ctx);
    expect(shops.life).toBeLessThan(plain.life);
    expect(shops.risk).toBeLessThan(plain.risk);
  });
  it('alte Daten ohne Angabe ändern nichts', () => {
    const ctx = createContext(night, true);
    expect(edgeRisk(edge({ frontage: undefined }), new Map(), ctx).life).toBe(1);
  });
});
