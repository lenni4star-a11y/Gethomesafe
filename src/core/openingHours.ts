import OpeningHours from 'opening_hours';
import type { Poi } from './types';

// Feiertage („PH“ in Öffnungszeiten) je Stadt: Österreich, Deutschland, Schweiz unterscheiden sich
const REGIONS: Record<string, { lat: number; lon: number; address: { country_code: string; state: string } }> = {
  wien: { lat: 48.2, lon: 16.37, address: { country_code: 'at', state: 'Wien' } },
  linz: { lat: 48.3, lon: 14.29, address: { country_code: 'at', state: 'Oberösterreich' } },
  berlin: { lat: 52.52, lon: 13.4, address: { country_code: 'de', state: 'Berlin' } },
  zuerich: { lat: 47.37, lon: 8.54, address: { country_code: 'ch', state: 'Zürich' } },
  frankfurt: { lat: 50.11, lon: 8.68, address: { country_code: 'de', state: 'Hessen' } },
  koeln: { lat: 50.94, lon: 6.96, address: { country_code: 'de', state: 'Nordrhein-Westfalen' } },
  muenchen: { lat: 48.14, lon: 11.58, address: { country_code: 'de', state: 'Bayern' } },
};
let region = 'wien';

/** Stadt für die Feiertage festlegen (macht der Planer vor jeder Route) */
export function setHolidayRegion(city: string) {
  region = REGIONS[city] ? city : 'wien';
}

const cache = new Map<string, OpeningHours | null>();

function parse(oh: string): OpeningHours | null {
  const key = `${region}|${oh}`;
  if (!cache.has(key)) {
    let value: OpeningHours | null = null;
    for (const r of [region, 'wien']) {
      try {
        value = new OpeningHours(oh, REGIONS[r] as never);
        break;
      } catch {
        value = null;
      }
    }
    cache.set(key, value);
  }
  return cache.get(key)!;
}

export type OpenState = 'open' | 'closed' | 'unknown';

/** Ist der Ort zur gegebenen Zeit geöffnet? Fehlen Öffnungszeiten, ist das Ergebnis „unknown“. */
export function openState(poi: Poi, date: Date): OpenState {
  if (!poi.oh) {
    // Polizeiinspektionen und Notaufnahmen sind rund um die Uhr besetzt (in Wien geprüft; Berliner Polizeiabschnitte ebenso).
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
