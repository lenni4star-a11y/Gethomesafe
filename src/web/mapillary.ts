// Straßenfotos von Mapillary (frei, Fotos unter CC BY-SA 4.0).
// Der Zugangsschlüssel kommt aus .env (VITE_MAPILLARY_TOKEN, beim Veröffentlichen aus einem GitHub-Secret)
// oder optional aus den Einstellungen.

import { along, bearing, distance, lineLength, turnAngle } from '../core/geo';
import type { LngLat } from '../core/types';

export const BUILT_IN_TOKEN = (import.meta.env.VITE_MAPILLARY_TOKEN ?? '').trim();

/** Eigener Schlüssel aus den Einstellungen hat Vorrang, sonst der eingebaute */
export const mapillaryToken = (fromSettings: string) => fromSettings.trim() || BUILT_IN_TOKEN;

export class MapillaryError extends Error {
  constructor(readonly kind: 'token' | 'limit' | 'network') {
    super(kind);
  }
}

export function mapillaryErrorText(e: unknown): string {
  const kind = e instanceof MapillaryError ? e.kind : 'network';
  if (kind === 'token') return 'Die Straßenfotos sind gerade nicht verfügbar (Zugangsschlüssel ungültig).';
  if (kind === 'limit') return 'Mapillary hat gerade zu viele Anfragen. Bitte in ein paar Minuten nochmal versuchen.';
  return 'Die Straßenfotos konnten gerade nicht geladen werden. Bitte Internetverbindung prüfen.';
}

export interface Photo {
  id: string;
  url: string;
  coords: LngLat;
  capturedAt: number;
  /** Blickrichtung der Kamera in Grad */
  compass: number | null;
  /** zwischen 19 und 6 Uhr (Wiener Zeit) aufgenommen */
  night: boolean;
  creator: string | null;
}

interface ApiImage {
  id: string;
  thumb_1024_url?: string;
  computed_geometry?: { coordinates: LngLat };
  geometry?: { coordinates: LngLat };
  captured_at?: number;
  computed_compass_angle?: number;
  compass_angle?: number;
  creator?: { username?: string };
}

const FIELDS = 'id,thumb_1024_url,computed_geometry,geometry,captured_at,computed_compass_angle,compass_angle,creator';

function viennaHour(ms: number): number {
  return Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Vienna' }));
}

function toPhoto(img: ApiImage): Photo | null {
  const c = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
  if (!c || !img.thumb_1024_url) return null;
  const t = img.captured_at ?? 0;
  const h = t ? viennaHour(t) : 12;
  return {
    id: img.id,
    url: img.thumb_1024_url,
    coords: c,
    capturedAt: t,
    compass: img.computed_compass_angle ?? img.compass_angle ?? null,
    night: h >= 19 || h < 6,
    creator: img.creator?.username ?? null,
  };
}

async function query(bbox: number[], token: string, signal?: AbortSignal, limit = 200): Promise<Photo[]> {
  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', token);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('bbox', bbox.map((v) => v.toFixed(6)).join(','));
  url.searchParams.set('limit', String(limit));
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new MapillaryError('network');
  }
  if (res.status === 401 || res.status === 403 || res.status === 400) throw new MapillaryError('token');
  if (res.status === 429) throw new MapillaryError('limit');
  if (!res.ok) throw new MapillaryError('network');
  const data = await res.json();
  return (data.data ?? []).map(toPhoto).filter(Boolean) as Photo[];
}

/** Fotos im Umkreis eines Punkts, nächste zuerst */
export async function photosNear(p: LngLat, token: string, meters = 60, signal?: AbortSignal): Promise<Photo[]> {
  const dLat = meters / 110540;
  const dLon = meters / (111320 * Math.cos((p[1] * Math.PI) / 180));
  const list = await query([p[0] - dLon, p[1] - dLat, p[0] + dLon, p[1] + dLat], token, signal, 100);
  return list.sort((a, b) => distance(a.coords, p) - distance(b.coords, p));
}

// ---------------------------------------------------------------- Route als Spaziergang

export type WalkStep =
  | { type: 'photo'; offset: number; photo: Photo }
  /** Abschnitt ohne Fotos: dort Kamerafahrt über die Karte */
  | { type: 'gap'; offset: number; length: number; from: LngLat; to: LngLat };

export interface PhotoWalk {
  steps: WalkStep[];
  /** Anteil der Strecke mit Fotos (0–1) */
  coverage: number;
  nightShare: number;
}

const STEP = 25; // alle 25 m ein Bild suchen
const MAX_DIST = 20; // höchstens 20 m vom Weg
const CHUNK = 350; // Abfrage in Stücken von ca. 350 m
const GAP = 90; // ab 90 m ohne Foto gilt es als Lücke

export async function loadPhotoWalk(coords: LngLat[], token: string, signal?: AbortSignal): Promise<PhotoWalk> {
  const total = lineLength(coords);
  const samples: { offset: number; at: LngLat; heading: number }[] = [];
  for (let d = 0; d <= total; d += STEP) {
    const at = along(coords, d);
    samples.push({ offset: d, at, heading: bearing(at, along(coords, Math.min(total, d + 15))) });
  }

  const photos = new Map<string, Photo>();
  const per = Math.round(CHUNK / STEP);
  for (let i = 0; i < samples.length; i += per) {
    const part = samples.slice(i, i + per + 1);
    const pad = 0.00025;
    const bbox = [
      Math.min(...part.map((p) => p.at[0])) - pad,
      Math.min(...part.map((p) => p.at[1])) - pad,
      Math.max(...part.map((p) => p.at[0])) + pad,
      Math.max(...part.map((p) => p.at[1])) + pad,
    ];
    for (const p of await query(bbox, token, signal)) photos.set(p.id, p);
  }

  const used = new Set<string>();
  const steps: WalkStep[] = [];
  let lastPhotoOffset = 0;
  let lastAt = coords[0];
  let withPhoto = 0;
  let night = 0;
  for (const s of samples) {
    let best: Photo | null = null;
    let bestScore = Infinity;
    for (const p of photos.values()) {
      if (used.has(p.id)) continue;
      const d = distance(p.coords, s.at);
      if (d > MAX_DIST) continue;
      // Gehrichtung bevorzugen, Nachtfotos und neuere Fotos leicht bevorzugen
      const dir = p.compass === null ? 30 : Math.abs(turnAngle(s.heading, p.compass));
      const ageYears = p.capturedAt ? (Date.now() - p.capturedAt) / (365 * 864e5) : 10;
      const score = d + (dir > 100 ? 40 : dir / 6) - (p.night ? 8 : 0) + Math.min(10, ageYears);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) continue;
    used.add(best.id);
    if (s.offset - lastPhotoOffset > GAP) steps.push({ type: 'gap', offset: lastPhotoOffset, length: s.offset - lastPhotoOffset, from: lastAt, to: s.at });
    steps.push({ type: 'photo', offset: s.offset, photo: best });
    withPhoto++;
    if (best.night) night++;
    lastPhotoOffset = s.offset;
    lastAt = s.at;
  }
  if (steps.length && total - lastPhotoOffset > GAP) steps.push({ type: 'gap', offset: lastPhotoOffset, length: total - lastPhotoOffset, from: lastAt, to: coords[coords.length - 1] });

  return { steps, coverage: samples.length ? withPhoto / samples.length : 0, nightShare: withPhoto ? night / withPhoto : 0 };
}

/** Vektor-Kacheln mit den Orten, an denen es Fotos gibt */
export const coverageTiles = (token: string) => `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`;

export const photoPageUrl = (id: string) => `https://www.mapillary.com/app/?pKey=${id}&focus=photo`;
