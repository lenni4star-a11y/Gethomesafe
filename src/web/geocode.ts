// Adresssuche: zuerst Öffi-Haltestellen aus den eigenen Daten, dann Photon
// (freier Suchdienst auf Basis von OpenStreetMap, betrieben von komoot; faire Nutzung, kein Account).

import type { LngLat, Stop } from '../core/types';
import { getStops } from './data';

export interface Place {
  label: string;
  detail?: string;
  coords: LngLat;
  kind: 'stop' | 'address' | 'location' | 'map' | 'home' | 'favorite';
}

const STOP_LABEL: Record<Stop['type'], string> = { ubahn: 'U-Bahn', sbahn: 'S-Bahn', tram: 'Straßenbahn', bus: 'Bus' };

const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export async function searchStops(q: string): Promise<Place[]> {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const stops = await getStops();
  return stops
    .filter((s) => norm(s.name).includes(n))
    .sort((a, b) => Number(!norm(a.name).startsWith(n)) - Number(!norm(b.name).startsWith(n)) || a.type.localeCompare(b.type))
    .slice(0, 4)
    .map((s) => ({
      label: s.name,
      detail: `${STOP_LABEL[s.type]} · ${s.lines.slice(0, 6).join(', ')}${s.lines.length > 6 ? ' …' : ''}`,
      coords: [s.lon, s.lat] as LngLat,
      kind: 'stop' as const,
    }));
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
