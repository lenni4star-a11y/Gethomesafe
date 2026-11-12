// Linien-Symbole (SVG-Pfade, 24er-Raster) für Orte und Haltestellen – gemeinsam für Karte und Listen, keine Emojis.

export const PLACE_ICON: Record<string, string> = {
  people: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5M14.5 14.2c2.6-.5 4.9.9 5.8 3.8"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>',
  cross: '<path d="M12 5v14M5 12h14"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  tram: '<rect x="6" y="4" width="12" height="13" rx="3"/><path d="M6 11h12M9 20l1.5-3M15 20l-1.5-3"/>',
  star: '<path d="m12 4 2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.9l-4.6 2.4.9-5.2-3.8-3.6 5.2-.7z"/>',
  alarm: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14M12 3v2M4.2 6.2l1.4 1.4M19.8 6.2l-1.4 1.4"/>',
};

/** Ortsart → Symbol: Leute = belebte Lokale, Schild = Polizei, Kreuz = Hilfe, Tasche = Geschäft, Tram = Station */
export const ICON_FOR: Record<string, string> = {
  bar: 'people',
  food: 'people',
  culture: 'people',
  hotel: 'star',
  police: 'shield',
  hospital: 'cross',
  pharmacy: 'cross',
  shop: 'bag',
  fuel: 'bag',
  transit: 'tram',
};

export const svgIcon = (name: string, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PLACE_ICON[name] ?? PLACE_ICON.star}</svg>`;
