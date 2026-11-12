// Adresssuche: zuerst Öffi-Haltestellen aus den eigenen Daten, dann Photon
// (freier Suchdienst auf Basis von OpenStreetMap, betrieben von komoot; faire Nutzung, kein Account).

import type { LngLat, Stop } from '../core/types';
import { getStops } from './data';

export interface Place {
  label: string;
  detail?: string;
  coords: LngLat;
  kind: 'stop' | 'venue' | 'address' | 'location' | 'map' | 'home' | 'favorite';
}

const STOP_LABEL: Record<Stop['type'], string> = { ubahn: 'U-Bahn', sbahn: 'S-Bahn', tram: 'Straßenbahn', bus: 'Bus' };

const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/** Haltestellen suchen; mit bbox nur in der gewählten Stadt (sonst gäbe es z. B. „Hauptbahnhof“ doppelt) */
export async function searchStops(q: string, bbox?: [number, number, number, number]): Promise<Place[]> {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const stops = await getStops();
  const inBox = (s: Stop) => !bbox || (s.lon >= bbox[0] - 0.02 && s.lon <= bbox[2] + 0.02 && s.lat >= bbox[1] - 0.02 && s.lat <= bbox[3] + 0.02);
  return stops
    .filter((s) => inBox(s) && norm(s.name).includes(n))
    .sort((a, b) => Number(!norm(a.name).startsWith(n)) - Number(!norm(b.name).startsWith(n)) || a.type.localeCompare(b.type))
    .slice(0, 4)
    .map((s) => ({
      label: s.name,
      detail: s.lines.length ? `${STOP_LABEL[s.type]} · ${s.lines.slice(0, 6).join(', ')}${s.lines.length > 6 ? ' …' : ''}` : `Haltestelle (${STOP_LABEL[s.type]})`,
      coords: [s.lon, s.lat] as LngLat,
      kind: 'stop' as const,
    }));
}

const VENUE_LABEL: Record<string, string> = {
  nightclub: 'Club',
  bar: 'Bar',
  pub: 'Kneipe',
  biergarten: 'Biergarten',
  restaurant: 'Restaurant',
  cafe: 'Café',
  fast_food: 'Imbiss',
  ice_cream: 'Eis',
  cinema: 'Kino',
  theatre: 'Theater',
  arts_centre: 'Kulturort',
  events_venue: 'Veranstaltungsort',
  casino: 'Casino',
  hotel: 'Hotel',
  hostel: 'Hostel',
};
const venueCache = new Map<string, Promise<[string, number, number, string, string][]>>();

/** Bars, Clubs, Restaurants usw. der Stadt nach Namen suchen (aus den eigenen Daten, ohne Online-Dienst) */
export async function searchVenues(q: string, city: string): Promise<Place[]> {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  let p = venueCache.get(city);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/orte-${city}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    venueCache.set(city, p);
  }
  const list = await p;
  // Clubs und Bars zuerst, dann Treffer am Wortanfang
  const rank = (kind: string) => (kind === 'nightclub' ? 0 : ['bar', 'pub', 'biergarten'].includes(kind) ? 1 : 2);
  return list
    .filter((v) => norm(v[0]).includes(n))
    .sort((a, b) => Number(!norm(a[0]).startsWith(n)) - Number(!norm(b[0]).startsWith(n)) || rank(a[3]) - rank(b[3]))
    .slice(0, 5)
    .map((v) => ({ label: v[0], detail: [VENUE_LABEL[v[3]] ?? 'Ort', v[4]].filter(Boolean).join(' · '), coords: [v[1], v[2]] as LngLat, kind: 'venue' as const }));
}

export async function searchAddress(q: string, bbox: [number, number, number, number], signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 3) return [];
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('lang', 'de');
  url.searchParams.set('limit', '6');
  url.searchParams.set('bbox', bbox.join(','));
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const label = p.name ?? (street || p.city);
    const detail = [p.name ? street : null, p.postcode, p.locality ?? p.district].filter(Boolean).join(', ');
    const key = label + detail;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, detail, coords: f.geometry.coordinates, kind: 'address' });
  }
  return out;
}
