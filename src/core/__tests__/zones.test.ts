import { describe, expect, it } from 'vitest';
import { createContext, crimeRisk, WEIGHTS } from '../safety';
import { WayKind, type Edge } from '../types';
import { ZoneLookup, zoneLabel, zoneWeight, type Zone } from '../zones';

const edge = (id: number, at: [number, number], over: Partial<Edge> = {}): Edge => ({
  id, a: 0, b: 1, length: 100, kind: WayKind.Footway, name: '', lit: 'yes', lampCoverage: 1, litSource: 'osm', mlyCoverage: 0, works: [], flags: 0,
  coords: [at, [at[0] + 0.0005, at[1]]], pois: [], ...over,
});
const P: [number, number] = [16.3388, 48.1905];
const schutz: Zone = { id: 's', kind: 'schutzzone', name: 'Park', at: P, r: 200, from: '2026-11-08', until: '2027-05-07', source: 'LPD Wien', url: 'https://example.org' };
const alk: Zone = { id: 'a', kind: 'alkoholverbot', name: 'Bahnhof', at: P, r: 200, from: '2026-05-08', source: 'Stadt', url: 'https://example.org' };
const vorfall = (id: string, date: string): Zone => ({ id, kind: 'vorfall', name: 'Station', at: P, r: 150, date, what: 'einen Raub', source: 'ORF', url: 'https://example.org' });
const night = new Date('2026-11-20T23:30:00+01:00');

describe('amtliche Zonen', () => {
  it('gelten nur zwischen Beginn und Ende', () => {
    expect(zoneWeight(schutz, new Date('2026-11-07T12:00:00'))).toBe(0);
    expect(zoneWeight(schutz, night)).toBe(1);
    expect(zoneWeight(schutz, new Date('2027-05-07T23:00:00'))).toBe(1);
    expect(zoneWeight(schutz, new Date('2027-05-08T01:00:00'))).toBe(0);
  });
  it('höchste Stufe zählt, nicht doppelt mit dem Kantenfeld crime', () => {
    const zones = new ZoneLookup([schutz, alk], night);
    const ctx = createContext(night, true, { zones });
    expect(crimeRisk(edge(1, P), ctx)).toBeCloseTo(WEIGHTS.crime[2]);
    expect(crimeRisk(edge(2, P, { crime: 3 }), ctx)).toBeCloseTo(WEIGHTS.crime[3]);
    expect(crimeRisk(edge(3, [16.36, 48.2]), ctx)).toBe(0);
  });
  it('abschaltbar wie die übrigen amtlichen Daten', () => {
    const ctx = createContext(night, true, { zones: new ZoneLookup([schutz], night), crimeData: false });
    expect(ctx.crimeData).toBe(false);
  });
});

describe('gemeldete Vorfälle', () => {
  it('halbes Jahr voll, dann schwächer, nach zwei Jahren weg', () => {
    expect(zoneWeight(vorfall('v', '2026-08-01'), night)).toBe(1);
    const older = zoneWeight(vorfall('v', '2025-06-01'), night);
    expect(older).toBeGreaterThan(0);
    expect(older).toBeLessThan(1);
    expect(zoneWeight(vorfall('v', '2024-06-01'), night)).toBe(0);
    expect(zoneWeight(vorfall('v', '2027-01-01'), night)).toBe(0);
  });
  it('mehrere Berichte zusammen höchstens Stufe 2', () => {
    const zones = new ZoneLookup([vorfall('1', '2026-10-01'), vorfall('2', '2026-09-01'), vorfall('3', '2026-08-01')], night);
    expect(crimeRisk(edge(1, P), createContext(night, true, { zones }))).toBeCloseTo(WEIGHTS.crime[2]);
  });
  it('Begründung nennt Ort und Monat, keine Personengruppen', () => {
    expect(zoneLabel(vorfall('v', '2026-01-18'))).toBe('Bericht über einen Raub in der Nähe (Station, Jän. 2026)');
    expect(zoneLabel(schutz)).toBe('Schutzzone der Polizei (Park)');
  });
});
