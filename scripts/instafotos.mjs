// Bilder der Licht-Ansicht für Instagram (1080 × 1350, ohne App-Bedienelemente).
// Läuft in GitHub Actions (Ablauf „Instagram-Fotos“), Ergebnis im Zweig kartentest-fotos unter insta/.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = 'kartentest/insta';
fs.mkdirSync(OUT, { recursive: true });
const FAR = [
  ['wien', [16.37, 48.205], 10.7],
  ['berlin', [13.405, 52.51], 10.1],
  ['muenchen', [11.56, 48.14], 10.5],
  ['zuerich', [8.53, 47.38], 11.1],
  ['frankfurt', [8.67, 50.12], 10.7],
  ['koeln', [6.96, 50.94], 10.5],
  ['linz', [14.3, 48.29], 11.2],
];
const ZOOM_IN = [11.6, 13.2, 15, 16.8];
const DOM = [16.3725, 48.2085];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 432, height: 540 }, deviceScaleFactor: 2.5 });
await page.clock.setFixedTime(new Date('2026-11-18T23:30:00+01:00'));
await page.goto(BASE + '?kartentest', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
const skip = page.getByText('Überspringen');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForFunction(() => !!window.__gwMap, null, { timeout: 30000 });

async function clean() {
  await page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas');
    for (const el of document.body.querySelectorAll('*')) {
      if (el === canvas || el.contains(canvas)) continue;
      if (canvas.parentElement && canvas.parentElement.contains(el) && el.closest('.maplibregl-canvas-container')) continue;
      el.style.visibility = 'hidden';
    }
  });
}
async function shot(name, center, zoom) {
  await page.evaluate(([c, z]) => { window.__gwMap.jumpTo({ center: c, zoom: z }); }, [center, zoom]);
  await page.waitForFunction(() => window.__gwMap.areTilesLoaded(), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 90000 }).catch((e) => console.log('Foto', name, e.message));
  console.log('Foto', name);
}
async function city(id) {
  await page.evaluate(() => document.querySelectorAll('body *').forEach((el) => (el.style.visibility = '')));
  await page.selectOption('.city-pick-select', id);
  await page.waitForTimeout(2000);
  await page
    .waitForFunction(() => (window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0) > 100, null, { timeout: 30000 })
    .catch(() => console.log('keine Lichtpunkte für', id));
  await clean();
}

for (const [id, c, z] of FAR) {
  await city(id);
  await shot(`${id}-fern`, c, z);
}
await city('wien');
for (const [i, z] of ZOOM_IN.entries()) await shot(`wien-zoom-${i + 1}`, DOM, z);

// San Francisco: dort ist es um 8:30 Wiener Zeit Nacht
await page.clock.setFixedTime(new Date('2026-11-19T08:30:00+01:00'));
await city('sanfrancisco');
await page.waitForTimeout(65000);
await page
  .waitForFunction(() => (window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0) > 100, null, { timeout: 30000 })
  .catch(() => console.log('keine Lichtpunkte für sanfrancisco'));
await clean();
await shot('sanfrancisco-fern', [-122.44, 37.765], 11.4);
await browser.close();
