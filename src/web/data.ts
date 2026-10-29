import { Planner } from '../core/planner';
import type { Stop } from '../core/types';

const base = `${import.meta.env.BASE_URL}data/`;

async function loadJson<T>(file: string): Promise<T> {
  const res = await fetch(base + file);
  if (!res.ok) throw new Error(`Daten konnten nicht geladen werden (${file})`);
  return (await res.json()) as T;
}

let planner: Promise<Planner> | null = null;
export const getPlanner = () => (planner ??= Planner.create(loadJson));

let stops: Promise<Stop[]> | null = null;
export const getStops = () => (stops ??= loadJson<Stop[]>('haltestellen.json'));
