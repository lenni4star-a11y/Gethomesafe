// Begleitmodus: Ablauf der Eskalation als reine Logik (ohne Oberfläche, ohne Timer).
// Die Oberfläche ruft regelmäßig `tick` auf und meldet Eingaben; hier wird nur entschieden, was als Nächstes passiert.
//
// Ablauf: aktiv → Rückfrage („Alles okay?“) → simulierter Anruf → Kontakte benachrichtigen → Notruf-Bildschirm.
// Es gibt keine automatische Alarmierung der Polizei.
//
// Zusätzlich (wenn eingeschaltet): Rückfrage, wenn man deutlich von der Route abkommt oder lange stehen bleibt,
// und die Frage „Bist du angekommen?“ in der Nähe des Ziels. Beendet wird immer nur mit PIN.

import { distance } from './geo';
import type { EscortSettings } from './settings';
import type { LngLat } from './types';

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
  /** warum gerade nachgefragt wird */
  promptReason: PromptReason | null;
  /** Überwachung von Position und Route */
  watch: WatchState;
  /** Ziel in Reichweite: App fragt „Bist du angekommen?“ (nur einmal, bis man sich wieder entfernt) */
  askArrival: boolean;
}

export type PromptReason = 'check' | 'offroute' | 'still';

export interface WatchState {
  /** seit wann neben der Route */
  offRouteSince: number | null;
  /** Abweichung bestätigt („alles okay, ich gehe bewusst anders“): keine neue Rückfrage, bis man wieder auf der Route ist */
  offRouteAcknowledged: boolean;
  /** Ort und Zeitpunkt, seit dem man sich kaum bewegt */
  stillAnchor: LngLat | null;
  stillSince: number | null;
  arrivalAsked: boolean;
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
  | { type: 'cancelAlarm'; now: number }
  /**
   * Neue Position. Die Oberfläche berechnet vorher, wie weit sie neben der Route liegt,
   * wie viel Weg noch bleibt und ob gerade eine Haltestelle in der Nähe ist.
   */
  | { type: 'position'; now: number; coords: LngLat; offRoute: number | null; remaining: number | null; atStop: boolean }
  /** Route wurde neu berechnet (bewusst anderer Weg) */
  | { type: 'rerouted'; now: number }
  /** „Noch nicht angekommen“ */
  | { type: 'notArrived'; now: number };

/** Ab so viel Bewegung (m) gilt man nicht mehr als „stehend“ */
export const STILL_RADIUS = 25;

/** Wie lange der simulierte Anruf klingelt, bevor er als „keine Antwort“ gilt */
export const callDuration = (s: EscortSettings) => Math.max(30, s.responseSec * 1.5) * 1000;

export function startEscort(settings: EscortSettings, now: number): EscortState {
  return {
    phase: 'active',
    settings,
    startedAt: now,
    lastOk: now,
    holding: false,
    deadline: null,
    callAttempt: 0,
    reason: null,
    promptReason: null,
    watch: { offRouteSince: null, offRouteAcknowledged: false, stillAnchor: null, stillSince: null, arrivalAsked: false },
    askArrival: false,
  };
}

function toPrompt(s: EscortState, now: number, reason: PromptReason = 'check'): EscortState {
  return { ...s, phase: 'prompt', promptReason: reason, deadline: now + s.settings.responseSec * 1000 };
}

/** Positions-Überwachung: Abweichung, Stillstand, Ankunft */
function onPosition(s: EscortState, e: Extract<EscortEvent, { type: 'position' }>): EscortState {
  const cfg = s.settings;
  // ältere gespeicherte Begleitungen haben noch keine Überwachung
  const w: WatchState = { ...(s.watch ?? { offRouteSince: null, offRouteAcknowledged: false, stillAnchor: null, stillSince: null, arrivalAsked: false }) };
  let next: EscortState = { ...s, watch: w };

  // Ankunft: in der Nähe des Ziels einmal fragen (gilt auch ohne Routen-Überwachung)
  if (e.remaining !== null) {
    const near = e.remaining <= (cfg.arrivalMeters ?? 50);
    if (near && !w.arrivalAsked && s.phase === 'active') {
      w.arrivalAsked = true;
      next.askArrival = true;
    } else if (!near && e.remaining > (cfg.arrivalMeters ?? 50) * 3) {
      w.arrivalAsked = false;
      next.askArrival = false;
    }
  }

  if (!cfg.watchRoute) return next;

  // Stillstand
  if (!w.stillAnchor || distance(w.stillAnchor, e.coords) > STILL_RADIUS) {
    w.stillAnchor = e.coords;
    w.stillSince = e.now;
  }

  // Abweichung von der Route
  const off = e.offRoute !== null && e.offRoute > cfg.offRouteMeters;
  if (!off) {
    w.offRouteSince = null;
    w.offRouteAcknowledged = false;
  } else if (w.offRouteSince === null) w.offRouteSince = e.now;

  if (s.phase !== 'active' || next.askArrival) return next;

  if (off && !w.offRouteAcknowledged && w.offRouteSince !== null && e.now - w.offRouteSince >= cfg.offRouteSec * 1000) {
    w.offRouteAcknowledged = true;
    return toPrompt(next, e.now, 'offroute');
  }
  if (!e.atStop && w.stillSince !== null && e.now - w.stillSince >= cfg.stillMinutes * 60000) {
    w.stillSince = e.now; // nach der Rückfrage wieder von vorn zählen
    return toPrompt(next, e.now, 'still');
  }
  return next;
}

function toCall(s: EscortState, now: number): EscortState {
  return { ...s, phase: 'call', callAttempt: s.callAttempt + 1, deadline: now + callDuration(s.settings) };
}

function toActive(s: EscortState, now: number): EscortState {
  return { ...s, phase: 'active', lastOk: now, deadline: null, callAttempt: 0, reason: null, promptReason: null };
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
    case 'position':
      return onPosition(s, e);
    case 'rerouted':
      return { ...s, watch: { ...s.watch, offRouteSince: null, offRouteAcknowledged: false } };
    case 'notArrived':
      return { ...s, askArrival: false };
  }
}

/** Welche PIN wurde beim Beenden eingegeben? Täuschungs-PIN beendet sichtbar normal, löst aber den stillen Alarm aus. */
export function classifyPin(enteredHash: string, realHash: string, decoyHash: string | null | undefined): 'real' | 'decoy' | null {
  if (enteredHash === realHash) return 'real';
  if (decoyHash && enteredHash === decoyHash) return 'decoy';
  return null;
}
