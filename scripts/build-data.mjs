// Baut die Kartendaten für die App.
//
// Was passiert hier?
// 1. Die Bezirksliste wird aus config/gebiet.json gelesen.
// 2. Rohdaten werden geladen (und in data-raw/ zwischengespeichert):
//    - OpenStreetMap-Export für Wien (BBBike, wöchentlich aktualisiert)
//    - Stadt Wien Open Data: Bezirksgrenzen, Leuchtenstandorte, Öffi-Haltestellen
// 3. Daraus wird ein Fußwege-Netz gebaut und pro Bezirk eine Datei
//    public/data/bezirk-XX.json geschrieben, dazu ein Inhaltsverzeichnis index.json.
//
// Aufruf: npm run data   (Rohdaten neu laden: npm run data -- --refresh)

import { createOSMStream } from 'osm-pbf-parser-node';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
const REFRESH = process.argv.includes('--refresh');

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'gebiet.json'), 'utf8'));
const PILOT = config.bezirke.map(Number);
const TRANSIT = (config.durchgang ?? []).map(Number).filter((n) => !PILOT.includes(n));
const BEZIRKE = [...PILOT, ...TRANSIT];

const PBF_URL = 'https://download.bbbike.org/osm/bbbike/Wien/Wien.osm.pbf';
const WFS = 'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&srsName=EPSG:4326&outputFormat=json&typeName=ogdwien:';

// ---------------------------------------------------------------- Hilfen

const log = (...a) => console.log('[data]', ...a);

async function download(url, file) {
  const target = path.join(RAW, file);
  if (fs.existsSync(target) && !REFRESH) return target;
  log('lade', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// Lokale Projektion in Meter (für Wien ausreichend genau)
const LAT0 = 48.2;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const MY = 110540;
const toXY = ([lon, lat]) => [lon * MX, lat * MY];
const dist = (a, b) => Math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MY);

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// polygon = [outer, ...holes]
const pointInPolygon = (pt, poly) => pointInRing(pt, poly[0]) && !poly.slice(1).some((h) => pointInRing(pt, h));

function bboxOf(coords) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (y < s) s = y;
    if (x > e) e = x;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

// Einfaches Raster für schnelle Umgebungssuche
class Grid {
  constructor(cellMeters) {
    this.cx = cellMeters / MX;
    this.cy = cellMeters / MY;
    this.cells = new Map();
  }
  key(i, j) {
    return i * 100000 + j;
  }
  add(lon, lat, item) {
    const k = this.key(Math.floor(lon / this.cx), Math.floor(lat / this.cy));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(item);
  }
  addBox([w, s, e, n], item) {
    for (let i = Math.floor(w / this.cx); i <= Math.floor(e / this.cx); i++)
      for (let j = Math.floor(s / this.cy); j <= Math.floor(n / this.cy); j++) {
        const k = this.key(i, j);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
      }
  }
  near(lon, lat) {
    const i0 = Math.floor(lon / this.cx);
    const j0 = Math.floor(lat / this.cy);
    const out = [];
    for (let i = i0 - 1; i <= i0 + 1; i++)
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const c = this.cells.get(this.key(i, j));
        if (c) out.push(...c);
      }
    return out;
  }
  at(lon, lat) {
    return this.cells.get(this.key(Math.floor(lon / this.cx), Math.floor(lat / this.cy))) ?? [];
  }
}

// Douglas-Peucker zum Verkleinern der Bezirksgrenzen
function simplify(points, tolMeters) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = toXY(points[a]);
    const B = toXY(points[b]);
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const P = toXY(points[i]);
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2));
      const d = Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolMeters) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const r5 = (v) => Math.round(v * 1e5);

// ---------------------------------------------------------------- Regeln für Wege

// Kategorien (müssen zu src/core/types.ts passen)
const KIND = { main: 0, residential: 1, service: 2, pedestrian: 3, footway: 4, track: 5, steps: 6 };
const HIGHWAY_KIND = {
  primary: 'main', primary_link: 'main', secondary: 'main', secondary_link: 'main', tertiary: 'main', tertiary_link: 'main',
  trunk: 'main', trunk_link: 'main',
  residential: 'residential', unclassified: 'residential', living_street: 'residential', road: 'residential',
  service: 'service',
  pedestrian: 'pedestrian',
  footway: 'footway', path: 'footway', cycleway: 'footway', bridleway: 'footway', corridor: 'footway',
  track: 'track',
  steps: 'steps',
};
// Flags (Bits)
const F = { PARK: 1, TUNNEL: 2, BRIDGE: 4, CROSSING: 8, PASSAGE: 16, NO_SIDEWALK: 32 };

function walkable(t) {
  const kind = HIGHWAY_KIND[t.highway];
  if (!kind) return null;
  if (t.foot === 'no' || t.foot === 'use_sidepath') return null;
  if (['private', 'no'].includes(t.access) && !['yes', 'designated', 'permissive'].includes(t.foot)) return null;
  if (t.highway.startsWith('trunk') && !['yes', 'designated'].includes(t.foot) && !t.sidewalk) return null;
  if (t.highway === 'cycleway' && !['yes', 'designated', 'permissive'].includes(t.foot)) return null;
  if (t.area === 'yes' && t.highway !== 'pedestrian') return null;
  return kind;
}

const isGreen = (t) =>
  ['park', 'garden', 'recreation_ground', 'nature_reserve'].includes(t.leisure) && t.access !== 'private'
    ? true
    : ['cemetery', 'forest', 'meadow', 'recreation_ground', 'grass', 'allotments'].includes(t.landuse) ||
      ['wood', 'scrub'].includes(t.natural);

// Orte, die abends belebt sein können. Kategorien müssen zu src/core/types.ts passen.
function poiCategory(t) {
  if (t.amenity === 'police') return 'police';
  if (t.amenity === 'hospital' && t.emergency === 'yes') return 'hospital';
  if (t.amenity === 'fuel') return 'fuel';
  if (['convenience', 'kiosk', 'supermarket'].includes(t.shop)) return 'shop';
  if (['bar', 'pub', 'nightclub', 'biergarten'].includes(t.amenity)) return 'bar';
  if (['restaurant', 'cafe', 'fast_food', 'ice_cream'].includes(t.amenity)) return 'food';
  if (['cinema', 'theatre', 'arts_centre'].includes(t.amenity)) return 'culture';
  if (t.amenity === 'pharmacy') return 'pharmacy';
  if (['hotel', 'hostel'].includes(t.tourism)) return 'hotel';
  return null;
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Bezirksgrenzen
  const bezFile = await download(WFS + 'BEZIRKSGRENZEOGD', 'bezirke.json');
  const bezirke = readJson(bezFile)
    .features.filter((f) => BEZIRKE.includes(f.properties.BEZNR))
    .map((f) => ({
      nr: f.properties.BEZNR,
      name: f.properties.NAMEK,
      transit: TRANSIT.includes(f.properties.BEZNR),
      poly: f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0],
    }));
  const missing = BEZIRKE.filter((n) => !bezirke.some((b) => b.nr === n));
  if (missing.length) throw new Error('Unbekannte Bezirksnummern in config/gebiet.json: ' + missing.join(', '));
  for (const b of bezirke) b.bbox = bboxOf(b.poly[0]);
  log('Bezirke:', bezirke.map((b) => `${b.nr}. ${b.name}`).join(', '));

  const pad = 400; // Meter Rand um das Gebiet
  const all = bboxOf(bezirke.flatMap((b) => [[b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]]));
  const AREA = [all[0] - pad / MX, all[1] - pad / MY, all[2] + pad / MX, all[3] + pad / MY];
  const inArea = (lon, lat) => lon >= AREA[0] && lon <= AREA[2] && lat >= AREA[1] && lat <= AREA[3];

  const bezGrid = new Grid(500);
  for (const b of bezirke) bezGrid.addBox(b.bbox, b);
  const bezirkAt = (pt) => bezGrid.at(pt[0], pt[1]).find((b) => pointInPolygon(pt, b.poly));

  // 2. Leuchten der Stadt Wien
  const lampFile = await download(WFS + 'LAMPENTAUSCHOGD&propertyName=SHAPE', 'leuchten.json');
  const lampGrid = new Grid(25);
  let lampCount = 0;
  for (const f of readJson(lampFile).features) {
    const [lon, lat] = f.geometry.coordinates;
    if (!inArea(lon, lat)) continue;
    lampGrid.add(lon, lat, [lon, lat]);
    lampCount++;
  }
  log('Leuchten im Gebiet:', lampCount);

  // 3. Öffi-Haltestellen
  const stopFile = await download(WFS + 'OEFFHALTESTOGD', 'haltestellen.json');
  const LTYP = { 4: 'ubahn', 5: 'sbahn', 1: 'tram', 2: 'bus', 3: 'bus', 9: 'tram', 10: 'bus', 11: 'bus', 12: 'bus', 13: 'bus' };
  const PRIO = { ubahn: 0, sbahn: 1, tram: 2, bus: 3 };
  const stopsByName = new Map();
  for (const f of readJson(stopFile).features) {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    if (!inArea(lon, lat)) continue;
    const b = bezirkAt([lon, lat]);
    if (!b || b.transit) continue;
    const type = LTYP[p.LTYP] ?? 'bus';
    const lines = (p.HLINIEN ?? '').split(',').map((l) => l.trim()).filter(Boolean);
    // Gleichnamige Haltestellen in der Nähe zusammenfassen
    const key = p.HTXT;
    let list = stopsByName.get(key);
    if (!list) stopsByName.set(key, (list = []));
    let s = list.find((x) => dist([x.lon, x.lat], [lon, lat]) < 300);
    if (!s) list.push((s = { name: p.HTXT, lon, lat, type, lines: new Set(), bezirk: b.nr, n: 0, sx: 0, sy: 0 }));
    if (PRIO[type] < PRIO[s.type]) s.type = type;
    lines.forEach((l) => s.lines.add(l));
    s.n++;
    s.sx += lon;
    s.sy += lat;
  }
  const stops = [...stopsByName.values()].flat().map((s, i) => {
    const lines = [...s.lines].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    return {
      id: 'st' + i,
      name: s.name,
      type: s.type,
      lines,
      night: lines.some((l) => /^N\d/.test(l) || /^U\d$/.test(l)),
      bezirk: s.bezirk,
      lon: +(s.sx / s.n).toFixed(5),
      lat: +(s.sy / s.n).toFixed(5),
    };
  });
  log('Haltestellen:', stops.length);

  // 4. OpenStreetMap in drei Durchläufen
  const pbf = await download(PBF_URL, 'Wien.osm.pbf');

  log('OSM 1/3: Relationen (große Parks)');
  const greenRelWays = new Map(); // wayId -> relationId
  for await (const item of createOSMStream(pbf, { withInfo: false })) {
    if (item.type !== 'relation') continue;
    const t = item.tags ?? {};
    if (t.type !== 'multipolygon' || !isGreen(t)) continue;
    for (const m of item.members) if (m.type === 'way' && m.role !== 'inner') greenRelWays.set(m.ref, item.id);
  }

  log('OSM 2/3: Wege');
  const roads = [];
  const greenWays = []; // { id, refs, rel? }
  const poiWays = [];
  const needed = new Set();
  for await (const item of createOSMStream(pbf, { withInfo: false })) {
    if (!item.type || item.type === 'node') continue;
    if (item.type !== 'way') break;
    const t = item.tags ?? {};
    const kind = t.highway ? walkable(t) : null;
    if (kind) {
      roads.push({ id: item.id, refs: item.refs, t, kind });
      item.refs.forEach((r) => needed.add(r));
      continue;
    }
    if ((t.area !== 'no' && isGreen(t)) || greenRelWays.has(item.id)) {
      greenWays.push({ id: item.id, refs: item.refs, rel: greenRelWays.get(item.id), closed: item.refs[0] === item.refs.at(-1) });
      item.refs.forEach((r) => needed.add(r));
    }
    const cat = poiCategory(t);
    if (cat) {
      poiWays.push({ id: item.id, refs: item.refs, t, cat });
      item.refs.forEach((r) => needed.add(r));
    }
  }
  log(`  ${roads.length} Wege, ${greenWays.length} Grünflächen-Teile, ${poiWays.length} Orte als Fläche`);

  log('OSM 3/3: Punkte');
  const coord = new Map();
  const pois = [];
  for await (const item of createOSMStream(pbf, { withInfo: false })) {
    if (!item.type) continue;
    if (item.type !== 'node') break;
    if (needed.has(item.id)) coord.set(item.id, [item.lon, item.lat]);
    if (item.tags && inArea(item.lon, item.lat)) {
      const cat = poiCategory(item.tags);
      if (cat) pois.push({ id: 'n' + item.id, cat, t: item.tags, lon: item.lon, lat: item.lat });
    }
  }
  for (const w of poiWays) {
    const pts = w.refs.map((r) => coord.get(r)).filter(Boolean);
    if (!pts.length) continue;
    const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (inArea(lon, lat)) pois.push({ id: 'w' + w.id, cat: w.cat, t: w.t, lon, lat });
  }
  log('  Orte (Lokale, Polizei, …):', pois.length);

  // 5. Grünflächen-Polygone bauen (offene Teile von Relationen zusammensetzen)
  const greenPolys = [];
  const relParts = new Map();
  for (const g of greenWays) {
    const pts = g.refs.map((r) => coord.get(r));
    if (pts.some((p) => !p)) continue;
    if (g.closed) greenPolys.push([pts]);
    else if (g.rel) {
      if (!relParts.has(g.rel)) relParts.set(g.rel, []);
      relParts.get(g.rel).push(pts);
    }
  }
  for (const parts of relParts.values()) {
    while (parts.length) {
      let ring = parts.pop();
      let grown = true;
      while (grown && dist(ring[0], ring.at(-1)) > 0.01) {
        grown = false;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const end = ring.at(-1);
          if (dist(p[0], end) < 0.01) ring = ring.concat(p.slice(1));
          else if (dist(p.at(-1), end) < 0.01) ring = ring.concat(p.slice(0, -1).reverse());
          else continue;
          parts.splice(i, 1);
          grown = true;
          break;
        }
      }
      if (dist(ring[0], ring.at(-1)) < 0.01) greenPolys.push([ring]);
    }
  }
  const greenGrid = new Grid(200);
  for (const p of greenPolys) {
    const bb = bboxOf(p[0]);
    if (bb[2] < AREA[0] || bb[0] > AREA[2] || bb[3] < AREA[1] || bb[1] > AREA[3]) continue;
    greenGrid.addBox(bb, p);
  }
  const inGreen = (pt) => greenGrid.at(pt[0], pt[1]).some((p) => pointInPolygon(pt, p));
  log('  Grünflächen:', greenPolys.length);

  // 6. Netz bauen: Wege an Kreuzungen teilen
  const roadsIn = roads.filter((r) => r.refs.some((id) => {
    const c = coord.get(id);
    return c && inArea(c[0], c[1]);
  }));
  const usage = new Map();
  for (const r of roadsIn) for (const id of r.refs) usage.set(id, (usage.get(id) ?? 0) + 1);

  const poiGrid = new Grid(50);
  pois.forEach((p, i) => poiGrid.add(p.lon, p.lat, i));

  const files = new Map(bezirke.map((b) => [b.nr, { nodes: new Map(), edges: [], names: new Map(), pois: new Set() }]));
  let edgeCount = 0;

  for (const r of roadsIn) {
    const t = r.t;
    let flags = 0;
    if (t.tunnel && t.tunnel !== 'no') flags |= t.tunnel === 'building_passage' ? F.PASSAGE : F.TUNNEL;
    if (t.covered === 'yes') flags |= F.PASSAGE;
    if (t.bridge && t.bridge !== 'no') flags |= F.BRIDGE;
    if (t.footway === 'crossing' || t.highway === 'crossing') flags |= F.CROSSING;
    if (KIND[r.kind] <= KIND.service && (t.sidewalk === 'no' || t.sidewalk === 'none')) flags |= F.NO_SIDEWALK;
    const osmLit = t.lit === 'no' || t.lit === 'disused' ? 0 : t.lit && t.lit !== 'no' ? 1 : -1;

    let start = 0;
    for (let i = 1; i < r.refs.length; i++) {
      const id = r.refs[i];
      if (i < r.refs.length - 1 && (usage.get(id) ?? 0) < 2) continue;
      const ids = r.refs.slice(start, i + 1);
      start = i;
      const pts = ids.map((n) => coord.get(n));
      if (pts.some((p) => !p)) continue;

      let len = 0;
      for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k]);
      if (len < 0.5) continue;

      // Punkte im Abstand von ~8 m entlang der Kante für Leuchten/Parks/Orte
      const samples = [];
      for (let k = 1; k < pts.length; k++) {
        const d = dist(pts[k - 1], pts[k]);
        const n = Math.max(1, Math.ceil(d / 8));
        for (let s = 0; s < n; s++) {
          const f = s / n;
          samples.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f]);
        }
      }
      samples.push(pts.at(-1));

      const mid = samples[Math.floor(samples.length / 2)];
      const bez = bezirkAt(mid);
      if (!bez) continue;

      let covered = 0;
      for (const s of samples) if (lampGrid.near(s[0], s[1]).some((l) => dist(l, s) <= 22)) covered++;
      const lampCov = Math.round((covered / samples.length) * 100);

      let f2 = flags;
      if (KIND[r.kind] >= KIND.pedestrian && inGreen(mid)) f2 |= F.PARK;

      const near = new Set();
      for (let k = 0; k < samples.length; k += 3)
        for (const pi of poiGrid.near(samples[k][0], samples[k][1]))
          if (dist([pois[pi].lon, pois[pi].lat], samples[k]) <= 40) near.add(pi);

      const file = files.get(bez.nr);
      const nodeIdx = (osmId, c) => {
        let idx = file.nodes.get(osmId);
        if (idx === undefined) {
          idx = file.nodes.size;
          file.nodes.set(osmId, idx);
          file.nodeList ??= [];
          file.nodeList.push(osmId, r5(c[0]), r5(c[1]));
        }
        return idx;
      };
      const a = nodeIdx(ids[0], pts[0]);
      const b = nodeIdx(ids.at(-1), pts.at(-1));
      const name = t.name ?? '';
      let nameIdx = file.names.get(name);
      if (nameIdx === undefined) file.names.set(name, (nameIdx = file.names.size));
      const geom = pts.slice(1, -1).flatMap((p) => [r5(p[0]), r5(p[1])]);
      const poiIds = [...near].map((pi) => pois[pi].id);
      poiIds.forEach((id) => file.pois.add(id));
      // Schema siehe src/core/types.ts (RawEdge)
      file.edges.push([a, b, Math.round(len * 10) / 10, KIND[r.kind], nameIdx, osmLit, lampCov, f2, geom, poiIds]);
      edgeCount++;
    }
  }
  log('Kanten gesamt:', edgeCount);

  // 7. Dateien schreiben
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const index = {
    generated: new Date().toISOString(),
    attribution: [
      '© OpenStreetMap-Mitwirkende (ODbL)',
      'Datenquelle: Stadt Wien – data.wien.gv.at (CC BY 4.0): Bezirksgrenzen, Leuchtenstandorte, Haltestellen',
    ],
    bezirke: [],
  };
  for (const b of bezirke) {
    const file = files.get(b.nr);
    const poiList = [...file.pois].map((id) => {
      const p = poiById.get(id);
      return {
        id,
        cat: p.cat,
        name: p.t.name ?? null,
        oh: p.t.opening_hours ?? null,
        lon: +p.lon.toFixed(5),
        lat: +p.lat.toFixed(5),
      };
    });
    const out = {
      bezirk: b.nr,
      nodes: file.nodeList ?? [],
      names: [...file.names.keys()],
      edges: file.edges,
      pois: poiList,
    };
    const fname = `bezirk-${String(b.nr).padStart(2, '0')}.json`;
    const json = JSON.stringify(out);
    fs.writeFileSync(path.join(OUT, fname), json);
    index.bezirke.push({
      nr: b.nr,
      name: b.name,
      transit: b.transit,
      file: fname,
      bytes: json.length,
      bbox: b.bbox.map((v) => +v.toFixed(5)),
      outline: simplify(b.poly[0], 15).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]),
    });
    log(`  ${fname}: ${file.edges.length} Kanten, ${poiList.length} Orte, ${(json.length / 1024).toFixed(0)} KB`);
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(OUT, 'haltestellen.json'), JSON.stringify(stops));
  log('fertig →', path.relative(ROOT, OUT));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
