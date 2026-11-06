// Kartenstil: „hell“ (bunt wie Google Maps, Standard) oder „dunkel“ (blendet nachts weniger).
// Beides freie Stile von OpenFreeMap (kein Account). Gespeichert nur im Gerät (localStorage).

export type MapStyleChoice = 'hell' | 'dunkel';

const KEY = 'goodway.mapStyle';
const URLS: Record<MapStyleChoice, string> = {
  hell: 'https://tiles.openfreemap.org/styles/liberty',
  dunkel: 'https://tiles.openfreemap.org/styles/dark',
};

export function getMapStyle(): MapStyleChoice {
  try {
    return localStorage.getItem(KEY) === 'dunkel' ? 'dunkel' : 'hell';
  } catch {
    return 'hell';
  }
}

export function setMapStyle(choice: MapStyleChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* privat-Modus: dann gilt der Standard */
  }
}

export function mapStyleUrl(): string {
  return URLS[getMapStyle()];
}
