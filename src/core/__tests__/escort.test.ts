import { describe, expect, it } from 'vitest';
import { classifyPin, escortReducer, startEscort, type EscortState } from '../escort';
import type { LngLat } from '../types';
import type { EscortSettings } from '../settings';

const settings: EscortSettings = { mode: 'interval', intervalSec: 60, responseSec: 20, callAttempts: 1, watchRoute: true, offRouteMeters: 75, offRouteSec: 30, stillMinutes: 3, arrivalMeters: 50 };
const tick = (s: EscortState, now: number) => escortReducer(s, { type: 'tick', now });

describe('Begleitmodus', () => {
  it('fragt nach dem Intervall nach und bleibt aktiv nach „Alles okay“', () => {
    let s = startEscort(settings, 0);
    s = tick(s, 59_000);
    expect(s.phase).toBe('active');
    s = tick(s, 60_000);
    expect(s.phase).toBe('prompt');
    s = escortReducer(s, { type: 'ok', now: 65_000 });
    expect(s.phase).toBe('active');
    expect(tick(s, 120_000).phase).toBe('active');
  });

  it('eskaliert: keine Antwort → Anruf → keine Antwort → Kontakte', () => {
    let s = tick(startEscort(settings, 0), 60_000);
    s = tick(s, 80_000);
    expect(s.phase).toBe('call');
    s = tick(s, 80_000 + 29_000);
    expect(s.phase).toBe('call');
    s = tick(s, 80_000 + 30_000);
    expect(s.phase).toBe('contact');
    expect(s.reason).toBe('no_answer');
  });

  it('„Nicht gut“ im Anruf führt sofort zu den Kontakten', () => {
    let s = tick(tick(startEscort(settings, 0), 60_000), 80_000);
    s = escortReducer(s, { type: 'answer', now: 85_000, ok: false });
    expect(s.phase).toBe('contact');
    expect(s.reason).toBe('not_ok');
  });

  it('mehrere Anrufversuche, wenn eingestellt', () => {
    let s = tick(tick(startEscort({ ...settings, callAttempts: 2 }, 0), 60_000), 80_000);
    s = tick(s, 110_000);
    expect(s.phase).toBe('call');
    expect(s.callAttempt).toBe(2);
    s = tick(s, 140_000);
    expect(s.phase).toBe('contact');
  });

  it('„Gedrückt halten“: Loslassen startet die Rückfrage', () => {
    let s = startEscort({ ...settings, mode: 'hold' }, 0);
    s = escortReducer(s, { type: 'hold', now: 1000, down: true });
    expect(tick(s, 500_000).phase).toBe('active');
    s = escortReducer(s, { type: 'hold', now: 600_000, down: false });
    expect(s.phase).toBe('prompt');
    s = escortReducer(s, { type: 'hold', now: 605_000, down: true });
    expect(s.phase).toBe('active');
  });

  it('Fehlalarm abbrechen setzt zurück auf aktiv', () => {
    let s = escortReducer(startEscort(settings, 0), { type: 'help', now: 1000 });
    expect(s.phase).toBe('contact');
    s = escortReducer(s, { type: 'cancelAlarm', now: 2000 });
    expect(s.phase).toBe('active');
  });
});

// Hilfsfunktion: Position melden
const pos = (s: EscortState, now: number, coords: LngLat, offRoute: number | null, remaining: number | null = 1000, atStop = false) =>
  escortReducer(s, { type: 'position', now, coords, offRoute, remaining, atStop });

// ca. 10 m pro Schritt nach Osten
const walk = (i: number): LngLat => [16.35 + i * 0.000135, 48.2];

describe('Begleitmodus: Route überwachen', () => {
  const long = { ...settings, intervalSec: 3600 };

  it('fragt nach, wenn man länger als 30 s mehr als 75 m neben der Route ist', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(1), 100);
    expect(s.phase).toBe('active');
    s = pos(s, 20_000, walk(3), 110);
    expect(s.phase).toBe('active');
    s = pos(s, 31_500, walk(5), 120);
    expect(s.phase).toBe('prompt');
    expect(s.promptReason).toBe('offroute');
  });

  it('kurz neben der Route oder knapp daneben löst nichts aus', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(1), 100);
    s = pos(s, 20_000, walk(3), 10); // zurück auf der Route
    s = pos(s, 40_000, walk(5), 60); // unter 75 m
    expect(s.phase).toBe('active');
  });

  it('nach „alles okay“ keine neue Abweichungs-Rückfrage, bis man wieder auf der Route ist', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(1), 100);
    s = pos(s, 32_000, walk(4), 100);
    expect(s.phase).toBe('prompt');
    s = escortReducer(s, { type: 'ok', now: 33_000 });
    s = pos(s, 80_000, walk(9), 150);
    expect(s.phase).toBe('active');
    s = pos(s, 90_000, walk(12), 5); // wieder auf der Route
    s = pos(s, 100_000, walk(15), 120);
    s = pos(s, 131_000, walk(18), 120);
    expect(s.promptReason).toBe('offroute');
  });

  it('fragt nach, wenn man 3 Minuten an derselben Stelle steht', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(0), 0);
    s = pos(s, 120_000, [16.35005, 48.20005], 0); // ca. 7 m – gilt als Stehen
    expect(s.phase).toBe('active');
    s = pos(s, 181_500, walk(0), 0);
    expect(s.phase).toBe('prompt');
    expect(s.promptReason).toBe('still');
  });

  it('an einer Haltestelle zu warten löst keine Rückfrage aus', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(0), 0, 1000, true);
    s = pos(s, 300_000, walk(0), 0, 1000, true);
    expect(s.phase).toBe('active');
  });

  it('Gehen setzt den Stillstand zurück', () => {
    let s = startEscort(long, 0);
    for (let i = 0; i <= 30; i++) s = pos(s, 1_000 + i * 10_000, walk(i * 4), 0);
    expect(s.phase).toBe('active');
  });

  it('lässt sich abschalten', () => {
    let s = startEscort({ ...long, watchRoute: false }, 0);
    s = pos(s, 1_000, walk(0), 500);
    s = pos(s, 400_000, walk(0), 500);
    expect(s.phase).toBe('active');
  });

  it('nach Neuberechnung der Route beginnt die Abweichung von vorn', () => {
    let s = startEscort(long, 0);
    s = pos(s, 1_000, walk(1), 100);
    s = escortReducer(s, { type: 'rerouted', now: 25_000 });
    s = pos(s, 31_500, walk(4), 100);
    expect(s.phase).toBe('active');
  });
});

describe('Begleitmodus: Ankunft', () => {
  it('fragt einmal „Bist du angekommen?“ im Umkreis von 50 m, beendet aber nichts', () => {
    let s = startEscort(settings, 0);
    s = pos(s, 1_000, walk(0), 0, 300);
    expect(s.askArrival).toBe(false);
    s = pos(s, 2_000, walk(1), 0, 40);
    expect(s.askArrival).toBe(true);
    expect(s.phase).toBe('active');
    s = escortReducer(s, { type: 'notArrived', now: 3_000 });
    s = pos(s, 4_000, walk(2), 0, 30);
    expect(s.askArrival).toBe(false); // nicht ständig nachfragen
  });
});

describe('Täuschungs-PIN', () => {
  it('unterscheidet echte PIN, Täuschungs-PIN und falsche PIN', () => {
    expect(classifyPin('a', 'a', 'b')).toBe('real');
    expect(classifyPin('b', 'a', 'b')).toBe('decoy');
    expect(classifyPin('c', 'a', 'b')).toBe(null);
    expect(classifyPin('b', 'a', null)).toBe(null);
  });
});
