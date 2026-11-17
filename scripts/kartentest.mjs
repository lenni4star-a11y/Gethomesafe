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
  ['sanfrancisco', [-122.42, 37.775]],
];
const ZOOMS = [10.5, 12, 13.5, 15, 16.5];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.log('Konsole:', m.text()));
await page.clock.setFixedTime(new Date('2026-11-18T23:30:00+01:00'));
await page.goto(BASE + '?kartentest', { waitUntil: 'networkidle' });
const skip = page.getByText('Überspringen');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForFunction(() => window.__gwMap?.loaded(), null, { timeout: 60000 });

for (const [city, center] of CITIES) {
  await page.selectOption('.city-pick-select', city).catch((e) => console.log('Stadt', city, e.message));
  await page.waitForTimeout(1500);
  // warten, bis die Lichtpunkte geladen sind
  await page
    .waitForFunction(() => (window.__gwMap.getSource('lights')?._data?.features?.length ?? 0) > 1000, null, { timeout: 60000 })
    .catch(() => console.log('keine Lichtpunkte für', city));
  const n = await page.evaluate(() => window.__gwMap.getSource('lights')?._data?.features?.length ?? 0);
  console.log(city, 'Lichtpunkte:', n);
  for (const z of ZOOMS) {
    await page.evaluate(([c, zz]) => window.__gwMap.jumpTo({ center: c, zoom: zz }), [center, z]);
    await page.waitForFunction(() => window.__gwMap.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${city}-z${String(z).replace('.', '_')}.png` });
  }
}
await browser.close();
