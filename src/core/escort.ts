// Begleitmodus: Ablauf der Eskalation als reine Logik (ohne Oberfläche, ohne Timer).
// Die Oberfläche ruft regelmäßig `tick` auf und meldet Eingaben; hier wird nur entschieden, was als Nächstes passiert.
//
// Ablauf: aktiv → Rückfrage („Alles okay?“) → simulierter Anruf → Kontakte benachrichtigen → Notruf-Bildschirm.
// Es gibt keine automatische Alarmierung der Polizei.

import type { EscortSettings } from './settings';

export type EscortPhase = 'active' | 'prompt' | 'call' | 'contact' | 'emergency';

export interface EscortState {
  phase: EscortPhase;
  settings: EscortSettings;
  startedAt: number;
  /** letzte Bestätigung („alles okay“) */
  lastOk: number;
  /** Modus „gedrückt halten“: wird gerade gehalten? */
  holding: boolean;
  /** Zeitpunkt, an dem die aktuelle Rückfrage bzw. der Anruf ohne Antwort abläuft */
  deadline: number | null;
  /** wie viele simulierte Anrufe in dieser Eskalation schon */
  callAttempt: number;
  /** warum Kontakte benachrichtigt werden sollen */
  reason: 'no_answer' | 'not_ok' | null;
}

export type EscortEvent =
  | { type: 'tick'; now: number }
  /** „Alles okay“ getippt (regelmäßiges Bestätigen oder Antwort auf Rückfrage) */
  | { type: 'ok'; now: number }
  | { type: 'hold'; now: number; down: boolean }
  | { type: 'answer'; now: number; ok: boolean }
  /** selbst Hilfe holen */
  | { type: 'help'; now: number }
  | { type: 'emergency'; now: number }
  /** Fehlalarm, nach PIN-Eingabe */
  | { type: 'cancelAlarm'; now: number };

/** Wie lange der simulierte Anruf klingelt, bevor er als „keine Antwort“ gilt */
export const callDuration = (s: EscortSettings) => Math.max(30, s.responseSec * 1.5) * 1000;

export function startEscort(settings: EscortSettings, now: number): EscortState {
  return { phase: 'active', settings, startedAt: now, lastOk: now, holding: false, deadline: null, callAttempt: 0, reason: null };
}

function toPrompt(s: EscortState, now: number): EscortState {
  return { ...s, phase: 'prompt', deadline: now + s.settings.responseSec * 1000 };
}

function toCall(s: EscortState, now: number): EscortState {
  return { ...s, phase: 'call', callAttempt: s.callAttempt + 1, deadline: now + callDuration(s.settings) };
}

function toActive(s: EscortState, now: number): EscortState {
  return { ...s, phase: 'active', lastOk: now, deadline: null, callAttempt: 0, reason: null };
}

/** Sekunden bis zur nächsten Rückfrage (nur Modus „regelmäßig bestätigen“) */
export function secondsUntilCheck(s: EscortState, now: number): number | null {
  if (s.phase !== 'active') return null;
  if (s.settings.mode === 'interval') return Math.max(0, Math.ceil((s.lastOk + s.settings.intervalSec * 1000 - now) / 1000));
  if (!s.holding) return Math.max(0, Math.ceil((s.lastOk + s.settings.responseSec * 1000 - now) / 1000));
  return null;
}

export function secondsLeft(s: EscortState, now: number): number | null {
  return s.deadline === null ? null : Math.max(0, Math.ceil((s.deadline - now) / 1000));
}

export function escortReducer(s: EscortState, e: EscortEvent): EscortState {
  switch (e.type) {
    case 'tick': {
      const now = e.now;
      if (s.phase === 'active') {
        if (s.settings.mode === 'interval' && now >= s.lastOk + s.settings.intervalSec * 1000) return toPrompt(s, now);
        // „Gedrückt halten“: nach dem Loslassen bleibt kurz Zeit, wieder zu halten
        if (s.settings.mode === 'hold' && !s.holding && now >= s.lastOk + s.settings.responseSec * 1000) return toPrompt(s, now);
        return s;
      }
      if (s.deadline === null || now < s.deadline) return s;
      if (s.phase === 'prompt') return toCall(s, now);
      if (s.phase === 'call') {
        if (s.callAttempt < s.settings.callAttempts) return toCall(s, now);
        return { ...s, phase: 'contact', deadline: null, reason: 'no_answer' };
      }
      return s;
    }
    case 'ok':
      if (s.phase === 'active' || s.phase === 'prompt') return toActive(s, e.now);
      return s;
    case 'hold':
      if (s.settings.mode !== 'hold') return s;
      if (e.down) return s.phase === 'active' || s.phase === 'prompt' ? { ...toActive(s, e.now), holding: true } : s;
      // Loslassen: sofort Rückfrage
      return s.phase === 'active' ? toPrompt({ ...s, holding: false }, e.now) : { ...s, holding: false };
    case 'answer':
      if (s.phase !== 'call') return s;
      return e.ok ? toActive(s, e.now) : { ...s, phase: 'contact', deadline: null, reason: 'not_ok' };
    case 'help':
      return { ...s, phase: 'contact', deadline: null, reason: 'not_ok' };
    case 'emergency':
      return { ...s, phase: 'emergency', deadline: null };
    case 'cancelAlarm':
      return { ...toActive(s, e.now), holding: false };
  }
}
