import { test, expect } from '@playwright/test';
import { loginAs, adminEmail, customerEmail, PASS, uid } from './accounts';

const SHOT = '../guidebook/shots';
const MOBILE = { width: 390, height: 900 };

test('guidebook public shots: signup, landing, help', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  // Signup form as a dealer sees it from the landing CTA.
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your agency workspace' }).click();
  await expect(page.getByPlaceholder('e.g. Tendai Moyo')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g01-signup.png`, fullPage: true });
  // Landing and help pages.
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g02-landing.png`, fullPage: true });
  await page.goto('/help');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g03-help.png`, fullPage: true });
});

test('guidebook dealer shots: setup to showroom', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  // Agency setup form after account creation (pre-verification state).
  const email = `guide-${uid()}@e2e.dev`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your agency workspace' }).click();
  await page.getByPlaceholder('e.g. Tendai Moyo').fill('Guide Owner');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASS);
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/agency\/setup$/);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g04-agency-setup.png`, fullPage: true });
});

test('guidebook dealer shots: workspace to showroom', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  // Seeded dealer workspace.
  await loginAs(page, adminEmail);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Your work today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent imports' })).toBeVisible();
  await expect(page.getByText(/Loading dealer activity/)).toBeHidden();
  await expect(page.getByText(/Loading agency overview/)).toBeHidden();
  await page.screenshot({ path: `${SHOT}/g05-dashboard.png`, fullPage: true });

  // Empty first-customer and vehicle forms.
  await page.goto('/app/new/customer');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g06-new-customer.png`, fullPage: true });
  await page.goto('/app/new/vehicle');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g07-new-vehicle.png`, fullPage: true });

  // Capture a lead.
  await page.goto('/app/dealership');
  await expect(page.getByRole('heading', { name: 'Dealership', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ New enquiry', exact: true }).click();
  const name = `Guide Buyer ${uid()}`;
  await page.getByLabel('Customer name', { exact: true }).fill(name);
  await page.getByLabel('WhatsApp / phone').fill('+263771234567');
  await page.getByLabel('Budget (USD)').fill('8500');
  await page.getByLabel('Vehicle preferences').fill('Toyota Aqua, Harare viewing');
  await page.getByRole('button', { name: 'Save enquiry' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g08-lead-card.png`, fullPage: true });

  // Register a vehicle and add it to stock with a photo.
  await page.goto('/app/new/vehicle');
  const chassis = `GUIDE-${Date.now().toString().slice(-7)}`;
  await page.getByPlaceholder('e.g. JN1CMAT51A0004100').fill(chassis);
  await page.getByPlaceholder('Toyota', { exact: true }).fill('Toyota');
  await page.getByPlaceholder('Corolla', { exact: true }).fill('Aqua');
  await page.getByPlaceholder('2019', { exact: true }).fill('2020');
  await page.getByRole('button', { name: 'Register vehicle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vehicle registered' })).toBeVisible();
  await page.getByRole('button', { name: 'Add this vehicle to dealer stock' }).click();
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: '+ Add stock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a registered vehicle to stock' })).toBeVisible();
  await page.getByLabel('Stock vehicle').selectOption({ label: `2020 Toyota Aqua · ${chassis}` });
  await page.getByLabel('Vehicle location').fill('Harare');
  await page.locator('form').filter({ has: page.getByLabel('Stock vehicle') }).getByLabel('Asking price (USD)').fill('8000');
  await page.getByLabel('Acquisition / owner settlement cost (USD)').fill('5000');
  await page.getByLabel('Other direct costs (USD)').fill('1000');
  await page.getByRole('button', { name: 'Add stock', exact: true }).click();
  const stockCard = page.locator('div.card').filter({ hasText: chassis });
  await expect(stockCard.getByRole('heading', { name: '2020 Toyota Aqua', exact: true })).toBeVisible();
  await stockCard.getByLabel(/^Upload photos for /).setInputFiles({ name: 'guide-vehicle.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZ8AAAAASUVORK5CYII=', 'base64') });
  await expect(stockCard.getByText('Cover photo', { exact: true })).toBeVisible();
  await stockCard.screenshot({ path: `${SHOT}/g09-stock-detail.png` });

  // Publish and show the public showroom.
  await stockCard.getByLabel('Description for 2020 Toyota Aqua').fill('Duty paid local stock. View in Harare.');
  await stockCard.getByLabel('Publish available stock').check();
  await stockCard.getByRole('button', { name: 'Save showroom listing' }).click();
  await expect(stockCard.getByRole('button', { name: 'Save showroom listing' })).toBeEnabled();
  const showroom = await page.context().newPage();
  await showroom.setViewportSize(MOBILE);
  await showroom.goto('/showroom/e2e');
  await expect(showroom.getByRole('heading', { name: '2020 Toyota Aqua', exact: true })).toBeVisible();
  await showroom.screenshot({ path: `${SHOT}/g10-showroom.png`, fullPage: true });

  // Reservation form, reports, team, import, billing.
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: '+ New reservation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reserve a vehicle' })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g11-reservation.png`, fullPage: true });
  await page.goto('/app/operations');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g12-reports.png`, fullPage: true });
  await page.goto('/app/invitations');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g13-invitations.png`, fullPage: true });
  await page.goto('/app/import-data');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g14-import-data.png`, fullPage: true });
  await page.goto('/app/billing');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g15-billing.png`, fullPage: true });
});

test('guidebook customer shots: portal and case', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await loginAs(page, customerEmail);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'My vehicles' })).toBeVisible();
  await expect(page.getByText('Case E20001')).toBeVisible();
  await expect(page.locator('dd', { hasText: 'Loading' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/g16-customer-dashboard.png`, fullPage: true });
  await page.getByText('Case E20001').first().click();
  await expect(page.getByRole('heading', { name: 'E20001', exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/g17-customer-case.png`, fullPage: true });
});
