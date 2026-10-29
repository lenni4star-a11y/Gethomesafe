import type { LngLat } from './types';

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Richtung in Grad (0 = Norden, im Uhrzeigersinn) */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Winkeldifferenz von a nach b in Grad, -180 … 180 (positiv = rechts) */
export function turnAngle(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

export function lineLength(coords: LngLat[]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += distance(coords[i - 1], coords[i]);
  return s;
}

/** Punkt in einer bestimmten Entfernung entlang einer Linie */
export function along(coords: LngLat[], meters: number): LngLat {
  let rest = meters;
  for (let i = 1; i < coords.length; i++) {
    const d = distance(coords[i - 1], coords[i]);
    if (rest <= d && d > 0) {
      const f = rest / d;
      return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f];
    }
    rest -= d;
  }
  return coords[coords.length - 1];
}

export function bboxIntersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rechteck um einen Punkt, in Metern erweitert */
export function bboxAround(points: LngLat[], padMeters: number): [number, number, number, number] {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const dLat = padMeters / 110540;
  const dLon = padMeters / (111320 * Math.cos(rad(lats[0])));
  return [Math.min(...lons) - dLon, Math.min(...lats) - dLat, Math.max(...lons) + dLon, Math.max(...lats) + dLat];
}
