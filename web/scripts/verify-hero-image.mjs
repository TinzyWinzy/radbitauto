import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const base = process.env.RELEASE_BASE_URL ?? 'https://studio-285787437-bc95b.web.app';
const browser = await chromium.launch();
const evidence = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(base)).status(), 200);
    assert.equal(await page.title(), 'Radbit Auto');
    await page.getByRole('link', { name: /Radbit Auto Stock\. Sales\. Imports\./ }).waitFor();
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    const photo = page.locator('.automotive-hero-art img');
    await photo.evaluate(image => image.decode());
    const image = await photo.evaluate(image => ({ source: image.currentSrc, width: image.naturalWidth, ratio: image.clientWidth / image.clientHeight }));
    assert.match(image.source, /vehicle-journey-\d+\.webp$/);
    assert.ok(image.width > 0);
    assert.ok(Math.abs(image.ratio - 4/3) < 0.02);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `release-evidence/photo-landing-${width}.png`, fullPage: true });
    await page.locator('.automotive-hero-art').screenshot({ path: `release-evidence/photo-hero-${width}.png` });
    await page.getByRole('link', { name: 'Browse available cars', exact: true }).click();
    assert.ok(page.url().endsWith('#cars'));
    await page.getByRole('link', { name: 'Create your agency workspace', exact: true }).click();
    await page.waitForURL(/\/login\?intent=agency&mode=signup$/);
    assert.equal(errors.length, 0, errors.join('\n'));
    evidence.push({ viewport: width, ...image, overflow: false, browsingAndSignup: 'passed' });
    await context.close();
  }
  const context = await browser.newContext();
  const manifest = await (await context.request.get(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.name, 'Radbit Auto');
  assert.equal(manifest.short_name, 'Radbit Auto');
  for (const asset of [...manifest.icons, ...manifest.screenshots]) {
    assert.match(asset.src, /radbit-auto/);
    assert.equal((await context.request.get(`${base}${asset.src}`)).status(), 200);
  }
  const page = await context.newPage();
  await page.goto(`${base}/login?intent=agency&mode=signup`);
  await page.getByRole('link', { name: 'Radbit Auto', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Create your owner account' }).waitFor();
  await page.goto(`${base}/help`);
  await page.getByText(/Radbit Auto is a vehicle sales and import workspace/).waitFor();
  await context.close();
  await writeFile('release-evidence/photo-hero-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence }, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
