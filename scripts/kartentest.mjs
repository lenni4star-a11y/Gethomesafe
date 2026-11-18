// Testfotos der Licht-Ansicht: App nachts öffnen, je Stadt mehrere Zoomstufen fotografieren.
// Läuft in GitHub Actions (Ablauf „Kartentest“), Ergebnis als Download unter „Artifacts“.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = 'kartentest';
fs.mkdirSync(OUT, { recursive: true });
const CITIES = [
  ['wien', [16.37, 48.208]],
  ['linz', [14.29, 48.306]],
  ['berlin', [13.405, 52.515]],
  ['zuerich', [8.54, 47.377]],
  ['muenchen', [11.576, 48.137]],
  ['koeln', [6.958, 50.94]],
  ['frankfurt', [8.682, 50.111]],
];
const ZOOMS = [10.5, 12, 13.5, 15, 16.5];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('console', (m) => m.type() === 'error' && console.log('Konsole:', m.text()));
await page.clock.setFixedTime(new Date('2026-11-18T23:30:00+01:00'));
console.log('öffne', BASE);
await page.goto(BASE + '?kartentest', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/00-start.png` });
const skip = page.getByText('Überspringen');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForFunction(() => !!window.__gwMap, null, { timeout: 30000 }).catch(() => console.log('keine Karte gefunden'));
console.log('Karte da');

for (const [city, center] of CITIES) {
  await page.selectOption('.city-pick-select', city).catch((e) => console.log('Stadt', city, e.message));
  await page.waitForTimeout(1500);
  // warten, bis die Lichtpunkte geladen sind
  await page
    .waitForFunction(() => (window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0) > 100, null, { timeout: 25000 })
    .catch(() => console.log('keine Lichtpunkte für', city));
  const n = await page.evaluate(() => window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0);
  console.log(city, 'Felder:', n);
  for (const z of ZOOMS) {
    await page.evaluate(([c, zz]) => { window.__gwMap.jumpTo({ center: c, zoom: zz }); }, [center, z]);
    await page.waitForFunction(() => window.__gwMap.areTilesLoaded(), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${city}-z${String(z).replace('.', '_')}.png`, timeout: 60000 }).catch((e) => console.log('Foto', city, z, e.message));
    console.log('Foto', city, z);
  }
}
// Stilwechsel ohne Neuladen: um 23:30 Wiener Zeit ist in San Francisco Nachmittag → helle Karte, keine Lichter
const styleName = () => page.evaluate(() => (window.__gwMap.getStyle().sprite + '').replace(/.*sprites?\/(ofm_f384\/)?/, '') || '?');
const SF = [-122.42, 37.775];
await page.selectOption('.city-pick-select', 'sanfrancisco');
await page.waitForTimeout(8000);
await page.evaluate((c) => { window.__gwMap.jumpTo({ center: c, zoom: 12 }); }, SF);
await page.waitForTimeout(3000);
console.log('Stil San Francisco (Tag):', await styleName());
await page.screenshot({ path: `${OUT}/stil-sanfrancisco-tag.png`, timeout: 60000 }).catch(() => {});
// eine Stunde später in San Francisco Nacht: Uhr vorstellen, auf den Minutentakt der App warten
await page.clock.setFixedTime(new Date('2026-11-18T08:30:00+01:00'));
await page.waitForTimeout(65000);
console.log('Stil San Francisco (Nacht):', await styleName());
await page
  .waitForFunction(() => (window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0) > 100, null, { timeout: 25000 })
  .catch(() => console.log('keine Lichtpunkte für sanfrancisco'));
for (const z of ZOOMS) {
  await page.evaluate(([c, zz]) => { window.__gwMap.jumpTo({ center: c, zoom: zz }); }, [SF, z]);
  await page.waitForFunction(() => window.__gwMap.areTilesLoaded(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/sanfrancisco-z${String(z).replace('.', '_')}.png`, timeout: 60000 }).catch(() => {});
}
// zurück nach Wien: dort ist es um 8:30 Tag → helle Karte
await page.selectOption('.city-pick-select', 'wien');
await page.waitForTimeout(8000);
console.log('Stil Wien (Tag):', await styleName());
await page.screenshot({ path: `${OUT}/stil-wien-tag.png`, timeout: 60000 }).catch(() => {});

await browser.close();
