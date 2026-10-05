import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const base = process.env.RELEASE_BASE_URL ?? 'http://127.0.0.1:5190';
const browser = await chromium.launch();
const results = [];
async function offer(page, outcome = 'accepted', fail = false) {
  await page.evaluate(({ outcome, fail }) => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.installPromptCalls = 0;
    event.prompt = async () => { window.installPromptCalls++; if (fail) throw new Error('Unavailable'); };
    event.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, { outcome, fail });
}
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(base);
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    await offer(page);
    const panel = page.getByRole('complementary', { name: 'Install Radbit Auto' });
    await panel.waitFor();
    assert.equal(await page.evaluate(() => window.installPromptCalls), 0, 'Native prompt must require a click');
    assert.equal(await panel.evaluate(el => getComputedStyle(el).position), 'static');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await panel.scrollIntoViewIfNeeded?.();
    await panel.screenshot({ path: `release-evidence/install-panel-${width}.png` });
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await page.reload();
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    await offer(page);
    assert.equal(await panel.count(), 0, 'Dismissal must persist across reload');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/login`);
    await page.getByRole('link', { name: 'Radbit Auto', exact: true }).waitFor();
    await offer(page);
    assert.equal(await panel.count(), 0, 'Never show on login');
    await page.goto(base);
    await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
    await offer(page);
    await page.getByRole('button', { name: 'Install app', exact: true }).click();
    await panel.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.installPromptCalls), 1);
    results.push({ width, flowLayout: 'passed', noAutomaticPrompt: 'passed', persistentDismissal: 'passed', loginSuppression: 'passed', install: 'passed' });
    await context.close();
  }
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('heading', { name: /Find your next car/ }).waitFor();
  await offer(page, 'accepted', true);
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Installation couldn’t open' }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.getByRole('complementary', { name: 'Install Radbit Auto' }).waitFor({ state: 'detached' });
  await context.close();
  const ios = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const iosPage = await ios.newPage();
  await iosPage.goto(base);
  await iosPage.getByText('In Safari, tap Share, then Add to Home Screen.').waitFor();
  assert.equal(await iosPage.getByRole('button', { name: 'Install app', exact: true }).count(), 0);
  await ios.close();
  await writeFile('release-evidence/install-panel-verification.json', JSON.stringify({ base, results, installationFailure: 'passed', appInstalled: 'passed', iosInstructions: 'passed' }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
