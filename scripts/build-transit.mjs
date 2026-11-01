// Baut den Öffi-Fahrplan für die App aus den offenen GTFS-Daten der Wiener Linien.
//
// Ergebnis: public/data/transit.json mit
//  - Haltestellen im Gebiet (Name, Lage, ob gut beleuchtet)
//  - Linienverläufen („Mustern“): Haltestellenfolge, Fahrzeit ab erster Haltestelle
//  - Abfahrtszeiten je Tagestyp (Mo–Do, Fr, Sa, So/Feiertag), inkl. Nachtbetrieb (Zeiten über 24:00)
//
// Aufruf: npm run transit   (wird auch von „npm run data“ aufgerufen)
// Datenquelle: Wiener Linien Open Data (CC BY 4.0), https://www.wienerlinien.at/open-data

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
const GTFS_URL = 'https://www.wienerlinien.at/ogd_realtime/doku/ogd/gtfs/gtfs.zip';
const REFRESH = process.argv.includes('--refresh');
const log = (...a) => console.log('[öffis]', ...a);

const MX = 111320 * Math.cos((48.2 * Math.PI) / 180);
const MY = 110540;
const dist = (a, b) => Math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MY);

/** sehr einfacher CSV-Zerleger für die GTFS-Dateien (Werte in Anführungszeichen, keine Zeilenumbrüche in Feldern) */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function* readCsv(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line) continue;
    const cols = splitCsv(line);
    if (!header) {
      header = cols;
      continue;
    }
    const row = {};
    header.forEach((h, i) => (row[h] = cols[i]));
    yield row;
  }
}

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

async function ensureGtfs() {
  const dir = path.join(RAW, 'gtfs');
  if (fs.existsSync(path.join(dir, 'stop_times.txt')) && !REFRESH) return dir;
  fs.mkdirSync(dir, { recursive: true });
  log('lade', GTFS_URL);
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error('GTFS-Download fehlgeschlagen: ' + res.status);
  const zip = path.join(RAW, 'gtfs.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const { execFileSync } = await import('node:child_process');
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  return dir;
}

function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
  // Gebiet: alle Bezirke aus dem Datenbau plus 500 m Rand
  const all = index.bezirke.reduce((a, b) => [Math.min(a[0], b.bbox[0]), Math.min(a[1], b.bbox[1]), Math.max(a[2], b.bbox[2]), Math.max(a[3], b.bbox[3])], [180, 90, -180, -90]);
  const AREA = [all[0] - 500 / MX, all[1] - 500 / MY, all[2] + 500 / MX, all[3] + 500 / MY];
  const inArea = (lon, lat) => lon >= AREA[0] && lon <= AREA[2] && lat >= AREA[1] && lat <= AREA[3];

  const dir = await ensureGtfs();

  // 1. Tagestypen: je ein typischer Tag in der Zukunft (Di für Mo–Do, Fr, Sa, So)
  const calendar = [];
  for await (const r of readCsv(path.join(dir, 'calendar.txt'))) calendar.push(r);
  const exceptions = new Map();
  for await (const r of readCsv(path.join(dir, 'calendar_dates.txt'))) {
    if (!exceptions.has(r.date)) exceptions.set(r.date, []);
    exceptions.get(r.date).push(r);
  }
  const feedEnd = calendar.reduce((m, r) => (r.end_date > m ? r.end_date : m), '0');
  const DAYS = { mo: 2, fr: 5, sa: 6, so: 0 }; // Wochentag des Beispieltags (Di, Fr, Sa, So)
  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const picked = {};
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (const [type, wd] of Object.entries(DAYS)) {
    const d = new Date(start);
    // nächster passender Tag, der kein (fester) Feiertag ist; die Tage um Weihnachten meiden
    const HOLIDAYS = ['0101', '0106', '0501', '0815', '1026', '1101', '1208', '1224', '1225', '1226', '1231'];
    for (let i = 0; i < 60; i++) {
      if (d.getDay() === wd && !HOLIDAYS.includes(ymd(d).slice(4)) && ymd(d) <= feedEnd) break;
      d.setDate(d.getDate() + 1);
    }
    picked[type] = ymd(d);
  }
  const activeServices = {};
  for (const [type, date] of Object.entries(picked)) {
    const wd = WD[new Date(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)).getDay()];
    const set = new Set(calendar.filter((c) => c.start_date <= date && date <= c.end_date && c[wd] === '1').map((c) => c.service_id));
    for (const e of exceptions.get(date) ?? []) {
      if (e.exception_type === '1') set.add(e.service_id);
      else set.delete(e.service_id);
    }
    activeServices[type] = set;
  }
  log('Beispieltage:', picked);

  // 2. Haltestellen im Gebiet, mit Beleuchtung (Leuchten der Stadt Wien im Umkreis von 30 m)
  const lamps = JSON.parse(fs.readFileSync(path.join(RAW, 'leuchten.json'), 'utf8')).features.map((f) => f.geometry.coordinates);
  const lampCell = new Map();
  for (const c of lamps) {
    if (!inArea(c[0], c[1])) continue;
    const k = `${Math.floor(c[0] / 0.0005)}:${Math.floor(c[1] / 0.0005)}`;
    if (!lampCell.has(k)) lampCell.set(k, []);
    lampCell.get(k).push(c);
  }
  const litNear = (c) => {
    const cx = Math.floor(c[0] / 0.0005);
    const cy = Math.floor(c[1] / 0.0005);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const l of lampCell.get(`${cx + dx}:${cy + dy}`) ?? []) if (dist(l, c) <= 30) n++;
    return n;
  };
  const stopIdx = new Map();
  const stops = [];
  for await (const r of readCsv(path.join(dir, 'stops.txt'))) {
    const lon = +r.stop_lon;
    const lat = +r.stop_lat;
    if (!inArea(lon, lat)) continue;
    stopIdx.set(r.stop_id, stops.length);
    stops.push([r.stop_name, +lon.toFixed(5), +lat.toFixed(5), litNear([lon, lat]) >= 1 ? 1 : 0]);
  }
  log('Haltestellen (Steige) im Gebiet:', stops.length);

  // 3. Linien und Fahrten
  const routes = new Map();
  for await (const r of readCsv(path.join(dir, 'routes.txt'))) routes.set(r.route_id, { name: r.route_short_name, type: +r.route_type });
  const tripInfo = new Map();
  const anyActive = new Set(Object.values(activeServices).flatMap((s) => [...s]));
  for await (const r of readCsv(path.join(dir, 'trips.txt'))) {
    if (!anyActive.has(r.service_id)) continue;
    tripInfo.set(r.trip_id, { route: r.route_id, service: r.service_id, headsign: r.trip_headsign });
  }
  log('Fahrten an den Beispieltagen:', tripInfo.size);

  // 4. Haltezeiten (sortiert nach Fahrt): Muster bilden
  const patterns = new Map(); // key -> { route, headsign, stops, offsets: number[][], deps: {type: number[]} }
  let cur = null;
  let curRows = [];
  const flush = () => {
    if (!cur || curRows.length < 2) return;
    const info = tripInfo.get(cur);
    curRows.sort((a, b) => a.seq - b.seq);
    const stopList = curRows.map((r) => r.stop);
    const key = `${info.route}|${info.headsign}|${stopList.join(',')}`;
    let p = patterns.get(key);
    if (!p) patterns.set(key, (p = { route: info.route, headsign: info.headsign, stops: stopList, offsetSum: new Array(stopList.length).fill(0), n: 0, deps: { mo: [], fr: [], sa: [], so: [] } }));
    const t0 = curRows[0].dep;
    curRows.forEach((r, i) => (p.offsetSum[i] += r.arr - t0));
    p.n++;
    for (const [type, set] of Object.entries(activeServices)) if (set.has(info.service)) p.deps[type].push(t0);
  };
  let rows = 0;
  for await (const r of readCsv(path.join(dir, 'stop_times.txt'))) {
    if (r.trip_id !== cur) {
      flush();
      cur = r.trip_id;
      curRows = [];
    }
    rows++;
    if (!tripInfo.has(r.trip_id)) continue;
    const s = stopIdx.get(r.stop_id);
    if (s === undefined) continue;
    curRows.push({ stop: s, seq: +r.stop_sequence, arr: toMin(r.arrival_time), dep: toMin(r.departure_time) });
    if (rows % 2_000_000 === 0) log(`  ${(rows / 1e6).toFixed(0)} Mio. Haltezeiten gelesen`);
  }
  flush();

  // 5. Ausgabe
  const routeList = [];
  const routeIdx = new Map();
  const out = [];
  for (const p of patterns.values()) {
    const total = Object.values(p.deps).reduce((s, d) => s + d.length, 0);
    if (!total) continue;
    const r = routes.get(p.route) ?? { name: '?', type: 3 };
    const rk = `${r.name}|${r.type}`;
    if (!routeIdx.has(rk)) {
      routeIdx.set(rk, routeList.length);
      routeList.push([r.name, r.type]);
    }
    const deps = {};
    for (const [type, d] of Object.entries(p.deps)) deps[type] = [...new Set(d)].sort((a, b) => a - b);
    out.push({ r: routeIdx.get(rk), h: p.headsign, s: p.stops, o: p.offsetSum.map((v) => Math.round(v / p.n)), d: deps });
  }
  const transit = {
    generated: new Date().toISOString(),
    source: 'Wiener Linien Open Data (CC BY 4.0)',
    days: picked,
    validUntil: feedEnd,
    stops,
    routes: routeList,
    patterns: out,
  };
  const json = JSON.stringify(transit);
  fs.writeFileSync(path.join(OUT, 'transit.json'), json);
  log(`fertig: ${out.length} Linienverläufe, ${routeList.length} Linien, ${(json.length / 1e6).toFixed(1)} MB → public/data/transit.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
