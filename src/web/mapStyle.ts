// Kartenstil: „automatisch“ (Standard: tagsüber hell, nach Sonnenuntergang dunkel), „hell“ (bunt wie Google Maps)
// oder „dunkel“ (blendet nachts weniger). Freie Stile von OpenFreeMap (kein Account). Gespeichert nur im Gerät (localStorage).

import { isDark } from '../core/sun';

export type MapStyleChoice = 'auto' | 'hell' | 'dunkel';

const KEY = 'goodway.mapStyle.v2'; // neu ab Nov. 2026: alle starten mit „automatisch“
const CENTER_KEY = 'goodway.cityCenter';
const URLS = {
  hell: 'https://tiles.openfreemap.org/styles/liberty',
  dunkel: 'https://tiles.openfreemap.org/styles/dark',
};

export function getMapStyle(): MapStyleChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dunkel' || v === 'hell' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setMapStyle(choice: MapStyleChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* privat-Modus: dann gilt der Standard */
  }
}

/** Mitte der gewählten Stadt merken, damit „automatisch“ beim nächsten Start den richtigen Sonnenuntergang nimmt */
export function rememberCityCenter(lat: number, lon: number): void {
  try {
    localStorage.setItem(CENTER_KEY, `${lat.toFixed(2)},${lon.toFixed(2)}`);
  } catch {
    /* egal */
  }
}

function cityCenter(): [number, number] {
  try {
    const [lat, lon] = (localStorage.getItem(CENTER_KEY) ?? '').split(',').map(Number);
    if (lat && lon) return [lat, lon];
  } catch {
    /* egal */
  }
  return [52.52, 13.4]; // Berlin
}

/** Ist es gerade dunkel (für den automatischen Kartenstil)? */
export function darkNow(date = new Date()): boolean {
  const [lat, lon] = cityCenter();
  return isDark(date, lat, lon);
}

export function mapStyleUrl(): string {
  const c = getMapStyle();
  if (c === 'auto') return darkNow() ? URLS.dunkel : URLS.hell;
  return URLS[c];
}
