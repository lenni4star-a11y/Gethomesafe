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
