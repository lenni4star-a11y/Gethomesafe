// Kameraflug für ein Instagram-Reel: von ganz Wien bei Nacht hinein bis zu den Laternen am Stephansdom.
// Nimmt Einzelbilder (1080 × 1920) aus der echten App auf; der Ablauf „Zoomfilm“ macht daraus zoomfilm.mp4.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const OUT = 'kartentest/zoomfilm';
fs.mkdirSync(OUT + '/bilder', { recursive: true });
const FRAMES = Number(process.env.FRAMES ?? 240);
const FROM = { c: [16.37, 48.205], z: 10.6 };
const TO = { c: [16.3725, 48.2085], z: 17.3 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
await page.clock.setFixedTime(new Date('2026-11-18T23:30:00+01:00'));
await page.goto(BASE + '?kartentest', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
const skip = page.getByText('Überspringen');
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForFunction(() => !!window.__gwMap, null, { timeout: 30000 });
await page.selectOption('.city-pick-select', 'wien').catch(() => {});
await page.waitForFunction(() => (window.__gwMap.getSource('lights-cells')?._data?.features?.length ?? 0) > 100, null, { timeout: 40000 });
// Bedienelemente ausblenden, nur die Karte bleibt
await page.evaluate(() => {
  const canvas = document.querySelector('.maplibregl-canvas');
  for (const el of document.body.querySelectorAll('*')) {
    if (el === canvas || el.contains(canvas) || el.closest('.maplibregl-canvas-container')) continue;
    el.style.visibility = 'hidden';
  }
});

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
for (let i = 0; i < FRAMES; i++) {
  const t = ease(i / (FRAMES - 1));
  const z = FROM.z + (TO.z - FROM.z) * t;
  // Mittelpunkt wandert so, dass der Dom im Bild bleibt
  const k = Math.pow(t, 0.6);
  const c = [FROM.c[0] + (TO.c[0] - FROM.c[0]) * k, FROM.c[1] + (TO.c[1] - FROM.c[1]) * k];
  await page.evaluate(([cc, zz]) => { window.__gwMap.jumpTo({ center: cc, zoom: zz }); }, [c, z]);
  await page.waitForFunction(() => window.__gwMap.areTilesLoaded(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/bilder/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92, timeout: 60000 });
  if (i % 20 === 0) console.log('Bild', i, 'Zoom', z.toFixed(2));
}
await browser.close();
