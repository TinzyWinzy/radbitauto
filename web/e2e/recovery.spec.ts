import { test, expect } from '@playwright/test';
import { customerEmail } from './accounts';

test('password recovery requires an email and sends a reset request', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Enter your email address first.')).toBeVisible();
  await page.getByPlaceholder('you@example.com').fill(customerEmail);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('status')).toContainText('password reset link');
  const response = await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-vehicle-import/oobCodes');
  const codes = await response.json();
  expect(codes.oobCodes.some((code: { email: string; requestType: string }) => code.email === customerEmail && code.requestType === 'PASSWORD_RESET')).toBeTruthy();
});
