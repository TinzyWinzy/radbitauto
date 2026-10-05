import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = 'https://studio-285787437-bc95b.web.app';
await mkdir('release-evidence', { recursive: true });
const browser = await chromium.launch();
const evidence = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 768, height: 1024 }], ['mobile', { width: 390, height: 844 }], ['small-phone', { width: 320, height: 740 }]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base); assert.equal(response.status(), 200);
    assert.match(response.headers()['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(response.headers()['x-content-type-options'], 'nosniff');
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    await page.getByText(/vehicles? matching your search/).waitFor();
    const heroArt = page.locator('.automotive-hero-art img');
    await heroArt.waitFor();
    await heroArt.evaluate(image => image.decode());
    assert.equal(await heroArt.evaluate(image => image.naturalWidth > 0), true);
    await page.getByRole('heading', { name: 'Solo', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Dealer', exact: true }).waitFor();
    const signup = page.getByRole('link', { name: 'Create your agency workspace' });
    await signup.waitFor();
    assert.equal(await signup.getAttribute('href'), '/login?intent=agency&mode=signup');
    await page.screenshot({ path: `release-evidence/live-${name}.png`, fullPage: true });
    if (name === 'desktop' || name === 'mobile') {
      await page.locator('.automotive-hero-art').screenshot({ path: `release-evidence/live-hero-${name}.png` });
      await page.locator('#dealers').screenshot({ path: `release-evidence/live-dealers-${name}.png` });
    }
    const layout = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(el => ({ tag: el.tagName, classes: el.className })) }));
    assert.equal(layout.scroll <= layout.width, true, JSON.stringify(layout));
    await page.goto(`${base}/login`); await page.getByPlaceholder('you@example.com').waitFor();
    await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor();
    await page.screenshot({ path: `release-evidence/live-login-${name}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(`${base}/help`); await page.getByRole('heading', { name: 'Support, privacy and service information' }).waitFor();
    assert.equal(await page.locator('a[href="mailto:brandontinoz@gmail.com"]').count(), 1);
    await page.goto(`${base}/app/cases/release-check`); await page.waitForURL(/\/login\?next=/);
    await page.goto(`${base}/app/purchases/release-check`); await page.waitForURL(/\/login\?next=/);
    await page.goto(`${base}/app/billing`); await page.waitForURL(/\/login(?:\?|$)/);
    await page.goto(`${base}/invite/${'0'.repeat(64)}`);
    await page.getByRole('alert').filter({ hasText: 'This invitation is unavailable' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Create my account' }).count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    evidence.push(`${name}: landing, login, support and authenticated case-link redirect passed; no JavaScript errors or horizontal overflow`);
    await context.close();
  }
  const context = await browser.newContext();
  const catalogue = await context.request.post('https://us-central1-studio-285787437-bc95b.cloudfunctions.net/publicVehicleCatalogue', { data: { data: {} } });
  assert.equal(catalogue.status(), 200);
  const catalogueData = (await catalogue.json()).result;
  assert.ok(Array.isArray(catalogueData.stock));
  for (const listing of catalogueData.stock) assert.deepEqual(Object.keys(listing).sort(), ['id','title','location','askingPriceCents','photos','dealerName','slug'].sort());
  evidence.push('Public vehicle catalogue loads and exposes only explicit listing fields');
  const manifest = await context.request.get(`${base}/manifest.webmanifest`); assert.equal(manifest.status(), 200);
  const manifestData = await manifest.json();
  assert.equal(manifestData.display, 'standalone');
  assert.equal(manifestData.theme_color, '#f3f0e8');
  assert.equal(manifestData.background_color, '#f3f0e8');
  assert.equal(manifestData.orientation, 'any');
  const sw = await context.request.get(`${base}/sw.js`); assert.equal(sw.status(), 200); assert.match(sw.headers()['cache-control'], /no-cache/);
  const protectedNames=['registerAgency', 'createInvitation', 'agencyReport', 'correctPayment', 'claimPlatformAdmin', 'verifyDocument', 'dashboardOverview', 'dealershipWorkspace', 'saveDealerLead', 'addDealerStock', 'reserveDealerStock', 'updateDealerSale', 'publishDealerStock','convertDealerLead','customerRetailPurchases','dealerSaleDetails','issueDealerSaleDocument','updateDealerStockDetails','createDealerAcquisition','updateDealerAcquisition','dealerAcquisitionDetails','attachDealerStockPhoto','recordImportDealResult','importDealResults','recordPayment','listInvitations','revokeInvitation','bulkImportRecords'];
  protectedNames.push('subscriptionOverview', 'requestSubscriptionPlan', 'exportAgencyRecords', 'agencyUsageHistory', 'logAgencySupport', 'platformSubscriptionReport', 'setAgencyAccess');
  for (const name of protectedNames) {
    const response = await context.request.post(`https://us-central1-studio-285787437-bc95b.cloudfunctions.net/${name}`, { data: { data: name === 'dealerSaleDetails' ? { saleId: 'release-check' } : {} } });
    assert.equal(response.status(), 401, `${name}: ${await response.text()}`);
    assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
  }
  evidence.push(`PWA manifest, service-worker cache headers and ${protectedNames.length} production callable authentication fences passed`);
  await context.close();
  await writeFile('release-evidence/live-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), url: base, evidence }, null, 2));
  console.log(evidence.join('\n'));
} finally { await browser.close(); }



