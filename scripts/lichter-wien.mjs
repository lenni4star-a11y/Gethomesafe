// Nur die Lichtpunkte für Wien neu bauen (alle ca. 173.000 Leuchten der Stadt Wien, CC BY 4.0),
// ohne den ganzen Datenbau. Gleiches Format wie writeLights in build-data.mjs.
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&srsName=EPSG:4326&outputFormat=json&typeName=ogdwien:LAMPENTAUSCHOGD&propertyName=SHAPE';
const res = await fetch(URL);
if (!res.ok) throw new Error('Leuchten Wien: ' + res.status);
const data = await res.json();
const seen = new Set();
const q = [];
for (const f of data.features) {
  const [x, y] = f.geometry.coordinates;
  const p = [Math.round(x * 1e5), Math.round(y * 1e5)];
  const k = p[0] + ',' + p[1];
  if (seen.has(k)) continue;
  seen.add(k);
  q.push(p);
}
q.sort((a, b) => Math.floor(a[1] / 200) - Math.floor(b[1] / 200) || a[0] - b[0] || a[1] - b[1]);
const d = [];
let px = 0;
let py = 0;
for (const [x, y] of q) {
  d.push(x - px, y - py);
  px = x;
  py = y;
}
const out = path.join('public', 'data', 'lichter-wien.json');
fs.writeFileSync(out, JSON.stringify({ v: 1, scale: 1e5, n: q.length, d }));
console.log(`${out}: ${q.length} Lichtpunkte`);
