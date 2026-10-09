import { test, expect } from '@playwright/test';
import { loginAs, adminEmail } from './accounts';

test('registration compresses photos, retries attachment without creating another vehicle and carries photos into stock', async ({ page }) => {
  test.setTimeout(180000);
  await loginAs(page, adminEmail);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/new/vehicle');
  const chassis = `NHP10-${Date.now().toString().slice(-7)}`;
  await page.getByPlaceholder('e.g. JN1CMAT51A0004100').fill(chassis);
  await page.getByPlaceholder('Toyota', {exact:true}).fill('Toyota');
  await page.getByPlaceholder('Corolla', {exact:true}).fill('Aqua');
  await page.getByPlaceholder('2019', {exact:true}).fill('2020');
  await page.getByLabel('Vehicle photos', {exact:true}).setInputFiles({name:'car.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPZ8AAAAASUVORK5CYII=','base64')});
  let creations=0;let interrupted=false;
  page.on('request', request => {if(request.method()==='POST'&&request.url().endsWith('/createVehicle'))creations++;});
  await page.route('**/attachVehiclePhoto', route => {
    if(route.request().method()==='POST'&&!interrupted){interrupted=true;return route.fulfill({json:{error:{status:'UNAVAILABLE',message:'Interrupted photo attachment'}}});}
    return route.continue();
  });
  await page.getByRole('button',{name:'Register vehicle',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Vehicle registered'})).toBeVisible();
  await page.getByRole('button',{name:'Retry remaining photos (1)'}).click();
  await expect(page.getByRole('img',{name:'Registered vehicle photo 1'})).toBeVisible();
  expect(creations).toBe(1);
  await page.getByRole('button',{name:'Add this vehicle to dealer stock'}).click();
  await page.getByRole('button',{name:'Stock',exact:true}).click();
  await page.getByRole('button',{name:'+ Add stock',exact:true}).click();
  await page.getByLabel('Stock vehicle').selectOption({label:`2020 Toyota Aqua · ${chassis}`});
  const form=page.locator('form').filter({has:page.getByLabel('Stock vehicle')});
  await form.getByLabel('Vehicle location').fill('Harare');
  await form.getByLabel('Asking price (USD)').fill('8000');
  await form.getByLabel('Acquisition / owner settlement cost (USD)').fill('5000');
  await form.getByLabel('Other direct costs (USD)').fill('0');
  await form.getByRole('button',{name:'Add stock',exact:true}).click();
  await expect(page.getByRole('img',{name:'Vehicle photo 1',exact:true})).toBeVisible();
  await expect(page.getByText('Cover photo',{exact:true})).toBeVisible();
});
