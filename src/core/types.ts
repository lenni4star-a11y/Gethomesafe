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
} as const;

export type LitState = 'yes' | 'no' | 'unknown';

export type PoiCategory = 'police' | 'hospital' | 'fuel' | 'shop' | 'bar' | 'food' | 'culture' | 'pharmacy' | 'hotel';

export interface Poi {
  id: string;
  cat: PoiCategory;
  name: string | null;
  /** OSM opening_hours, null = unbekannt */
  oh: string | null;
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
  /** Durchgangs-Bezirk: Routen dürfen durchführen, Start/Ziel nicht */
  transit?: boolean;
  file: string;
  bytes: number;
  bbox: [number, number, number, number];
  outline: LngLat[];
}

export interface DataIndex {
  generated: string;
  attribution: string[];
  bezirke: DistrictInfo[];
}

export interface Stop {
  id: string;
  name: string;
  type: 'ubahn' | 'sbahn' | 'tram' | 'bus';
  lines: string[];
  night: boolean;
  bezirk: number;
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
  /** woher die Beleuchtungsinfo stammt */
  litSource: 'osm' | 'stadt' | 'none';
  flags: number;
  /** Punkte von a nach b, inklusive Endpunkte */
  coords: LngLat[];
  pois: string[];
}
