// Einstellungen der App mit Standardwerten. Gespeichert wird nur auf dem Gerät.

import type { ParkAvoidance } from './safety';

export type EscortMode = 'hold' | 'interval';

export interface EscortSettings {
  mode: EscortMode;
  /** „Regelmäßig bestätigen“: alle wie viele Sekunden */
  intervalSec: number;
  /** Zeit zum Antworten auf die Rückfrage und auf den simulierten Anruf */
  responseSec: number;
  /** Wie oft der simulierte Anruf es versucht, bevor Kontakte benachrichtigt werden */
  callAttempts: number;
}

export interface Settings {
  /** 0 = egal, 1 = leicht, 2 = normal, 3 = stark meiden */
  parkAvoidance: ParkAvoidance;
  /** Optionaler Zugangsschlüssel für Straßenfotos von Mapillary */
  mapillaryToken: string;
  /** Stimme im simulierten Anruf: automatisch, nur Gerätestimme oder nur Aufnahme */
  voice: 'auto' | 'device' | 'recording';
  escort: EscortSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  parkAvoidance: 2,
  mapillaryToken: '',
  voice: 'auto',
  escort: { mode: 'interval', intervalSec: 60, responseSec: 20, callAttempts: 1 },
};

export function withDefaults(s: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...s, escort: { ...DEFAULT_SETTINGS.escort, ...s?.escort } };
}
