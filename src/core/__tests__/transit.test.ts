import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatClock, TransitNetwork, type RideLeg, type TransitData } from '../transit';

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
