import { test, expect } from '@playwright/test';
import { loginAs, adminEmail, PASS, uid } from './accounts';

for (const role of ['staff', 'customer'] as const) test(`owner invites verified ${role} into the correct agency with existing case history`, async ({ browser, request }) => {
  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await owner.newPage();
  await loginAs(page, adminEmail); await expect(page).toHaveURL(/\/app$/);
  const customerName = `Invited Customer ${uid()}`;
  if (role === 'customer') {
    await page.goto('/app/new/customer');
    await page.getByPlaceholder('e.g. Blessing Chiwa').fill(customerName);
    await page.getByPlaceholder('+263...').fill('+263771234567');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await page.getByRole('button', { name: 'Open an import case' }).click();
    await page.getByRole('button', { name: 'Create import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import case created' })).toBeVisible();
  }
  await page.goto('/app/operations');
  await expect(page.getByText(/Total cases:/)).toBeVisible();
  const email = `invited-${uid()}@e2e.dev`;
  await page.getByLabel('Invitation email').fill(email);
  await page.getByLabel('Invite as').selectOption(role);
  if (role === 'customer') await page.getByLabel('Customer record').selectOption({ label: customerName });
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
  const link = await page.getByLabel('Invitation link').inputValue();
  const member = await browser.newContext({ viewport: { width: 320, height: 740 } }); const invited = await member.newPage();
  await invited.goto(link); await invited.getByRole('link', { name: 'Create my account' }).click();
  await invited.getByPlaceholder('e.g. Tendai Moyo').fill('Invited Staff');
  await invited.getByPlaceholder('you@example.com').fill(email); await invited.getByPlaceholder('••••••••').fill(PASS);
  await invited.locator('form').getByRole('button', { name: 'Create account' }).click();
  await expect(invited).toHaveURL(/\/invite\//);
  await expect(invited.getByRole('status').filter({ hasText: 'Verification email requested' })).toBeVisible();
  await expect(invited.getByRole('button', { name: 'Verify email and accept invitation' })).toBeDisabled();
  await expect.poll(() => invited.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await invited.screenshot({ path: `test-results/invitation-${role}-mobile.png`, fullPage: true });
  const codes = await (await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-vehicle-import/oobCodes')).json();
  const code = codes.oobCodes.find((entry: { email: string; requestType: string }) => entry.email === email && entry.requestType === 'VERIFY_EMAIL');
  expect(code).toBeTruthy();
  expect(new URL(code.oobLink).searchParams.get('continueUrl')).toBe(link);
  const result = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key', { data: { oobCode: code.oobCode } }); expect(result.ok()).toBeTruthy();
  await invited.getByRole('button', { name: 'I have verified my email' }).click();
  await invited.getByRole('button', { name: 'Verify email and accept invitation' }).click();
  await expect(invited).toHaveURL(/\/app$/);
  if (role === 'customer') {
    await expect(invited.getByText('E20001')).toHaveCount(0);
    await expect(invited.getByText(/Vehicle not selected/).first()).toBeVisible();
    await member.close(); await owner.close(); return;
  }
  await expect(invited.getByText('E20001').first()).toBeVisible();
  await invited.goto('/app/operations');
  await expect(invited.getByText(/Total cases:/)).toBeVisible();
  await expect(invited.getByRole('button', { name: 'Create invitation link' })).toHaveCount(0);
  await invited.setViewportSize({ width: 1440, height: 900 });
  await invited.screenshot({ path: 'test-results/reports-desktop.png', fullPage: true });
  await invited.setViewportSize({ width: 390, height: 844 });
  await invited.screenshot({ path: 'test-results/reports-mobile.png', fullPage: true });
  await member.close(); await owner.close();
});

test('owner can review and revoke an invitation before signup',async({browser})=>{
 const owner=await browser.newContext({viewport:{width:390,height:844}});const page=await owner.newPage();await loginAs(page,adminEmail);await page.goto('/app/invitations');
 const email=`revoked-${uid()}@e2e.dev`;await page.getByLabel('Invitation email').fill(email);await page.getByRole('button',{name:'Create invitation link'}).click();await expect(page.getByLabel('Invitation link')).toHaveValue(/\/invite\/[a-f0-9]{64}$/);const link=await page.getByLabel('Invitation link').inputValue();
 await expect(page.getByRole('link',{name:'Share on WhatsApp'})).toHaveAttribute('href',/^https:\/\/wa.me\//);await page.getByRole('button',{name:`Revoke invitation for ${email}`}).click();await expect(page.getByRole('status').filter({hasText:'revoked'})).toBeVisible();
 await expect(page.getByLabel('Invitation link')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'release-evidence/invitations-owner-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'release-evidence/invitations-owner-desktop.png',fullPage:true});
 const recipient=await browser.newContext();const invited=await recipient.newPage();await invited.goto(link);await expect(invited.getByRole('alert')).toContainText('revoked');await expect(invited.getByRole('link',{name:'Create my account'})).toHaveCount(0);await recipient.close();await owner.close();
});
