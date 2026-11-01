// Vorbereitung für gemeinsame Bewertungen (Block 5) – noch ohne Server.
// Hier stehen die Regeln, nach denen geteilte Bewertungen später zusammengefasst würden:
// - erst ab mehreren verschiedenen Personen beeinflussen sie die Route (Schutz gegen Einzelne und Spam)
// - alte Bewertungen verlieren nach und nach Gewicht
// - pro Gerät zählt pro Wegstück und Zeitfenster nur eine Bewertung (die neueste)
// - Freitext wird nie geteilt; geteilt werden nur Wert, Gründe, Wochentag/Stunde und der Wegstück-Schlüssel

import type { EdgeRating } from './safety';
import type { Rating, Reason } from './ratings';

/** Was ein Gerät beim Teilen an den Server schicken würde (ohne Notiz, ohne genaue Koordinaten bei Wegstücken) */
export interface SharedRating {
  /** zufällige, wechselnde Geräte-Kennung (kein Account, nicht rückverfolgbar) */
  device: string;
  targetKey: string;
  score: Rating['score'];
  weekday: number;
  hour: number;
  reasons: Reason[];
  createdAt: string;
}

export const SHARING_RULES = {
  /** so viele verschiedene Geräte, bevor eine gemeinsame Einschätzung zählt */
  minDevices: 3,
  /** nach so vielen Tagen zählt eine Bewertung nur noch halb */
  halfLifeDays: 180,
  /** älter als das: gar nicht mehr */
  maxAgeDays: 730,
  /** höchstens so viele geteilte Bewertungen pro Gerät und Tag (Ratenbegrenzung) */
  maxPerDevicePerDay: 20,
};

export function toShared(r: Rating, device: string): SharedRating | null {
  if (r.target.type === 'place') return null; // freie Orte nicht teilen (zu genau, wenig nützlich)
  return { device, targetKey: `${r.target.type}:${r.target.key}`, score: r.score, weekday: r.weekday, hour: r.hour, reasons: r.reasons, createdAt: r.createdAt };
}

/** Ratenbegrenzung: welche Bewertungen eines Geräts angenommen würden */
export function acceptByRateLimit(list: SharedRating[]): SharedRating[] {
  const perDay = new Map<string, number>();
  const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted.filter((r) => {
    const key = `${r.device}|${r.createdAt.slice(0, 10)}`;
    const n = (perDay.get(key) ?? 0) + 1;
    perDay.set(key, n);
    return n <= SHARING_RULES.maxPerDevicePerDay;
  });
}

/** Gewicht einer Bewertung nach Alter */
export function ageWeight(createdAt: string, now: Date): number {
  const days = (now.getTime() - new Date(createdAt).getTime()) / 864e5;
  if (days > SHARING_RULES.maxAgeDays) return 0;
  return Math.pow(0.5, Math.max(0, days) / SHARING_RULES.halfLifeDays);
}

/**
 * Gemeinsame Einschätzung je Wegstück-Schlüssel. Nur wenn genug verschiedene Geräte bewertet haben.
 * `count` ist die gewichtete Anzahl (für die Stärke des Einflusses in safety.ts).
 */
export function aggregateShared(list: SharedRating[], now: Date): Map<string, EdgeRating> {
  // pro Gerät und Ziel nur die neueste Bewertung
  const latest = new Map<string, SharedRating>();
  for (const r of acceptByRateLimit(list)) {
    const k = `${r.device}|${r.targetKey}`;
    const prev = latest.get(k);
    if (!prev || prev.createdAt < r.createdAt) latest.set(k, r);
  }
  const byTarget = new Map<string, { sum: number; weight: number; devices: Set<string> }>();
  for (const r of latest.values()) {
    const w = ageWeight(r.createdAt, now);
    if (w <= 0) continue;
    const v = byTarget.get(r.targetKey) ?? { sum: 0, weight: 0, devices: new Set<string>() };
    v.sum += r.score * w;
    v.weight += w;
    v.devices.add(r.device);
    byTarget.set(r.targetKey, v);
  }
  const out = new Map<string, EdgeRating>();
  for (const [key, v] of byTarget) {
    if (v.devices.size < SHARING_RULES.minDevices || v.weight === 0) continue;
    out.set(key, { average: v.sum / v.weight, count: v.weight });
  }
  return out;
}
