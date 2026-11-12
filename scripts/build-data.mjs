// Baut die Kartendaten für die App.
//
// Was passiert hier?
// 1. Die Bezirksliste wird aus config/gebiet.json gelesen (Wien und Linz).
// 2. Rohdaten werden geladen (und in data-raw/ zwischengespeichert):
//    - OpenStreetMap-Export für Wien und Linz (BBBike, wöchentlich aktualisiert)
//    - Stadt Wien Open Data: Bezirksgrenzen, Leuchtenstandorte, Öffi-Haltestellen, Polizei, Taxi, WCs, Baustellen
//    - Stadt Linz Open Data: Grenzen der statistischen Bezirke (Haltestellen in Linz aus OpenStreetMap)
// 3. Daraus wird ein Fußwege-Netz gebaut und pro Bezirk eine Datei
//    public/data/bezirk-XX.json (Wien) bzw. linz-XX.json (Linz) geschrieben, dazu ein Inhaltsverzeichnis index.json.
//
// Aufruf: npm run data   (Rohdaten neu laden: npm run data -- --refresh)

import { createOSMStream } from 'osm-pbf-parser-node';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
const REFRESH = process.argv.includes('--refresh');

// Mapillary-Token für erkannte Straßenlaternen: aus der Umgebung (GitHub-Secret MAPILLARY_TOKEN) oder aus .env
function readToken() {
  if (process.env.MAPILLARY_TOKEN) return process.env.MAPILLARY_TOKEN.trim();
  if (process.env.VITE_MAPILLARY_TOKEN) return process.env.VITE_MAPILLARY_TOKEN.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    return env.match(/^VITE_MAPILLARY_TOKEN=(.*)$/m)?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}
const MLY_TOKEN = readToken();

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'gebiet.json'), 'utf8'));

// Städte. Bezirksnummern in der App: Wien 1–23, Linz 101–116 (= 100 + Nummer des statistischen Bezirks)
const CITIES = [
  { id: 'wien', name: 'Wien', pilot: config.bezirke, durchgang: config.durchgang ?? [], offset: 0, prefix: 'bezirk' },
  ...(config.linz ? [{ id: 'linz', name: 'Linz', pilot: config.linz.bezirke, durchgang: config.linz.durchgang ?? [], offset: 100, prefix: 'linz' }] : []),
  // Berlin: ganze Stadt (alle 97 Ortsteile), weil man vom Feiern überallhin heimfährt
  ...(config.berlin ? [{ id: 'berlin', name: 'Berlin', pilot: config.berlin.ortsteile ?? 'alle', durchgang: [], offset: 200, prefix: 'berlin' }] : []),
  // Zürich: ganze Stadt (34 statistische Quartiere)
  ...(config.zuerich ? [{ id: 'zuerich', name: 'Zürich', pilot: config.zuerich.quartiere ?? 'alle', durchgang: [], offset: 400, prefix: 'zuerich' }] : []),
];
const LAT = { wien: 48.2, linz: 48.3, berlin: 52.5, zuerich: 47.37 };

const PBF_URL = {
  wien: 'https://download.bbbike.org/osm/bbbike/Wien/Wien.osm.pbf',
  linz: 'https://download.bbbike.org/osm/bbbike/Linz/Linz.osm.pbf',
  berlin: 'https://download.bbbike.org/osm/bbbike/Berlin/Berlin.osm.pbf',
  zuerich: 'https://download.bbbike.org/osm/bbbike/Zuerich/Zuerich.osm.pbf',
};
// Stadt Zürich Open Data (Geoportal, CC0): statistische Quartiere und öffentliche Beleuchtung
const ZH_WFS = (layer, type) => `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/${layer}?service=WFS&version=1.1.0&request=GetFeature&typename=${type}&srsName=EPSG:4326`;

/** GeoJSON von einem WFS holen; probiert die üblichen Namen für das Ausgabeformat */
async function wfsGeoJson(url, file) {
  const target = path.join(RAW, file);
  if (fs.existsSync(target) && !REFRESH) return readJson(target);
  for (const fmt of ['application/json', 'GeoJSON', 'geojson', 'json']) {
    const res = await fetch(`${url}&outputFormat=${encodeURIComponent(fmt)}`);
    if (!res.ok) continue;
    const text = await res.text();
    if (!text.trim().startsWith('{')) continue;
    fs.writeFileSync(target, text);
    log('  WFS-Format', fmt, 'für', file);
    return JSON.parse(text);
  }
  throw new Error('Kein GeoJSON vom WFS: ' + url);
}

/** Längen-/Breitengrad-Reihenfolge prüfen (manche Server liefern lat,lon) */
const lonLat = (c) => (c[0] > 40 && c[1] < 20 ? [c[1], c[0]] : [c[0], c[1]]);

async function zuerichDistricts() {
  const d = await wfsGeoJson(ZH_WFS('Statistische_Quartiere', 'adm_statistische_quartiere_map'), 'zuerich-quartiere.json');
  log('  Quartier-Felder:', Object.keys(d.features[0]?.properties ?? {}).join(', '));
  return d.features
    .map((f) => {
      const p = f.properties ?? {};
      const name = p.qname ?? p.QNAME ?? p.name ?? Object.values(p).find((v) => typeof v === 'string' && /[a-zäöü]/.test(v)) ?? 'Quartier';
      const num = Number(p.qnr ?? p.QNR ?? p.objid ?? 0);
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.sort((a, b) => b[0].length - a[0].length);
      return { num, name, poly: polys[0].map((ring) => ring.map(lonLat)) };
    })
    .sort((a, b) => a.num - b.num || a.name.localeCompare(b.name))
    .map((q, i) => ({ nr: i + 1, name: q.name, poly: q.poly }));
}

async function zuerichLamps() {
  const d = await wfsGeoJson(ZH_WFS('Oeffentliche_Beleuchtung_der_Stadt_Zuerich', 'ewz_brennstelle_p'), 'zuerich-leuchten.json');
  return d.features.map((f) => (f.geometry?.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry?.coordinates)).filter(Boolean).map(lonLat);
}
// Berlin (Geoportal Berlin, Datenlizenz Deutschland – Zero 2.0): Ortsteile und öffentliche Beleuchtung
const BERLIN_OT = 'https://gdi.berlin.de/services/wfs/alkis_ortsteile?service=WFS&version=2.0.0&request=GetFeature&typeNames=alkis_ortsteile:ortsteile&outputFormat=application/json&srsName=EPSG:4326';
const BERLIN_LAMPS = 'https://gdi.berlin.de/services/wfs/beleuchtung?service=WFS&version=2.0.0&request=GetFeature&typeNames=beleuchtung:beleuchtung&outputFormat=application/json&srsName=EPSG:4326';
const LINZ_GML = 'https://data.linz.gv.at/katalog/geodata/statistisch_bezirke/2014/StatBez_Linz_EPSG_4326.gml';
const LINZ_NAMES = ['Innere Stadt', 'Urfahr', 'Pöstlingberg', 'St. Magdalena', 'Dornach-Auhof', 'Kaplanhof', 'Franckviertel', 'Bulgariplatz', 'Froschberg', 'Bindermichl-Keferfeld', 'Spallerhof', 'Neue Heimat', 'Kleinmünchen-Auwiesen', 'Industriegebiet-Hafen', 'Ebelsberg', 'Pichling'];
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

// Lokale Projektion in Meter, je Stadt auf deren Breitengrad eingestellt (siehe setProjection)
let MX = 111320 * Math.cos((48.2 * Math.PI) / 180);
const MY = 110540;
const setProjection = (lat) => (MX = 111320 * Math.cos((lat * Math.PI) / 180));
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

/** Bis zu dieser Entfernung (Meter) gilt ein Ort als „am Weg“ */
const POI_RADIUS = 50;

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
const F = { PARK: 1, TUNNEL: 2, BRIDGE: 4, CROSSING: 8, PASSAGE: 16, NO_SIDEWALK: 32, PARK_NEAR: 64 };

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
  if (['convenience', 'kiosk', 'supermarket', 'alcohol', 'beverages', 'bakery'].includes(t.shop)) return 'shop';
  if (['bar', 'pub', 'nightclub', 'biergarten'].includes(t.amenity)) return 'bar';
  if (['restaurant', 'cafe', 'fast_food', 'ice_cream'].includes(t.amenity)) return 'food';
  if (['cinema', 'theatre', 'arts_centre', 'casino', 'events_venue'].includes(t.amenity)) return 'culture';
  if (t.amenity === 'pharmacy') return 'pharmacy';
  if (['hotel', 'hostel'].includes(t.tourism)) return 'hotel';
  return null;
}

// Geschäfte und Lokale im Erdgeschoss („Geschäftsstraße“), unabhängig von Öffnungszeiten:
// auch geschlossen gibt es Schaufensterlicht, Eingänge und Leben in der Straße.
const FRONT_AMENITY = ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'bank', 'pharmacy', 'post_office', 'doctors', 'dentist', 'clinic'];
const isFrontage = (t) => (t.shop && !['vacant', 'no'].includes(t.shop)) || FRONT_AMENITY.includes(t.amenity);
const FRONT_RADIUS = 20;

// ---------------------------------------------------------------- Ablauf

/** Grenzen der statistischen Bezirke von Linz (Stadt Linz, data.linz.gv.at, GML in WGS84) */
async function linzDistricts() {
  const gml = fs.readFileSync(await download(LINZ_GML, 'linz-bezirke.gml'), 'utf8');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
  const out = [];
  for (const m of gml.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)) {
    const body = m[1];
    const field = (name) => body.match(new RegExp(`<ogr:${name}>\\s*([^<]*?)\\s*</ogr:${name}>`))?.[1] ?? null;
    const label = field('Bezeichung') ?? field('Bezeichnung') ?? field('STBn') ?? '';
    let nr = LINZ_NAMES.findIndex((n) => norm(n) === norm(label)) + 1;
    if (!nr) nr = Number(field('Stb')) || Number(field('STBn')) || 0;
    const rings = [...body.matchAll(/<gml:coordinates>([^<]+)<\/gml:coordinates>/g)].map((r) =>
      r[1].trim().split(/\s+/).map((t) => t.split(',').slice(0, 2).map(Number)),
    );
    if (!nr || !rings.length) {
      log('  Linz: Bezirk nicht erkannt:', label, field('Stb'));
      continue;
    }
    // größter Ring = Außengrenze
    rings.sort((a, b) => b.length - a.length);
    out.push({ nr, name: LINZ_NAMES[nr - 1] ?? label, poly: [rings[0]] });
  }
  if (out.length < 16) log('  Achtung: nur', out.length, 'Linzer Bezirke erkannt');
  return out;
}

/** Ortsteile von Berlin (97), nummeriert nach dem amtlichen Schlüssel */
async function berlinDistricts() {
  const d = readJson(await download(BERLIN_OT, 'berlin-ortsteile.json'));
  return d.features
    .sort((a, b) => String(a.properties.sch).localeCompare(String(b.properties.sch)))
    .map((f, i) => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      // größte Teilfläche nehmen (Inseln usw. fallen weg)
      polys.sort((a, b) => b[0].length - a[0].length);
      return { nr: i + 1, name: f.properties.nam, poly: polys[0] };
    });
}

/** Alle öffentlichen Leuchten in Berlin (ca. 210.000), seitenweise abgefragt; ohne Schaltkästen und außer Betrieb */
async function berlinLamps() {
  const file = path.join(RAW, 'berlin-leuchten.json');
  if (fs.existsSync(file) && !REFRESH) return readJson(file);
  const out = [];
  const types = new Map();
  for (let start = 0; ; start += 10000) {
    const res = await fetch(`${BERLIN_LAMPS}&count=10000&startIndex=${start}&sortBy=id`);
    if (!res.ok) throw new Error('Berliner Leuchten: ' + res.status);
    const feats = (await res.json()).features ?? [];
    for (const f of feats) {
      const p = f.properties ?? {};
      types.set(p.leuchtentyp, (types.get(p.leuchtentyp) ?? 0) + 1);
      if (/schaltkasten/i.test(p.leuchtentyp ?? '')) continue;
      if (p.status && !/in betrieb/i.test(p.status) && !/sanierung \(in/i.test(p.status)) continue;
      const c = f.geometry?.type === 'MultiPoint' ? f.geometry.coordinates[0] : f.geometry?.coordinates;
      if (c) out.push([+c[0].toFixed(6), +c[1].toFixed(6)]);
    }
    log(`  Berliner Leuchten: ${start + feats.length} gelesen`);
    if (feats.length < 10000) break;
  }
  log('  Typen:', [...types].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', '));
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

async function buildCity(city, acc) {
  setProjection(LAT[city.id] ?? 48.2);
  log(`===== ${city.name} =====`);

  // 1. Bezirksgrenzen
  let raw;
  if (city.id === 'wien') {
    raw = readJson(await download(WFS + 'BEZIRKSGRENZEOGD', 'bezirke.json')).features.map((f) => ({
      nr: f.properties.BEZNR,
      name: f.properties.NAMEK,
      poly: f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0],
    }));
  } else if (city.id === 'linz') raw = await linzDistricts();
  else if (city.id === 'berlin') raw = await berlinDistricts();
  else raw = await zuerichDistricts();
  const PILOT = city.pilot === 'alle' ? raw.map((b) => b.nr) : city.pilot.map(Number);
  const TRANSIT = city.durchgang.map(Number).filter((n) => !PILOT.includes(n));
  const BEZIRKE = [...PILOT, ...TRANSIT];
  const bezirke = raw
    .filter((b) => BEZIRKE.includes(b.nr))
    .map((b) => ({ ...b, local: b.nr, nr: b.nr + city.offset, transit: TRANSIT.includes(b.nr) }));
  const missing = BEZIRKE.filter((n) => !bezirke.some((b) => b.local === n));
  if (missing.length) throw new Error(`Unbekannte Bezirksnummern für ${city.name} in config/gebiet.json: ` + missing.join(', '));
  for (const b of bezirke) b.bbox = bboxOf(b.poly[0]);
  log(`Bezirke (${bezirke.length}):`, bezirke.map((b) => `${b.local}. ${b.name}`).join(', '));

  const pad = 400; // Meter Rand um das Gebiet
  const all = bboxOf(bezirke.flatMap((b) => [[b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]]));
  const AREA = [all[0] - pad / MX, all[1] - pad / MY, all[2] + pad / MX, all[3] + pad / MY];
  const inArea = (lon, lat) => lon >= AREA[0] && lon <= AREA[2] && lat >= AREA[1] && lat <= AREA[3];

  const bezGrid = new Grid(500);
  for (const b of bezirke) bezGrid.addBox(b.bbox, b);
  const bezirkAt = (pt) => bezGrid.at(pt[0], pt[1]).find((b) => pointInPolygon(pt, b.poly));

  // 2. Leuchten der Stadt (Wien, Berlin; für Linz gibt es keine offenen Leuchtenstandorte)
  const lampGrid = new Grid(25);
  let lampCount = 0;
  if (city.id === 'wien') {
    const lampFile = await download(WFS + 'LAMPENTAUSCHOGD&propertyName=SHAPE', 'leuchten.json');
    for (const f of readJson(lampFile).features) {
      const [lon, lat] = f.geometry.coordinates;
      if (!inArea(lon, lat)) continue;
      lampGrid.add(lon, lat, [lon, lat]);
      lampCount++;
    }
  } else if (city.id === 'berlin' || city.id === 'zuerich') {
    for (const [lon, lat] of city.id === 'berlin' ? await berlinLamps() : await zuerichLamps()) {
      if (!inArea(lon, lat)) continue;
      lampGrid.add(lon, lat, [lon, lat]);
      lampCount++;
    }
  }
  log('Leuchten der Stadt im Gebiet:', lampCount);

  // 2b. Auf Mapillary-Fotos erkannte Straßenlaternen (Vektor-Kacheln, Zoomstufe 14)
  const mlyGrid = new Grid(25);
  let mlyCount = 0;
  if (MLY_TOKEN) {
    const z = 14;
    const tx = (lon) => Math.floor(((lon + 180) / 360) * 2 ** z);
    const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
    const tiles = new Set();
    for (const b of bezirke) for (let x = tx(b.bbox[0]); x <= tx(b.bbox[2]); x++) for (let y = ty(b.bbox[3]); y <= ty(b.bbox[1]); y++) tiles.add(`${x}/${y}`);
    fs.mkdirSync(path.join(RAW, 'mapillary'), { recursive: true });
    let n = 0;
    for (const t of tiles) {
      const [x, y] = t.split('/').map(Number);
      const file = path.join('mapillary', `features-${z}-${x}-${y}.pbf`);
      let target;
      try {
        target = await download(`https://tiles.mapillary.com/maps/vtp/mly_map_feature_point/2/${z}/${x}/${y}?access_token=${encodeURIComponent(MLY_TOKEN)}`, file);
      } catch (e) {
        log('  Kachel übersprungen:', t, e.message);
        continue;
      }
      const vt = new VectorTile(new Pbf(fs.readFileSync(target)));
      const layer = vt.layers.point;
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.properties.value !== 'object--street-light') continue;
        const [lon, lat] = f.toGeoJSON(x, y, z).geometry.coordinates;
        if (!inArea(lon, lat)) continue;
        mlyGrid.add(lon, lat, [lon, lat]);
        mlyCount++;
      }
      if (++n % 10 === 0) log(`  Mapillary-Kacheln: ${n}/${tiles.size}`);
    }
    log('Auf Mapillary-Fotos erkannte Laternen im Gebiet:', mlyCount);
  } else log('Kein Mapillary-Token: erkannte Laternen werden übersprungen.');

  // 2c. Weitere Daten der Stadt Wien: Polizei, Taxistandplätze, öffentliche WCs, Baustellen
  const isWien = city.id === 'wien';
  const wienPolice = !isWien ? [] : readJson(await download(WFS + 'POLIZEIOGD', 'polizei.json')).features.filter((f) => inArea(...f.geometry.coordinates));
  const taxi = !isWien ? [] : readJson(await download(WFS + 'TAXIOGD', 'taxi.json'))
    .features.map((f) => {
      const c = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)];
      return { lon: +c[0].toFixed(5), lat: +c[1].toFixed(5), address: f.properties.ADRESSE, spaces: f.properties.STELLPLATZANZAHL ?? null };
    })
    .filter((t) => inArea(t.lon, t.lat));
  const wc = !isWien ? [] : readJson(await download(WFS + 'WCANLAGE2OGD', 'wc.json'))
    .features.filter((f) => f.properties.AKTIV_TXT !== 'NEIN')
    .map((f) => ({
      lon: +f.geometry.coordinates[0].toFixed(5),
      lat: +f.geometry.coordinates[1].toFixed(5),
      name: [f.properties.STRASSE, f.properties.ORTSANGABE].filter(Boolean).join(', '),
      hours: f.properties.OEFFNUNGSZEIT ?? null,
      note: f.properties.EINSCHRAENKUNGEN ?? null,
      accessible: /barrierefrei/i.test(`${f.properties.KATEGORIE ?? ''} ${f.properties.ICON_TXT ?? ''}`),
    }))
    .filter((w) => inArea(w.lon, w.lat));
  // Baustellen ändern sich laufend: immer frisch laden
  const worksRaw = [];
  for (const layer of isWien ? ['BAUSTELLENLINOGD', 'BAUSTELLENPKTOGD'] : []) {
    const res = await fetch(WFS + layer);
    if (!res.ok) continue;
    for (const f of (await res.json()).features) {
      const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
      if (!coords.some(([lon, lat]) => inArea(lon, lat))) continue;
      worksRaw.push({
        id: 'bs' + f.properties.OBJECTID,
        title: f.properties.BEZEICHNUNG,
        kind: f.properties.BEHINDERUNGSART ?? null,
        from: f.properties.OBJEKT_BEGINN?.slice(0, 10) ?? null,
        to: f.properties.OBJEKT_ENDE?.slice(0, 10) ?? null,
        coords: coords.map(([lon, lat]) => [+lon.toFixed(5), +lat.toFixed(5)]),
      });
    }
  }
  const worksGrid = new Grid(50);
  for (const w of worksRaw) {
    // Punkte entlang der Baustellenlinie alle ~10 m
    for (let i = 0; i < w.coords.length; i++) {
      const a = w.coords[i];
      const b = w.coords[i + 1] ?? a;
      const n = Math.max(1, Math.ceil(dist(a, b) / 10));
      for (let k = 0; k < n; k++) worksGrid.add(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, { id: w.id, at: [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] });
    }
  }
  if (isWien) log(`Stadt Wien: ${wienPolice.length} Polizei, ${taxi.length} Taxistandplätze, ${wc.length} WCs, ${worksRaw.length} Baustellen im Gebiet`);

  // 3. Öffi-Haltestellen: Wien aus den Daten der Stadt, Linz aus OpenStreetMap (siehe OSM-Durchlauf 3)
  const PRIO = { ubahn: 0, sbahn: 1, tram: 2, bus: 3 };
  const stopsByName = new Map();
  const addStop = (name, lon, lat, type, lines) => {
    if (!name || !inArea(lon, lat)) return;
    const b = bezirkAt([lon, lat]);
    if (!b || b.transit) return;
    // Gleichnamige Haltestellen in der Nähe zusammenfassen
    let list = stopsByName.get(name);
    if (!list) stopsByName.set(name, (list = []));
    let s = list.find((x) => dist([x.lon, x.lat], [lon, lat]) < 300);
    if (!s) list.push((s = { name, lon, lat, type, lines: new Set(), bezirk: b.nr, n: 0, sx: 0, sy: 0 }));
    if (PRIO[type] < PRIO[s.type]) s.type = type;
    lines.forEach((l) => s.lines.add(l));
    s.n++;
    s.sx += lon;
    s.sy += lat;
  };
  if (isWien) {
    const stopFile = await download(WFS + 'OEFFHALTESTOGD', 'haltestellen.json');
    const LTYP = { 4: 'ubahn', 5: 'sbahn', 1: 'tram', 2: 'bus', 3: 'bus', 9: 'tram', 10: 'bus', 11: 'bus', 12: 'bus', 13: 'bus' };
    for (const f of readJson(stopFile).features) {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      addStop(p.HTXT, lon, lat, LTYP[p.LTYP] ?? 'bus', (p.HLINIEN ?? '').split(',').map((l) => l.trim()).filter(Boolean));
    }
  }
  const finishStops = () =>
    [...stopsByName.values()].flat().map((s, i) => {
      const lines = [...s.lines].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
      return {
        id: (isWien ? 'st' : `${city.id}-st`) + i,
        name: s.name,
        type: s.type,
        lines,
        night: lines.some((l) => /^N\d/.test(l) || ((isWien || city.id === 'berlin') && /^U\d$/.test(l))),
        bezirk: s.bezirk,
        city: city.id,
        lon: +(s.sx / s.n).toFixed(5),
        lat: +(s.sy / s.n).toFixed(5),
      };
    });

  // Ungefähre Betriebszeiten (vereinfacht, ohne Feiertage).
  // Wien: U-Bahn bis ca. 0:30, in Nächten vor Samstag, Sonntag durchgehend; Nachtlinien ca. 0:30–5:00.
  // Linz: Straßenbahn und Bus ca. 5:00–0:30 (Nachtlinien am Wochenende hier nicht berücksichtigt).
  const STOP_HOURS =
    city.id === 'berlin'
      ? // Berlin: U-Bahn in Nächten vor Samstag und Sonntag durchgehend, sonst bis ca. 1 Uhr; Nachtbusse/Metro-Trams vereinfacht wie Tagbetrieb bis 1 Uhr
        {
          ubahn: 'Mo-Fr 04:30-24:00; Mo-Fr 00:00-01:00; Sa,Su 00:00-24:00',
          sbahn: 'Mo-Fr 04:30-24:00; Mo-Fr 00:00-01:00; Sa,Su 00:00-24:00',
          tram: 'Mo-Su 04:30-24:00; Mo-Su 00:00-01:00',
          bus: 'Mo-Su 04:30-24:00; Mo-Su 00:00-01:00',
        }
      : isWien
    ? {
        ubahn: 'Mo-Fr 05:00-24:00; Sa,Su 00:00-24:00; Mo-Fr 00:00-00:30',
        sbahn: 'Mo-Su 04:30-24:00; Mo-Su 00:00-00:30',
        tram: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
        bus: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
      }
    : {
        ubahn: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
        sbahn: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
        tram: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
        bus: 'Mo-Su 05:00-24:00; Mo-Su 00:00-00:30',
      };

  // 4. OpenStreetMap in drei Durchläufen
  const pbf = await download(PBF_URL[city.id], `${city.name}.osm.pbf`);

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
  const frontWays = []; // Geschäfte als Fläche (nur Umriss-Punkte)
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
    } else if (isFrontage(t)) {
      frontWays.push(item.refs);
      item.refs.forEach((r) => needed.add(r));
    }
  }
  log(`  ${roads.length} Wege, ${greenWays.length} Grünflächen-Teile, ${poiWays.length} Orte als Fläche`);

  log('OSM 3/3: Punkte');
  const coord = new Map();
  const pois = [];
  const frontPts = [];
  for await (const item of createOSMStream(pbf, { withInfo: false })) {
    if (!item.type) continue;
    if (item.type !== 'node') break;
    if (needed.has(item.id)) coord.set(item.id, [item.lon, item.lat]);
    if (item.tags && inArea(item.lon, item.lat)) {
      const cat = poiCategory(item.tags);
      if (cat) pois.push({ id: 'n' + item.id, cat, t: item.tags, lon: item.lon, lat: item.lat });
      if (isFrontage(item.tags)) frontPts.push([item.lon, item.lat]);
      // Linz: Haltestellen aus OpenStreetMap
      const t = item.tags;
      if (!isWien && t.name && (t.highway === 'bus_stop' || t.railway === 'tram_stop' || t.public_transport === 'platform' || t.railway === 'station' || t.railway === 'halt')) {
        const type =
          t.subway === 'yes' || t.station === 'subway' ? 'ubahn' : t.railway === 'station' || t.railway === 'halt' || t.train === 'yes' ? 'sbahn' : t.railway === 'tram_stop' || t.tram === 'yes' ? 'tram' : 'bus';
        addStop(t.name, item.lon, item.lat, type, (t.route_ref ?? '').split(/[;,]/).map((l) => l.trim()).filter(Boolean));
      }
    }
  }
  const stops = finishStops();
  log('Haltestellen:', stops.length);
  for (const refs of frontWays) {
    const pts = refs.map((r) => coord.get(r)).filter(Boolean);
    if (pts.length) frontPts.push([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
  }
  for (const w of poiWays) {
    if (isFrontage(w.t)) {
      const pts = w.refs.map((r) => coord.get(r)).filter(Boolean);
      if (pts.length) frontPts.push([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
    }
  }
  for (const w of poiWays) {
    const pts = w.refs.map((r) => coord.get(r)).filter(Boolean);
    if (!pts.length) continue;
    const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (inArea(lon, lat)) pois.push({ id: 'w' + w.id, cat: w.cat, t: w.t, lon, lat });
  }
  for (const f of wienPolice) {
    const [lon, lat] = f.geometry.coordinates;
    const osmTwin = pois.some((p) => p.cat === 'police' && dist([p.lon, p.lat], [lon, lat]) < 80);
    if (osmTwin) continue;
    pois.push({ id: 'pol' + f.properties.SE_SDO_ROWID, cat: 'police', t: { name: f.properties.NAME, source: 'stadt' }, lon, lat });
  }
  for (const s of stops) {
    const oh = STOP_HOURS[s.type] + (s.lines.some((l) => /^N\d/.test(l)) ? '; Mo-Su 00:00-05:00' : '');
    pois.push({ id: s.id, cat: 'transit', t: { name: s.name, opening_hours: oh, kind: s.type }, lon: s.lon, lat: s.lat });
  }
  log('  Orte (Lokale, Polizei, Stationen …):', pois.length);

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
  const frontGrid = new Grid(25);
  for (const fp of frontPts) if (inArea(fp[0], fp[1])) frontGrid.add(fp[0], fp[1], fp);
  log('Geschäfte/Lokale im Erdgeschoss:', frontPts.length);

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
      let mlyCovered = 0;
      if (mlyCount) for (const s of samples) if (mlyGrid.near(s[0], s[1]).some((l) => dist(l, s) <= 20)) mlyCovered++;
      const mlyCov = Math.round((mlyCovered / samples.length) * 100);
      const works = new Set();
      for (let k = 0; k < samples.length; k += 2) for (const w of worksGrid.near(samples[k][0], samples[k][1])) if (dist(w.at, samples[k]) <= 25) works.add(w.id);

      let f2 = flags;
      if (KIND[r.kind] >= KIND.pedestrian && inGreen(mid)) f2 |= F.PARK;
      else {
        // Weg direkt an einem Park (bis ca. 15 m daneben)
        const ox = 15 / MX;
        const oy = 15 / MY;
        if ([mid, samples[0], samples.at(-1)].some((s) => [[ox, 0], [-ox, 0], [0, oy], [0, -oy]].some(([dx, dy]) => inGreen([s[0] + dx, s[1] + dy]))))
          f2 |= F.PARK_NEAR;
      }

      // Geschäfte im Erdgeschoss pro 100 m
      const fronts = new Set();
      for (let k = 0; k < samples.length; k += 2)
        for (const fp of frontGrid.near(samples[k][0], samples[k][1])) if (dist(fp, samples[k]) <= FRONT_RADIUS) fronts.add(fp);
      const frontage = Math.round((fronts.size / Math.max(len, 50)) * 1000) / 10;

      const near = new Set();
      for (let k = 0; k < samples.length; k += 3)
        for (const pi of poiGrid.near(samples[k][0], samples[k][1]))
          if (dist([pois[pi].lon, pois[pi].lat], samples[k]) <= POI_RADIUS) near.add(pi);

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
      file.edges.push([a, b, Math.round(len * 10) / 10, KIND[r.kind], nameIdx, osmLit, lampCov, f2, geom, poiIds, mlyCov, [...works], frontage]);
      edgeCount++;
    }
  }
  log('Kanten gesamt:', edgeCount);

  // 7. Dateien schreiben
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const index = acc.index;
  index.attribution.push(
    isWien
      ? 'Datenquelle: Stadt Wien – data.wien.gv.at (CC BY 4.0): Bezirksgrenzen, Leuchtenstandorte, Haltestellen, Polizei, Taxistandplätze, öffentliche WCs, Baustellen'
      : city.id === 'berlin'
        ? 'Datenquelle: Geoportal Berlin (Datenlizenz Deutschland – Zero – 2.0): Ortsteile, öffentliche Beleuchtung'
        : city.id === 'zuerich'
          ? 'Datenquelle: Stadt Zürich Open Data (CC0): statistische Quartiere, öffentliche Beleuchtung'
        : 'Datenquelle: Stadt Linz – data.linz.gv.at (CC BY 4.0): Grenzen der statistischen Bezirke',
  );
  if (mlyCount) acc.mapillary = true;
  index.cities.push({
    id: city.id,
    name: city.name,
    transit: isWien,
    lamps: lampCount > 0,
    bbox: bboxOf(bezirke.filter((b) => !b.transit).flatMap((b) => [[b.bbox[0], b.bbox[1]], [b.bbox[2], b.bbox[3]]])).map((v) => +v.toFixed(5)),
  });
  for (const b of bezirke) {
    const file = files.get(b.nr);
    const poiList = [...file.pois].map((id) => {
      const p = poiById.get(id);
      return {
        id,
        cat: p.cat,
        name: p.t.name ?? null,
        oh: p.t.opening_hours ?? null,
        kind: p.t.kind ?? p.t.shop ?? p.t.amenity ?? p.t.tourism ?? null,
        ...(p.t.source ? { source: p.t.source } : {}),
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
    const fname = `${city.prefix}-${String(b.local).padStart(2, '0')}.json`;
    const json = JSON.stringify(out);
    fs.writeFileSync(path.join(OUT, fname), json);
    index.bezirke.push({
      nr: b.nr,
      name: b.name,
      city: city.id,
      transit: b.transit,
      file: fname,
      bytes: json.length,
      bbox: b.bbox.map((v) => +v.toFixed(5)),
      outline: simplify(b.poly[0], 15).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]),
    });
    log(`  ${fname}: ${file.edges.length} Kanten, ${poiList.length} Orte, ${(json.length / 1024).toFixed(0)} KB`);
  }
  acc.stops.push(...stops);
  if (isWien) acc.extras = { generated: index.generated, taxi, wc, works: worksRaw };
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const acc = {
    index: { generated: new Date().toISOString(), attribution: ['© OpenStreetMap-Mitwirkende (ODbL)'], cities: [], bezirke: [] },
    stops: [],
    extras: null,
    mapillary: false,
  };
  for (const city of CITIES) await buildCity(city, acc);
  if (acc.mapillary) acc.index.attribution.push('Erkannte Straßenlaternen: © Mapillary-Mitwirkende (CC BY-SA 4.0)');
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(acc.index));
  fs.writeFileSync(path.join(OUT, 'haltestellen.json'), JSON.stringify(acc.stops));
  // Zusatzdaten der Stadt Wien (klein, für alle Bezirke gemeinsam)
  const extras = acc.extras ?? { generated: acc.index.generated, taxi: [], wc: [], works: [] };
  fs.writeFileSync(path.join(OUT, 'extras.json'), JSON.stringify(extras));
  log(`  extras.json: ${(JSON.stringify(extras).length / 1024).toFixed(0)} KB`);
  log('fertig →', path.relative(ROOT, OUT));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
