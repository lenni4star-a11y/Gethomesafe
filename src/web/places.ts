import type { Poi, PoiCategory } from '../core/types';

/** Symbol und Bezeichnung je Ortsart (für Liste und Karte) */
export const PLACE_META: Record<PoiCategory, { icon: string; label: string }> = {
  police: { icon: '👮', label: 'Polizei' },
  hospital: { icon: '🏥', label: 'Spital mit Notaufnahme' },
  fuel: { icon: '⛽', label: 'Tankstelle' },
  shop: { icon: '🛒', label: 'Geschäft' },
  bar: { icon: '🍸', label: 'Bar / Lokal' },
  food: { icon: '🍴', label: 'Lokal' },
  culture: { icon: '🎭', label: 'Kino / Theater' },
  pharmacy: { icon: '💊', label: 'Apotheke' },
  hotel: { icon: '🏨', label: 'Hotel' },
  transit: { icon: '🚇', label: 'Öffi-Station' },
};

const KIND_LABEL: Record<string, string> = {
  convenience: 'Späti / Nahversorger',
  kiosk: 'Kiosk',
  supermarket: 'Supermarkt',
  alcohol: 'Getränkehandel',
  beverages: 'Getränkehandel',
  bakery: 'Bäckerei',
  bar: 'Bar',
  pub: 'Beisl / Pub',
  nightclub: 'Club',
  biergarten: 'Gastgarten',
  restaurant: 'Restaurant',
  cafe: 'Café',
  fast_food: 'Imbiss',
  ice_cream: 'Eissalon',
  cinema: 'Kino',
  theatre: 'Theater',
  ubahn: 'U-Bahn',
  sbahn: 'S-Bahn',
  tram: 'Straßenbahn',
  bus: 'Bus',
  hostel: 'Hostel',
};

export function placeKindLabel(p: Poi): string {
  return (p.kind && KIND_LABEL[p.kind]) || PLACE_META[p.cat].label;
}

export function placeName(p: Poi): string {
  return p.name ?? placeKindLabel(p);
}

/** Reihenfolge für die Liste: Polizei zuerst, dann was nachts am meisten hilft */
export const PLACE_ORDER: PoiCategory[] = ['police', 'hospital', 'transit', 'fuel', 'shop', 'pharmacy', 'bar', 'food', 'culture', 'hotel'];
