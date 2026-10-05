import type { Page } from '@playwright/test';

// Fixture identities seeded by firebase/functions/e2e/seed.mjs — keep in sync.
export const PASS = 'password123';
export const platformEmail = 'platform@test.dev';
export const adminEmail = 'admin@e2e.dev';
export const staffEmail = 'staff@e2e.dev';
export const customerEmail = 'customer@e2e.dev';

export const uid = () => Date.now().toString(36);

export async function loginAs(page: Page, email: string, pass = PASS) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(pass);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
}

export async function signupAs(page: Page, name: string, email: string, pass = PASS) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByPlaceholder('e.g. Tendai Moyo').fill(name);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(pass);
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
}
