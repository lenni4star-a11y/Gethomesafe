// Stiller Alarm nach Eingabe der Täuschungs-PIN.
//
// Ehrlich: Ohne Server kann eine Web-App nichts unbemerkt verschicken. SMS und WhatsApp lassen sich nur
// vorbereiten, Absenden muss man selbst (und das wäre sichtbar). Deshalb passiert hier im Prototyp nichts
// nach außen. Mit einem Server (Block 4, Live-Standort) würde an dieser Stelle der Server die Notfallkontakte
// benachrichtigen und einen Live-Standort-Link schicken.

import type { Contact } from '../core/contacts';
import type { LngLat } from '../core/types';

export interface SilentAlarm {
  contacts: Contact[];
  position: { coords: LngLat; time: number } | null;
}

/** Gibt zurück, ob der Alarm wirklich verschickt werden konnte (im Prototyp: nie) */
export async function triggerSilentAlarm(_alarm: SilentAlarm): Promise<boolean> {
  // Platzhalter für Block 4 (Server): POST an den Alarm-Dienst
  return false;
}

/** Im Prototyp gibt es keinen Server: die Täuschungs-PIN kann Kontakte noch nicht benachrichtigen */
export const SILENT_ALARM_AVAILABLE = false;
