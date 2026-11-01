import OpeningHours from 'opening_hours';
import type { Poi } from './types';

// Feiertage in Wien berücksichtigen
const NOMINATIM = { lat: 48.2, lon: 16.37, address: { country_code: 'at', state: 'Wien' } };

const cache = new Map<string, OpeningHours | null>();

function parse(oh: string): OpeningHours | null {
  if (!cache.has(oh)) {
    try {
      cache.set(oh, new OpeningHours(oh, NOMINATIM as never));
    } catch {
      cache.set(oh, null);
    }
  }
  return cache.get(oh)!;
}

export type OpenState = 'open' | 'closed' | 'unknown';

/** Ist der Ort zur gegebenen Zeit geöffnet? Fehlen Öffnungszeiten, ist das Ergebnis „unknown“. */
export function openState(poi: Poi, date: Date): OpenState {
  if (!poi.oh) {
    // Polizeiinspektionen und Notaufnahmen sind in Wien rund um die Uhr besetzt.
    if (poi.cat === 'police' || poi.cat === 'hospital') return 'open';
    return 'unknown';
  }
  const oh = parse(poi.oh);
  if (!oh) return 'unknown';
  try {
    if (oh.getUnknown(date)) return 'unknown';
    return oh.getState(date) ? 'open' : 'closed';
  } catch {
    return 'unknown';
  }
}

/** Wann schließt der Ort als Nächstes? null = unbekannt oder durchgehend */
export function closesAt(poi: Poi, date: Date): Date | null {
  if (!poi.oh) return null;
  const oh = parse(poi.oh);
  if (!oh) return null;
  try {
    const next = oh.getNextChange(date);
    if (!next || next.getTime() - date.getTime() > 24 * 3600 * 1000) return null;
    return next;
  } catch {
    return null;
  }
}

/** Öffnungszeit eines öffentlichen WCs der Stadt Wien („06:00-22:00 Uhr“, „00:00-24:00 Uhr“) */
export function simpleHoursState(hours: string | null, date: Date): OpenState {
  const m = hours?.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return 'unknown';
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  const now = date.getHours() * 60 + date.getMinutes();
  if (from === 0 && to >= 24 * 60) return 'open';
  const open = from <= to ? now >= from && now < to : now >= from || now < to;
  return open ? 'open' : 'closed';
}
