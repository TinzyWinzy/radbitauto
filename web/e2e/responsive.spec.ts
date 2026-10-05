import { test, expect, type Page } from '@playwright/test';
import { loginAs, adminEmail, customerEmail, platformEmail } from './accounts';

async function checkLayout(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('main *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && rect.right > innerWidth + 1 && getComputedStyle(element).position !== 'fixed' && !element.closest('.rail-scroll');
    }).slice(0, 5).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 60), width: element.getBoundingClientRect().width })),
  }));
  expect(overflow.pageWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.elements, JSON.stringify(overflow)).toEqual([]);
  const splitTotals = await page.locator('.dashboard-totals dd .font-mono').evaluateAll(elements => elements.filter(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1;
  }).map(element => element.textContent));
  expect(splitTotals, 'Financial totals must stay on one readable line').toEqual([]);
  if (overflow.viewport < 768) {
    const smallInputs = await page.locator('input.field,select.field,textarea.field').evaluateAll(elements => elements.filter(element => getComputedStyle(element).display !== 'none' && parseFloat(getComputedStyle(element).fontSize) < 16).length);
    expect(smallInputs, 'Phone form controls must avoid automatic focus zoom').toBe(0);
    const tinyButtons = await page.locator('.btn-primary,.btn-ghost,.btn-danger').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width && element.getBoundingClientRect().height < 44).map(element => element.textContent));
    expect(tinyButtons, 'Primary form actions need comfortable tap targets').toEqual([]);
    const tinyWorkspaceButtons = await page.locator('.app-content button').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().width && element.getBoundingClientRect().height < 44).map(element => element.textContent?.slice(0, 40)));
    expect(tinyWorkspaceButtons, 'Workspace controls need comfortable tap targets').toEqual([]);
  }
}

for (const width of [320, 390, 768, 1440]) {
  test(`public pages stay readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/login', '/login?intent=agency&mode=signup', '/help']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await checkLayout(page);
      if (path === '/' || path === '/login') await page.screenshot({ path: `test-results/responsive-public-${path === '/' ? 'landing' : 'login'}-${width}.png`, fullPage: true });
      if (path === '/' && (width === 390 || width === 1440)) await page.screenshot({ path: `test-results/pwa-${width === 390 ? 'mobile' : 'desktop'}.png` });
    }
  });

  test(`agency screens stay usable at ${width}px`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, adminEmail);
    await expect(page).toHaveURL(/\/app$/);
    for (const path of ['/app', '/app/team', '/app/operations', '/app/account', '/app/new/customer', '/app/new/staff', '/app/new/vehicle', '/app/new/case']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      if (path === '/app') await expect(page.locator('.dashboard-totals')).not.toContainText('…');
      if (path === '/app/operations') await expect(page.getByText('Loading agency report…')).toHaveCount(0);
      await checkLayout(page);
      await page.screenshot({ path: `test-results/responsive-agency-${path.split('/').filter(Boolean).join('-')}-${width}.png`, fullPage: true });
    }
    await page.goto('/app');
    await page.getByText('E20001', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'E20001', exact: true })).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: `test-results/responsive-agency-case-${width}.png`, fullPage: true });
    if (width < 768) {
      const nav = page.locator('.mobile-navigation');
      await expect(nav).toBeVisible();
      expect(await nav.locator('a').count()).toBe(5);
      await nav.getByRole('link', { name: 'Settings' }).click();
      await expect(page).toHaveURL(/\/app\/account$/);
    }
  });

  test(`customer screens stay usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginAs(page, customerEmail);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('2019 Toyota Hilux').first()).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: `test-results/responsive-customer-dashboard-${width}.png`, fullPage: true });
    await page.getByText('Case E20001').first().click();
    await expect(page.getByRole('heading', { name: 'E20001', exact: true })).toBeVisible();
    await checkLayout(page);
    await page.screenshot({ path: `test-results/responsive-customer-case-${width}.png`, fullPage: true });
    await page.goto('/app/account');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await checkLayout(page);
  });
}

test('platform controls fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await loginAs(page, platformEmail);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText('view tenant as')).toBeVisible();
  await checkLayout(page);
  await page.screenshot({ path: 'test-results/responsive-platform-320.png', fullPage: true });
});

test('agency layout supports a phone in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await loginAs(page, adminEmail);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.dashboard-totals')).not.toContainText('…');
  await checkLayout(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await checkLayout(page);
});
