import { test, expect } from '@playwright/test';
import { loginAs, platformEmail } from './accounts';

test('platform admin reviews tenant usage from agency administration', async ({ page }) => {
  await loginAs(page, platformEmail);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Agency administration' })).toBeVisible();
  await page.getByLabel('Billing agency ID').fill('e2e-tenant');
  await page.getByRole('button', { name: 'Review agency usage' }).click();
  await expect(page.getByText(/E2E Motors:.*team members/)).toBeVisible();
  await expect(page.getByText(/Recorded support in last 30 days:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save agency subscription' })).toBeEnabled();
});
