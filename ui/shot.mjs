// Screenshots der veröffentlichten Version (lokal gebaut) für die Prüfung
import { chromium, devices } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone SE'], geolocation: { latitude: 52.5051, longitude: 13.4482 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto('http://localhost:4173/');
await page.waitForTimeout(3000);
const skip = page.getByText('Überspringen');
if (await skip.count()) await skip.first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/1-start.png` });
await page.locator('.collapsed-main').first().click().catch(() => {});
await page.waitForTimeout(600);
await page.selectOption('select.city-select.inline', 'berlin', { timeout: 10000 }).catch((e) => console.log('city', e.message));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/2-berlin.png` });

await page.waitForTimeout(500);
const inputs = page.locator('input[type=search]');
async function pick(i, q) {
  await inputs.nth(i).fill(q);
  await page.waitForTimeout(2500);
  const opt = page.locator('.suggestions [role=option] button').first();
  await opt.evaluate((b) => b.click()).catch((e) => console.log('pick', q, e.message));
  await page.waitForTimeout(800);
}
await pick(0, 'Warschauer Str');
await pick(1, 'Hermannplatz');
await page.waitForTimeout(12000);
await page.screenshot({ path: `${out}/3-route.png` });
console.log('tabs', await page.locator('.mode-tab').count(), 'message', await page.locator('.message').allTextContents());
await page.getByText('Weg ansehen').count();
const sheet = page.locator('.sheet');
await page.locator('.collapsed-main').first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/4-sheet.png` });
for (const [name, file] of [['Zu Fuß', '5-walk'], ['Taxi', '6-taxi'], ['Roller', '7-roller']]) {
  await page.locator('.mode-tab', { hasText: name }).click().catch((e) => console.log(name, e.message));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${file}.png` });
}
await page.locator('.mode-tab', { hasText: 'Öffis' }).click().catch(() => {});
await page.waitForTimeout(800);
await page.locator('.sheet').evaluate((e) => (e.scrollTop = 400)).catch(() => {});
await page.screenshot({ path: `${out}/8-oeffis-detail.png` });
await page.getByRole('button', { name: /SOS|Notruf|Hilfe/ }).first().click().catch((e) => console.log('sos', e.message));
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/9-sos.png` });
await browser.close();
