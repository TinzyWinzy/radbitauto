import { test, expect } from '@playwright/test';
import { loginAs, staffEmail, uid } from './accounts';

test.beforeEach(async ({ page }) => {
  await loginAs(page, staffEmail);
  await expect(page).toHaveURL(/\/app$/);
});

test('staff sees pipeline and can search by case number', async ({ page }) => {
  await expect(page.getByText('E20001').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your work today' })).toBeVisible();
  await expect(page.locator('.dashboard-totals')).not.toContainText('…');
  await expect(page.getByText('Overview unavailable:', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/staff-dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/staff-dashboard-mobile.png', fullPage: true });
  await page.getByPlaceholder('Search case number, customer or VIN…').fill('E20001');
  await page.getByRole('button', { name: 'By case' }).click();
  await expect(page.getByText('E20001').first()).toBeVisible();
});

test('staff records a supplier purchase and prepares a customer WhatsApp handoff', async ({ page }) => {
  await page.getByText('E20001').first().click();
  await page.getByLabel('Stock reference', { exact: true }).fill('CE937168');
  await page.getByLabel('Purchase reference', { exact: true }).fill('INV-E2E-1');
  const listing = 'https://www.beforward.jp/toyota/aqua/ce937168/id/16823011/';
  await page.getByLabel('Public BE FORWARD listing', { exact: true }).fill(listing);
  await page.getByRole('button', { name: 'Save supplier details' }).click();
  await expect(page.getByText('Supplier details saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open supplier listing' })).toHaveAttribute('href', listing);
  const handoff = page.getByRole('link', { name: 'Send customer a WhatsApp update' });
  const href = await handoff.getAttribute('href');
  expect(href).toContain('https://wa.me/263771234567?text=');
  expect(decodeURIComponent(href!)).toContain('/app/cases/');
  await page.reload();
  await expect(page.getByLabel('Purchase reference', { exact: true })).toHaveValue('INV-E2E-1');
  await expect(page.getByText(/evaluation error|Missing or insufficient permissions/)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/supplier-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/supplier-mobile.png', fullPage: true });
});

test('staff full case lifecycle: vehicle, case, quote, advance, pay, confirm', async ({ page }) => {
  const vin = `E2E${uid().replace(/-/g, '').padStart(14, '0').slice(0, 14).toUpperCase().replace(/[IOQ]/g, 'X')}`;
  const caseRun = uid();

  // 1. Register vehicle
  await page.goto('/app/new/vehicle');
  await page.getByPlaceholder('e.g. JN1CMAT51A0004100').fill(vin);
  await page.getByPlaceholder('Toyota').fill('Toyota');
  await page.getByPlaceholder('Corolla').fill('Corolla');
  await page.getByPlaceholder('2019').fill('2015');
  await page.getByPlaceholder('4500').fill('3800');
  await page.locator('form input[type="number"]').nth(3).fill('1600');
  await page.locator('form').getByRole('button', { name: 'Register vehicle' }).click();
  await expect(page.getByText('was saved.')).toBeVisible();

  // 2. Create case (vehicle preselected from result screen)
  await page.getByRole('button', { name: 'Create an import case for this vehicle' }).click();
  await expect(page).toHaveURL(/\/app\/new\/case$/);
  const customerSelect = page.locator('form').locator('select').first();
  await customerSelect.selectOption({ label: 'Test Customer — +263771234567' });
  await page.locator('form').getByRole('button', { name: 'Create import' }).click();
  await expect(page.getByText('is now live.')).toBeVisible();
  const caseNum = (await page.locator('span.font-semibold.text-slate-50').first().textContent())?.trim() ?? '';
  expect(caseNum).toMatch(/^E2\d+$/);

  // 3. Open the new case from the pipeline
  await page.goto('/app');
  await page.getByText(caseNum).first().click();
  await expect(page).toHaveURL(/\/app\/cases\//);

  // 4. Issue quotation
  const finance = page.locator('div.card', { hasText: 'Record payment' });
  await finance.getByRole('button', { name: 'Issue quotation' }).click();
  await expect(finance.getByText(/Quotation v\d+ issued/)).toBeVisible();

  // 5. Advance enquiry -> quotation
  const adv = page.locator('div.card', { hasText: 'Advance stage' });
  await adv.getByPlaceholder('e.g. shipping docs received').fill(`e2e advance ${caseRun}`);
  await adv.getByRole('button', { name: /Move to/ }).click();
  await expect(page.getByText('Quotation').first()).toBeVisible();

  // 6. Record + confirm payment
  await finance.getByPlaceholder('150.00').fill('100');
  await finance.getByPlaceholder('ECO123').fill(`E2E-${caseRun}`);
  await finance.getByRole('button', { name: 'Record payment' }).click();
  await expect(finance.getByText('Payment recorded as pending')).toBeVisible();
  const paymentRow = page.locator('div.card', { hasText: `E2E-${caseRun}` });
  await expect(paymentRow).toBeVisible();
  await paymentRow.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(paymentRow.getByText('confirmed')).toBeVisible();
});

test('staff can post tracking and upload a document', async ({ page }) => {
  await page.getByText('E20001').first().click();
  await expect(page).toHaveURL(/\/app\/cases\//);

  const tracking = page.locator('div.card', { hasText: 'Post update' });
  await tracking.getByPlaceholder('e.g. Beitbridge border').fill('Beitbridge border');
  await tracking.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Beitbridge border').first()).toBeVisible();

  const docs = page.locator('div.card', { hasText: 'Upload document' });
  await docs.locator('input[type="file"]').setInputFiles({
    name: 'bol.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-e2e-test'),
  });
  await docs.getByRole('button', { name: 'Upload document' }).click();
  await expect(docs.getByText('bol.pdf')).toBeVisible();
});
