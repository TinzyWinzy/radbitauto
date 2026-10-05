import { test, expect } from '@playwright/test';
import { loginAs, customerEmail, PASS } from './accounts';

test.beforeEach(async ({ page }) => {
  await loginAs(page, customerEmail);
  await expect(page).toHaveURL(/\/app$/);
});

test('WhatsApp case link returns to that case after customer sign-in', async ({ page }) => {
  await page.getByText('Case E20001').first().click();
  const caseUrl = page.url();
  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(caseUrl);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByPlaceholder('you@example.com').fill(customerEmail);
  await page.getByPlaceholder('••••••••').fill(PASS);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(caseUrl);
  await expect(page.getByRole('heading', { name: 'E20001', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Supplier purchase' })).toHaveCount(0);
});

test('customer dashboard leads with vehicle identity and status', async ({ page }) => {
  await expect(page.getByText('2019 Toyota Hilux').first()).toBeVisible();
  await expect(page.getByText('Case E20001').first()).toBeVisible();
  await expect(page.getByText('In transit').first()).toBeVisible();
  await expect(page.getByText('Last updated').first()).toBeVisible();
  await expect(page.getByText('$1,000.00').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await expect(page.getByText('Next step:', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Total quoted', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Confirmed payments', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/customer-dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/customer-dashboard-mobile.png', fullPage: true });
});

test('customer case detail puts status answer and help before details', async ({ page }) => {
  await page.getByText('E20001').first().click();
  await expect(page).toHaveURL(/\/app\/cases\//);
  const status = page.getByRole('region', { name: 'Current case status' });
  await expect(status).toBeVisible();
  await expect(status.getByText('In transit').first()).toBeVisible();
  await expect(status.getByText('Next step:')).toBeVisible();
  await expect(page.getByText('Step 8 of 14')).toBeVisible();
  await expect(page.getByText('Next:')).toBeVisible();
  const hero = page.locator('section[aria-label="Import summary"]');
  await expect(hero.getByText('$1,000.00')).toBeVisible();
  const wa = page.getByRole('link', { name: 'WhatsApp about this case' });
  await expect(wa).toBeVisible();
  expect(await wa.getAttribute('href')).toContain('E20001');
  const contactWa = page.getByRole('link', { name: 'WhatsApp agent' });
  await expect(contactWa).toBeVisible();
  expect(await contactWa.getAttribute('href')).toContain('E20001');
  await expect(page.getByRole('link', { name: 'Go to enquiries' })).toHaveAttribute('href', '#enquiries');
});

test('customer can send an enquiry to the agent', async ({ page }) => {
  await page.getByText('E20001').first().click();
  await expect(page).toHaveURL(/\/app\/cases\//);
  const msg = `When will my car arrive ${Date.now()}?`;
  const box = page.getByPlaceholder('e.g. When will my car ship?');
  await box.fill(msg);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText('Enquiry sent to your agent.')).toBeVisible();
  await expect(box).toHaveValue('');
  await expect(page.locator('p', { hasText: msg })).toBeVisible();
});

test('customer mobile navigation is a two-column grid at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.locator('nav[aria-label="Primary"]:visible');
  await expect(nav.getByRole('link')).toHaveCount(2);
  await expect(nav.getByRole('link', { name: 'My vehicles' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Account' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Team' })).toHaveCount(0);
  await expect(page.getByText('2019 Toyota Hilux').first()).toBeVisible();
});
