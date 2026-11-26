import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClock, TransitNetwork, type RideLeg, type TransitData } from '../transit';
import { recommendTransit } from '../planner';
import type { RouteSummary } from '../analysis';

const data = JSON.parse(readFileSync('public/data/transit.json', 'utf8')) as TransitData;
const net = new TransitNetwork(data);
const rides = (o: { legs: { type: string }[] }) => o.legs.filter((l): l is RideLeg => l.type === 'ride');

// Ottakring (U3) → Volkstheater bzw. Westbahnhof → Praterstern
const ottakring: [number, number] = [16.3115, 48.2113];
const volkstheater: [number, number] = [16.3584, 48.2054];
const westbahnhof: [number, number] = [16.3375, 48.1967];
const praterstern: [number, number] = [16.3920, 48.2183];

describe('Öffi-Routing (Fahrplan)', () => {
  it('findet eine direkte U3-Verbindung an einem Werktag', () => {
    const date = new Date(2026, 10, 3, 18, 0); // Dienstag 18:00
    const [best] = net.search(ottakring, volkstheater, date, false);
    expect(best).toBeTruthy();
    expect(rides(best).map((r) => r.line)).toContain('U3');
    expect(best.totalMin).toBeLessThan(30);
    expect(best.waitMin).toBeLessThan(10);
  });

  it('findet eine Verbindung mit Umstieg', () => {
    const date = new Date(2026, 10, 3, 18, 0);
    const [best] = net.search(westbahnhof, praterstern, date, false);
    expect(best).toBeTruthy();
    expect(best.totalMin).toBeLessThan(40);
    console.log(rides(best).map((r) => `${r.line} ${formatClock(r.departMin)}→${formatClock(r.arriveMin)} (warten ${r.waitMin} min)`).join(' · '), `gesamt ${Math.round(best.totalMin)} min`);
  });

  it('nutzt am Wochenende nachts die durchfahrende U-Bahn', () => {
    const date = new Date(2026, 10, 7, 2, 30); // Nacht auf Samstag, 2:30
    const [best] = net.search(ottakring, volkstheater, date, true);
    expect(best).toBeTruthy();
    expect(rides(best)[0].line).toBe('U3');
    expect(best.waitMin).toBeLessThanOrEqual(16);
  });

  it('nutzt unter der Woche nachts Nachtbusse', () => {
    const date = new Date(2026, 10, 4, 2, 30); // Mittwoch 2:30
    const opts = net.search(westbahnhof, praterstern, date, true);
    expect(opts.length).toBeGreaterThan(0);
    expect(rides(opts[0]).every((r) => r.line.startsWith('N') || r.line.startsWith('U') === false)).toBe(true);
    console.log('Nacht Mi:', rides(opts[0]).map((r) => `${r.line} ${formatClock(r.departMin)}`).join(' · '));
  });
});

describe('Öffis vorauswählen', () => {
  const r = (min: number) => ({ seconds: min * 60 }) as unknown as RouteSummary;
  it('nur bei langem Fußweg und deutlich schnelleren Öffis', () => {
    expect(recommendTransit({ safest: r(72), transit: r(28) })).toBe(true);
    expect(recommendTransit({ safest: r(20), transit: r(10) })).toBe(false);
    expect(recommendTransit({ safest: r(40), transit: r(35) })).toBe(false);
    expect(recommendTransit({ safest: r(40), transit: null })).toBe(false);
  });
});

describe('Öffi-Routing: Wahl der Haltestellen', () => {
  // Eine Linie fährt von Süden nach Norden: Süd (0) → Mitte (1) → Nord (2) → Ende (3).
  // Der Start liegt zwischen Süd und Mitte, etwas näher an Mitte (wie in Berlin: Bundesplatz vs. Berliner Straße).
  const lon = 13.33;
  const at = (lat: number): [number, number] => [lon, 52.48 + lat];
  const mini: TransitData = {
    generated: '',
    source: 'Test',
    days: { mo: '', fr: '', sa: '', so: '' },
    validUntil: '',
    stops: [
      ['Süd', ...at(0), 1],
      ['Mitte', ...at(0.0095), 1],
      ['Nord', ...at(0.02), 1],
      ['Ende', ...at(0.05), 1],
    ],
    routes: [['U9', 1]],
    patterns: [
      {
        r: 0,
        h: '',
        s: [0, 1, 2, 3],
        o: [0, 2, 4, 10],
        d: { mo: Array.from({ length: 30 }, (_, i) => 1200 + i * 10), fr: [], sa: [], so: [] },
      },
    ],
  };
  const tiny = new TransitNetwork(mini);
  const start = at(0.005); // 556 m bis Süd, 500 m bis Mitte
  const goal = at(0.0505);
  const date = new Date(2026, 10, 25, 22, 8); // Mittwoch

  it('steigt an der nächsten Haltestelle in Fahrtrichtung ein, nicht an der Station dahinter', () => {
    const [best] = tiny.search(start, goal, date, true);
    expect(rides(best)[0].from.name).toBe('Mitte');
  });

  it('nimmt echte Fußwege statt Luftlinie, wenn sie bekannt sind', () => {
    // Mitte ist zu Fuß nur über einen weiten Umweg erreichbar (z. B. Bahngleise dazwischen)
    const access = (p: [number, number]) => (p[1] > 52.489 && p[1] < 52.49 ? 1500 : 600);
    const [best] = tiny.search(start, goal, date, true, 2, { access, egress: () => 60 });
    expect(rides(best)[0].from.name).toBe('Süd');
    expect(best.legs[0].type === 'walk' && best.legs[0].meters).toBe(600);
  });

  it('lässt Haltestellen weg, die zu Fuß nicht erreichbar sind', () => {
    const opts = tiny.search(start, goal, date, true, 2, { access: () => null });
    expect(opts).toHaveLength(0);
  });

  it('nennt ohne Richtungsangabe im Fahrplan die Endstation', () => {
    const [best] = tiny.search(start, goal, date, true);
    expect(rides(best)[0].headsign).toBe('Ende');
  });

  it('wählt bei seltenen Nachtfahrten trotzdem die nahe Haltestelle (später losgehen statt weiter gehen)', () => {
    const night: TransitData = { ...mini, patterns: [{ ...mini.patterns[0], d: { mo: [], fr: [], sa: [], so: [] } }] };
    night.patterns[0].d.mo = [24 * 60 + 52]; // eine Fahrt um 0:52, Losgehen um 0:00
    const [best] = new TransitNetwork(night).search(start, goal, new Date(2026, 10, 26, 0, 0), true);
    expect(rides(best)[0].from.name).toBe('Mitte');
  });
});
