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
  /** Rückfrage, wenn ich von der Route abkomme oder lange stehen bleibe */
  watchRoute: boolean;
  /** so weit (m) neben der Route … */
  offRouteMeters: number;
  /** … so lange (s), dann Rückfrage */
  offRouteSec: number;
  /** so lange (min) ohne Bewegung, dann Rückfrage (nicht an Haltestellen) */
  stillMinutes: number;
  /** in diesem Umkreis (m) ums Ziel fragt die App „Bist du angekommen?“ */
  arrivalMeters: number;
}

export interface Settings {
  /** 0 = egal, 1 = leicht, 2 = normal, 3 = stark meiden */
  parkAvoidance: ParkAvoidance;
  /** Optionaler Zugangsschlüssel für Straßenfotos von Mapillary */
  mapillaryToken: string;
  /** Stimme im simulierten Anruf: automatisch, nur Gerätestimme oder nur Aufnahme */
  voice: 'auto' | 'device' | 'recording';
  /** Zuhause auf der Karte als neutrales Symbol zeigen */
  showHomeOnMap: boolean;
  /** Prüfwert der Täuschungs-PIN (nie im Klartext), null = keine */
  /** eine PIN für die ganze App (nur als Prüfwert) */
  appPinHash: string | null;
  decoyPinHash: string | null;
  /** amtliche Kriminalitätsdaten (Berlin: Kriminalitätsatlas, kriminalitätsbelastete Orte) als kleinen Abzug berücksichtigen */
  crimeData: boolean;
  escort: EscortSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  parkAvoidance: 2,
  mapillaryToken: '',
  voice: 'auto',
  showHomeOnMap: true,
  appPinHash: null,
  decoyPinHash: null,
  crimeData: true,
  escort: { mode: 'interval', intervalSec: 60, responseSec: 20, callAttempts: 1, watchRoute: true, offRouteMeters: 75, offRouteSec: 30, stillMinutes: 3, arrivalMeters: 50 },
};

export function withDefaults(s: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...s, escort: { ...DEFAULT_SETTINGS.escort, ...s?.escort } };
}
