// Amtliche Zonen (Waffenverbots-, Schutz- und Alkoholverbotszonen) und gemeldete Vorfälle (Medien-/Polizeiberichte).
// Kommen aus public/data/zonen.json (von Hand gepflegt, jede Zeile mit Quelle) und werden zur Laufzeit
// auf die Wegstücke gelegt – so können neue Einträge ohne kompletten Datenbau dazukommen.
// Grundsatz: nur Ort und Situation beschreiben, nie Gruppen von Menschen.

import { distance } from './geo';
import type { Edge, LngLat } from './types';

export type ZoneKind = 'waffenverbot' | 'schutzzone' | 'alkoholverbot' | 'vorfall';

export interface Zone {
  id: string;
  kind: ZoneKind;
  /** Ortsname, z. B. „Westbahnhof“ */
  name: string;
  at: LngLat;
  /** Radius in Metern (ungefähre Fläche) */
  r: number;
  /** gültig ab/bis (JJJJ-MM-TT), bei amtlichen Zonen */
  from?: string;
  until?: string;
  /** Tag des Vorfalls (JJJJ-MM-TT), bei Vorfällen */
  date?: string;
  /** kurze, neutrale Beschreibung des Vorfalls, z. B. „Raub“ */
  what?: string;
  /** Quelle (z. B. „Landespolizeidirektion Wien“, „wien.ORF.at“) und Link */
  source: string;
  url: string;
}

export interface ZoneFile {
  version: 1;
  updated: string;
  zones: Zone[];
}

/** Stufen wie beim Kantenfeld crime (1 leicht … 3 stark) */
export const ZONE_LEVEL: Record<Exclude<ZoneKind, 'vorfall'>, number> = { waffenverbot: 3, schutzzone: 2, alkoholverbot: 1 };

/** Vorfälle zählen ein halbes Jahr voll, danach immer weniger, nach zwei Jahren gar nicht mehr */
export const INCIDENT_FULL_DAYS = 183;
export const INCIDENT_MAX_DAYS = 730;

const day = (s: string) => new Date(s + 'T00:00:00').getTime();

/** Gewicht 0–1 eines Eintrags zum gewählten Zeitpunkt (amtliche Zone: 1 wenn gültig, sonst 0) */
export function zoneWeight(z: Zone, date: Date): number {
  const t = date.getTime();
  if (z.kind === 'vorfall') {
    if (!z.date) return 0;
    const age = (t - day(z.date)) / 86400000;
    if (age < 0 || age > INCIDENT_MAX_DAYS) return 0;
    if (age <= INCIDENT_FULL_DAYS) return 1;
    return 1 - (age - INCIDENT_FULL_DAYS) / (INCIDENT_MAX_DAYS - INCIDENT_FULL_DAYS);
  }
  if (z.from && t < day(z.from)) return 0;
  if (z.until && t >= day(z.until) + 86400000) return 0;
  return 1;
}

export interface EdgeZones {
  /** höchste Stufe einer gültigen amtlichen Zone (0 = keine) */
  level: number;
  /** Summe der Vorfall-Gewichte in der Nähe */
  incidents: number;
  zones: Zone[];
}

const NONE: EdgeZones = { level: 0, incidents: 0, zones: [] };

/** Findet zu einem Wegstück die gültigen Zonen und Vorfälle (Mittelpunkt im Radius), mit Zwischenspeicher */
export class ZoneLookup {
  private memo = new Map<number, EdgeZones>();
  private active: { z: Zone; w: number }[];

  constructor(zones: Zone[], date: Date) {
    this.active = zones.map((z) => ({ z, w: zoneWeight(z, date) })).filter((x) => x.w > 0);
  }

  get size(): number {
    return this.active.length;
  }

  at(e: Edge): EdgeZones {
    if (!this.active.length) return NONE;
    let r = this.memo.get(e.id);
    if (r) return r;
    const mid = e.coords[Math.floor(e.coords.length / 2)];
    r = NONE;
    for (const { z, w } of this.active) {
      if (distance(mid, z.at) > z.r) continue;
      if (r === NONE) r = { level: 0, incidents: 0, zones: [] };
      r.zones.push(z);
      if (z.kind === 'vorfall') r.incidents += w;
      else r.level = Math.max(r.level, ZONE_LEVEL[z.kind]);
    }
    this.memo.set(e.id, r);
    return r;
  }
}

/** Text für die Begründung, z. B. „Schutzzone der Polizei (Fritz-Imhoff-Park)“ */
export function zoneLabel(z: Zone): string {
  switch (z.kind) {
    case 'waffenverbot':
      return `Waffenverbotszone der Polizei (${z.name})`;
    case 'schutzzone':
      return `Schutzzone der Polizei (${z.name})`;
    case 'alkoholverbot':
      return `Alkoholverbotszone (${z.name})`;
    case 'vorfall':
      return `Bericht über ${z.what ?? 'einen Vorfall'} in der Nähe (${z.name}, ${monthYear(z.date)})`;
  }
}

const MONTHS = ['Jän.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
function monthYear(d?: string): string {
  if (!d) return '';
  const [y, m] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
