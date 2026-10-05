import { test, expect } from '@playwright/test';
import { signupAs, loginAs, customerEmail, uid } from './accounts';

test('signup lands claimless users on pending without platform access', async ({ page }) => {
  const email = `fresh${uid()}@e2e.dev`;
  await signupAs(page, 'Fresh User', email);
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByRole('heading', { name: 'Account pending' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable platform access' })).toHaveCount(0);
});

test('wrong password shows a friendly error', async ({ page }) => {
  await loginAs(page, customerEmail, 'wrong-password-1');
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('google sign-in option is offered', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});
