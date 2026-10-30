import { describe, expect, it } from 'vitest';
import { escortReducer, startEscort, type EscortState } from '../escort';
import type { EscortSettings } from '../settings';

const settings: EscortSettings = { mode: 'interval', intervalSec: 60, responseSec: 20, callAttempts: 1 };
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
