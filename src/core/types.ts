// Gemeinsame Datentypen. Dieser Ordner (src/core) enthält nur Logik ohne
// Browser-Oberfläche, damit er später in der nativen App wiederverwendet werden kann.

export type LngLat = [number, number];

/** Weg-Art, Reihenfolge wie in scripts/build-data.mjs (KIND) */
export enum WayKind {
  Main = 0,
  Residential = 1,
  Service = 2,
  Pedestrian = 3,
  Footway = 4,
  Track = 5,
  Steps = 6,
}

/** Bits, wie in scripts/build-data.mjs (F) */
export const Flag = {
  Park: 1,
  Tunnel: 2,
  Bridge: 4,
  Crossing: 8,
  Passage: 16,
  NoSidewalk: 32,
  /** Weg direkt neben einem Park */
  ParkNear: 64,
} as const;

export type LitState = 'yes' | 'no' | 'unknown';

export type PoiCategory = 'police' | 'hospital' | 'fuel' | 'shop' | 'bar' | 'food' | 'culture' | 'pharmacy' | 'hotel' | 'transit';

export interface Poi {
  id: string;
  cat: PoiCategory;
  name: string | null;
  /** OSM opening_hours, null = unbekannt */
  oh: string | null;
  /** genauere Art laut OSM (z. B. convenience, bar) bzw. Verkehrsmittel bei Stationen */
  kind?: string | null;
  /** 'stadt' = aus den Daten der Stadt Wien (sonst OpenStreetMap) */
  source?: string;
  lon: number;
  lat: number;
}

/** Eine Kante so, wie sie in bezirk-XX.json steht */
export type RawEdge = [
  a: number,
  b: number,
  length: number,
  kind: WayKind,
  nameIdx: number,
  osmLit: 1 | 0 | -1,
  lampCoverage: number,
  flags: number,
  geom: number[],
  pois: string[],
  /** Anteil (0–100) in der Nähe einer auf Mapillary-Fotos erkannten Laterne (ab Datenstand Nov. 2026) */
  mlyCoverage?: number,
  /** IDs von Baustellen in der Nähe (siehe extras.json) */
  works?: string[],
  /** Geschäfte/Lokale im Erdgeschoss direkt am Weg, pro 100 m (unabhängig von Öffnungszeiten; ab Datenstand Nov. 2026) */
  frontage?: number,
  /** Öffnungszeiten des Parks, in dem der Weg liegt (z. B. nachts zugesperrt); fehlt = immer offen */
  parkHours?: string,
];

export interface DistrictFile {
  bezirk: number;
  /** flach: osmId, lon*1e5, lat*1e5, … */
  nodes: number[];
  names: string[];
  edges: RawEdge[];
  pois: Poi[];
}

export interface DistrictInfo {
  nr: number;
  name: string;
  /** Stadt ('wien', 'linz'); ältere Daten ohne Feld = Wien */
  city?: string;
  /** Durchgangs-Bezirk: Routen dürfen durchführen, Start/Ziel nicht */
  transit?: boolean;
  file: string;
  bytes: number;
  bbox: [number, number, number, number];
  outline: LngLat[];
}

/** Eine Stadt im Datenbestand */
export interface CityInfo {
  id: string;
  name: string;
  /** Öffi-Fahrplan vorhanden? */
  transit: boolean;
  /** Leuchtenstandorte der Stadt vorhanden? */
  lamps: boolean;
  bbox: [number, number, number, number];
}

export interface DataIndex {
  generated: string;
  attribution: string[];
  /** ab Datenstand Nov. 2026; fehlt bei älteren Daten (dann nur Wien) */
  cities?: CityInfo[];
  bezirke: DistrictInfo[];
}

/** Stadt eines Bezirks (ältere Daten ohne Feld = Wien) */
export const cityOf = (b: { city?: string }) => b.city ?? 'wien';

export interface Stop {
  id: string;
  name: string;
  type: 'ubahn' | 'sbahn' | 'tram' | 'bus';
  lines: string[];
  night: boolean;
  bezirk: number;
  city?: string;
  lon: number;
  lat: number;
}

/** Kante im Graphen (nach dem Laden) */
export interface Edge {
  id: number;
  a: number;
  b: number;
  length: number;
  kind: WayKind;
  name: string;
  lit: LitState;
  /** Anteil der Kante in der Nähe einer Leuchte laut Stadt Wien (0–1) */
  lampCoverage: number;
  /** woher die Beleuchtungsinfo stammt: OpenStreetMap, Leuchtenstandorte der Stadt Wien, auf Mapillary-Fotos erkannte Laternen */
  litSource: 'osm' | 'stadt' | 'mapillary' | 'none';
  /** Anteil der Kante in der Nähe einer auf Mapillary-Fotos erkannten Laterne (0–1) */
  mlyCoverage: number;
  /** Baustellen in der Nähe (IDs) */
  works: string[];
  /** Geschäfte/Lokale im Erdgeschoss pro 100 m („Geschäftsstraße“), 0 wenn unbekannt */
  frontage?: number;
  /** Öffnungszeiten des Parks (OSM opening_hours), außerhalb davon ist der Weg gesperrt */
  parkHours?: string;
  flags: number;
  /** Punkte von a nach b, inklusive Endpunkte */
  coords: LngLat[];
  pois: string[];
}

/** Zusatzdaten der Stadt Wien (extras.json) */
export interface TaxiStand {
  lon: number;
  lat: number;
  address: string;
  spaces: number | null;
}

export interface PublicToilet {
  lon: number;
  lat: number;
  name: string;
  /** z. B. „00:00-24:00 Uhr“, „06:00-22:00 Uhr“ oder „Lokalöffnungszeiten“ */
  hours: string | null;
  note: string | null;
  accessible: boolean;
}

export interface Roadworks {
  id: string;
  title: string;
  kind: string | null;
  /** JJJJ-MM-TT */
  from: string | null;
  to: string | null;
  coords: LngLat[];
}

export interface Extras {
  generated: string;
  taxi: TaxiStand[];
  wc: PublicToilet[];
  works: Roadworks[];
}
