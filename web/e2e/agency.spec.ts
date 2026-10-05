import { test, expect } from '@playwright/test';
import { signupAs, uid, PASS } from './accounts';

test('two owners create isolated branded workspaces from the general signup path', async ({ browser, request }) => {
  for (const [index, operation] of ['both', 'clearing'].entries()) {
    const context = await browser.newContext({ viewport: { width: index === 0 ? 320 : 390, height: 900 } });
    const page = await context.newPage();
    const id = `${index}-${uid()}`;
    const email = `owner-${id}@e2e.dev`;
    if (index === 0) {
      await page.goto('/');
      await page.getByRole('link', { name: 'Create your agency workspace' }).click();
      await page.getByPlaceholder('e.g. Tendai Moyo').fill(`Owner ${index}`);
      await page.getByPlaceholder('you@example.com').fill(email);
      await page.getByPlaceholder('••••••••').fill(PASS);
      await page.locator('form').getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/agency\/setup$/);
      await expect(page.getByLabel('Agency name', { exact: true })).toBeHidden();
    } else {
      await signupAs(page, `Owner ${index}`, email);
      await expect(page).toHaveURL(/\/pending$/);
      await page.getByRole('link', { name: /I run an agency/ }).click();
    }
    await expect(page.getByRole('status').filter({ hasText: 'Verification email requested' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Send verification email again in/ })).toBeDisabled();
    const codes = await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-vehicle-import/oobCodes');
    const body = await codes.json();
    const code = body.oobCodes.find((entry: { email: string; requestType: string }) => entry.email === email && entry.requestType === 'VERIFY_EMAIL');
    expect(code).toBeTruthy();
    expect(new URL(code.oobLink).searchParams.get('continueUrl')).toBe('http://localhost:5180/agency/setup');
    const verified = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', { data: { oobCode: code.oobCode } });
    expect(verified.ok()).toBeTruthy();
    await page.getByRole('button', { name: 'I have verified my email' }).click();
    await expect(page.getByRole('button', { name: 'Create my agency' })).toBeEnabled();
    await page.getByLabel('Agency name', { exact: true }).fill(`Independent Agency ${id}`);
    await page.getByLabel('Agency address', { exact: true }).fill(`agency-${id}`);
    await page.getByLabel('Case prefix').fill(`A${index}`);
    await page.getByLabel('Agency WhatsApp number').fill('+263771234567');
    await page.getByLabel('Agency operations').selectOption(operation);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/agency-setup-${index}-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Create my agency' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('.app-shell > header').getByText(`Independent Agency ${id}`, { exact: true })).toBeVisible();
    await expect(page.getByText('E20001', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your agency is ready')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('complementary').getByText(`Independent Agency ${id}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/agency-${index}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/agency-${index}-mobile.png`, fullPage: true });
    await context.close();
  }
});

test('agency signup CTA opens account creation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your agency workspace' }).click();
  await expect(page).toHaveURL(/intent=agency/);
  await expect(page.getByPlaceholder('e.g. Tendai Moyo')).toBeVisible();
});
