// Straßenfotos von Mapillary entlang einer Route.
// Braucht einen (kostenlosen) Zugangsschlüssel, der in den Einstellungen eingetragen wird.

import { along, distance, lineLength } from '../core/geo';
import type { LngLat } from '../core/types';

export interface PhotoFrame {
  /** Abstand vom Start in Metern */
  offset: number;
  at: LngLat;
  imageId: string;
  url: string;
  capturedAt: number;
}

export interface PhotoRoute {
  frames: PhotoFrame[];
  /** Anteil der Strecke mit Fotos (0–1) */
  coverage: number;
}

const STEP = 30; // alle 30 m ein Bild suchen
const MAX_DIST = 25; // Bild höchstens 25 m vom Weg entfernt
const CHUNK = 400; // Abfrage in Stücken von ca. 400 m

interface ApiImage {
  id: string;
  thumb_1024_url?: string;
  computed_geometry?: { coordinates: LngLat };
  geometry?: { coordinates: LngLat };
  captured_at?: number;
}

export async function loadPhotoRoute(coords: LngLat[], token: string, signal?: AbortSignal): Promise<PhotoRoute> {
  const total = lineLength(coords);
  const samples: { offset: number; at: LngLat }[] = [];
  for (let d = 0; d <= total; d += STEP) samples.push({ offset: d, at: along(coords, d) });

  const images: ApiImage[] = [];
  for (let start = 0; start < samples.length; start += Math.round(CHUNK / STEP)) {
    const part = samples.slice(start, start + Math.round(CHUNK / STEP) + 1);
    const pad = 0.0003;
    const bbox = [
      Math.min(...part.map((p) => p.at[0])) - pad,
      Math.min(...part.map((p) => p.at[1])) - pad,
      Math.max(...part.map((p) => p.at[0])) + pad,
      Math.max(...part.map((p) => p.at[1])) + pad,
    ];
    const url = new URL('https://graph.mapillary.com/images');
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', 'id,thumb_1024_url,computed_geometry,geometry,captured_at');
    url.searchParams.set('bbox', bbox.map((v) => v.toFixed(6)).join(','));
    url.searchParams.set('limit', '200');
    const res = await fetch(url, { signal });
    if (res.status === 401 || res.status === 403) throw new Error('token');
    if (!res.ok) continue;
    const data = await res.json();
    images.push(...(data.data ?? []));
  }

  const used = new Set<string>();
  const frames: PhotoFrame[] = [];
  for (const s of samples) {
    let best: ApiImage | null = null;
    let bestD = MAX_DIST;
    for (const img of images) {
      const c = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
      if (!c || !img.thumb_1024_url || used.has(img.id)) continue;
      const d = distance(c, s.at);
      // neuere Bilder leicht bevorzugen
      const score = d - Math.min(5, ((img.captured_at ?? 0) - Date.now()) / (365 * 864e5) + 5);
      if (score < bestD) {
        bestD = score;
        best = img;
      }
    }
    if (best) {
      used.add(best.id);
      frames.push({ offset: s.offset, at: s.at, imageId: best.id, url: best.thumb_1024_url!, capturedAt: best.captured_at ?? 0 });
    }
  }
  return { frames, coverage: samples.length ? frames.length / samples.length : 0 };
}
