import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loginAs, adminEmail, platformEmail, staffEmail } from './accounts';

test('owner requests a plan and exports private records on mobile and desktop',async({page})=>{
  await loginAs(page,adminEmail);await expect(page).toHaveURL(/\/app$/);await page.getByRole('link',{name:'Plan & billing →'}).click();
  await expect(page.getByRole('heading',{name:'Plan & billing',exact:true})).toBeVisible();
  await expect(page.getByText('Customer portal accounts are free.')).toBeVisible();
  await page.getByRole('button',{name:'Request solo',exact:true}).click();await expect(page.getByRole('status')).toContainText('Request recorded');await expect(page.getByText('Requested plan: solo')).toBeVisible();
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`release-evidence/subscription-${width}.png`,fullPage:true});}
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export business records',exact:true}).click();const download=await downloadPromise;const path=await download.path();expect(path).toBeTruthy();const exported=JSON.parse(await readFile(path!,'utf8'));expect(exported.companyId).toBe('e2e-tenant');expect(exported.records.customers.length).toBeGreaterThan(0);expect(exported.records.dealer_costs).toBeDefined();expect(exported.records.users).toBeUndefined();
});

test('manual activation, paused access and renewal preserve existing records',async({page,browser})=>{
  test.setTimeout(180000);await loginAs(page,platformEmail);await expect(page).toHaveURL(/\/onboarding$/);
  const card=page.locator('div.card').filter({has:page.getByRole('heading',{name:'Agency subscriptions',exact:true})});
  await card.getByLabel('Billing agency ID').fill('e2e-tenant');await card.getByLabel('Agency access').selectOption('paused');await card.getByRole('button',{name:'Save agency subscription',exact:true}).click();await expect(card.getByRole('status')).toContainText('Subscription saved');
  const ownerContext=await browser.newContext({baseURL:"http://localhost:5180"});const owner=await ownerContext.newPage();
  try {
    await loginAs(owner,adminEmail);await expect(owner).toHaveURL(/\/app$/);await expect(owner.getByRole('status').filter({hasText:'Subscription is read-only'})).toBeVisible();
    await owner.goto('/app/billing');await expect(owner.getByText('Your workspace is read-only.',{exact:false})).toBeVisible();await owner.getByRole('button',{name:'Request dealer',exact:true}).click();await expect(owner.getByRole('status').filter({hasText:'Request recorded'})).toBeVisible();
    await owner.goto('/app/new/customer');await owner.getByPlaceholder('e.g. Blessing Chiwa').fill('Blocked Buyer');await owner.getByPlaceholder('+263...').fill('+263771234567');await owner.getByRole('button',{name:'Create customer',exact:true}).click();await expect(owner.getByText(/Subscription is read-only\. Renew from Billing/)).toBeVisible();
  } finally {
    await card.getByLabel('Agency access').selectOption('active');const fields=card.locator('form').first().locator('input');await fields.nth(2).fill('E2E-SUBSCRIPTION-INVOICE');await fields.nth(3).fill('E2E-VERIFIED-BANK');await card.getByRole('button',{name:'Save agency subscription',exact:true}).click();await expect(card.getByRole('status')).toContainText('Subscription saved');await ownerContext.close();
  }
  const staffContext=await browser.newContext({baseURL:"http://localhost:5180"});const staff=await staffContext.newPage();await loginAs(staff,staffEmail);await expect(staff).toHaveURL(/\/app$/);await staff.goto('/app/billing');await expect(staff.getByText('Billing and business exports are available to the agency owner.')).toBeVisible();await staffContext.close();
});
