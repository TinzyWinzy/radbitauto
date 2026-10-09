import { test, expect } from '@playwright/test';
import { signupAs, uid } from './accounts';

test('verification sends once, survives refresh and detects verification when returning to setup', async ({ page, request }) => {
  const email = `verify-return-${uid()}@e2e.dev`;
  await signupAs(page, 'Verify Return', email);
  await page.getByRole('link', { name: /I run an agency/ }).click();
  await expect(page.getByRole('status')).toContainText('Verification email requested');
  await expect(page.getByRole('button', { name: /Send verification email again in/ })).toBeDisabled();
  const codesForUser = async () => {
    const result = await (await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-vehicle-import/oobCodes')).json();
    return result.oobCodes.filter((code: { email: string; requestType: string }) => code.email === email && code.requestType === 'VERIFY_EMAIL');
  };
  const codes = await codesForUser();
  expect(codes).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Verification email requested');
  expect(await codesForUser()).toHaveLength(1);
  expect(new URL(codes[0].oobLink).searchParams.get('continueUrl')).toBe('http://localhost:5180/agency/setup');
  const response = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', { data: { oobCode: codes[0].oobCode } });
  expect(response.ok()).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Agency name', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create my agency' })).toBeEnabled();
});

test('email throttling is visible and retry and alternative sign-in remain available', async ({ page }) => {
  let attempts = 0;
  await page.route('**/*accounts:sendOobCode*', route => {
    attempts++;
    return route.fulfill({ status: 400, json: { error: { code: 400, message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } } });
  });
  await signupAs(page, 'Throttled Owner', `verify-throttle-${uid()}@e2e.dev`);
  await page.getByRole('link', { name: /I run an agency/ }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily limited');
  await expect(page.getByRole('button', { name: 'Send verification email', exact: true })).toBeEnabled();
  // Signup first visits Pending, which can also request verification. Measure
  // this explicit retry rather than assuming one request across both screens.
  const attemptsBeforeRetry = attempts;
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click();
  await expect.poll(() => attempts).toBe(attemptsBeforeRetry + 1);
  await page.getByRole('button', { name: 'Use Google or another account' }).click();
  await expect(page).toHaveURL(/\/login\?intent=agency$/);
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
});
