import { test, expect } from '@playwright/test';
import { loginAs, signupAs, adminEmail, uid } from './accounts';

test.beforeEach(async ({ page }) => {
  await loginAs(page, adminEmail);
  await expect(page).toHaveURL(/\/app$/);
});

test('admin team view lists staff and customers', async ({ page }) => {
  await page.goto('/app/team');
  await expect(page.getByText('Staff Member')).toBeVisible();
  await expect(page.getByText('Test Customer')).toBeVisible();
});

test('admin creates a staff account and gets a temp password', async ({ page }) => {
  const email = `newstaff${uid()}@e2e.dev`;
  await page.goto('/app/new/staff');
  await page.getByPlaceholder('agent@agency.com').fill(email);
  await page.getByPlaceholder('e.g. Chipo Dube').fill('New Agent');
  await page.locator('form').getByRole('button', { name: 'Create staff account' }).click();
  await expect(page.getByText('Temporary password')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test('admin links a freshly signed-up customer by email', async ({ page }) => {
  const email = `linkme${uid()}@e2e.dev`;
  const customerName = `Link Me ${uid()}`;
  // Self-signup first (requires signed-out state)
  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signupAs(page, 'Link Me', email);
  await expect(page).toHaveURL(/\/pending$/);
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Link as admin
  await loginAs(page, adminEmail);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/new/customer');
  await page.getByPlaceholder('e.g. Blessing Chiwa').fill(customerName);
  await page.getByPlaceholder('+263...').fill('+263779999999');
  await page.locator('form').getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByRole('heading', { name: 'Customer created' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to team' }).click();
  const customer = page.locator('div.card').filter({ has: page.getByText(customerName, { exact: true }) });
  await customer.getByRole('button', { name: 'Link access' }).click();
  await page.getByPlaceholder('customer@example.com').fill(email);
  await page.locator('form').getByRole('button', { name: 'Link customer' }).click();
  await expect(page.getByRole('heading', { name: 'Customer linked' })).toBeVisible();
});

test('admin can ensure the stage and tax baseline', async ({ page }) => {
  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Ensure stage + tax baseline' }).click();
  await expect(page.getByText(/Baseline OK/)).toBeVisible();
});
