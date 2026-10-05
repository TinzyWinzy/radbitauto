import { test, expect } from '@playwright/test';
import { loginAs, platformEmail } from './accounts';

test('platform admin assumes a tenant role and returns', async ({ page }) => {
  await loginAs(page, platformEmail);
  await expect(page).toHaveURL(/\/(onboarding|app)$/);
  if (page.url().endsWith('/app')) {
    // A previous failed attempt left this shared user in an assumed role — return first.
    await page.goto('/app/account');
    await page.getByRole('button', { name: 'Return to platform view' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  }
  await expect(page.getByText('view tenant as')).toBeVisible();

  const switcher = page.locator('div.card', { hasText: 'view tenant as' });
  await switcher.locator('select').first().selectOption({ label: 'E2E Motors (E2)' });
  await switcher.locator('select').nth(1).selectOption('staff');
  await switcher.getByRole('button', { name: 'View as staff' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Your work today' })).toBeVisible();
  await expect(page.getByText('E20001').first()).toBeVisible();

  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Return to platform view' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});
