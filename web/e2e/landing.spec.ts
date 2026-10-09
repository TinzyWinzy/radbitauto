import { test, expect } from '@playwright/test';
import { loginAs, customerEmail } from './accounts';

test('landing renders hero and routes to login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Local dealer stock',exact:true}).click();
  await expect(page.getByRole('heading', { name: /Find your next car/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/landing-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Sign in', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
});

test('buyers filter published cars and reach the owning dealer; agencies have their own signup path', async ({ page }) => {
  await page.route('**/publicVehicleCatalogue', route=>route.fulfill({json:{result:{limited:false,stock:[{id:'aqua',title:'Toyota Aqua',location:'Harare',askingPriceCents:700000,photos:[],dealerName:'Test Motors',slug:'test-motors'},{id:'hilux',title:'Toyota Hilux',location:'Bulawayo',askingPriceCents:2200000,photos:[],dealerName:'Other Motors',slug:'other-motors'}]}}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Local dealer stock',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Toyota Aqua',exact:true})).toBeVisible();
  await page.getByLabel('Maximum budget (USD)').selectOption('10000');
  await expect(page.getByRole('heading',{name:'Toyota Hilux',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'View vehicle & enquire about Toyota Aqua'})).toHaveAttribute('href','/showroom/test-motors/vehicle/aqua');
  await page.getByLabel('Make, model, location or dealer').fill('Mazda');
  await expect(page.getByRole('heading',{name:'No cars match those filters.'})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await expect(page.getByRole('heading',{name:'Toyota Hilux',exact:true})).toBeVisible();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`release-evidence/marketing-stock-${width}.png`,fullPage:true});
  }
  await page.getByRole('link',{name:'Create your agency workspace',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?intent=agency&mode=signup$/);
});

test('public catalogue failure can be retried and an empty market has honest guidance', async ({page})=>{
  let recovered=false;
  await page.route('**/publicVehicleCatalogue',route=>route.fulfill({json:!recovered?{error:{status:'UNAVAILABLE',message:'Unavailable'}}:{result:{stock:[],limited:false}}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Local dealer stock',exact:true}).click();
  await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
  recovered=true;
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.getByRole('heading',{name:'The next listings are on their way.'})).toBeVisible();
});

test('landing redirects signed-in users to the app', async ({ page }) => {
  await loginAs(page, customerEmail);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: 'Local dealer stock', exact: true })).toHaveCount(0);
});
