import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(resolve('release-evidence/wireframe-preview.html')).href);
  const frame=page.frameLocator('iframe');
  for(const width of [1040,390,320]) {
    await page.setViewportSize({width,height:1100});
    for(const name of ['Landing','Login','Signup','Verify email','Agency setup','Agency dashboard','Customer dashboard']) {
      await frame.getByRole('navigation',{name:'Wireframe screens'}).getByRole('button',{name,exact:true}).click();
      const fits=await frame.locator('#portal-wireframes').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
      assert.ok(fits.scroll<=fits.width+1, `${name} at ${width}: ${JSON.stringify(fits)}`);
    }
  }
  await page.setViewportSize({width:1040,height:1000});
  await frame.getByRole('button',{name:'Landing',exact:true}).click();
  await frame.getByRole('button',{name:'Create your agency workspace',exact:true}).click();
  await frame.getByLabel('Your full name').fill('Agency Owner');
  await frame.getByLabel('Work email').fill('owner@example.test');
  await frame.getByLabel('Password',{exact:true}).fill('prototype-only');
  await frame.getByRole('button',{name:'Create account',exact:true}).click();
  await frame.getByRole('button',{name:'I have verified my email'}).click();
  await frame.getByLabel('Agency name',{exact:true}).fill('Agency wireframe');
  const address=frame.getByLabel('Workspace address',{exact:true});if(await address.count())await address.fill('agency-wireframe');
  await frame.getByLabel('Agency WhatsApp number').fill('+263771234567');
  await frame.getByLabel('What does your agency do?').selectOption('clearing');
  await frame.getByRole('button',{name:'Create my workspace'}).click();
  assert.ok(await frame.getByRole('heading',{name:'Your agency is ready'}).isVisible());
  assert.ok(await frame.getByText('Clearing operations',{exact:true}).isVisible());
  await frame.getByRole('button',{name:'Agency dashboard',exact:true}).click();
  await page.screenshot({path:'release-evidence/wireframe-agency-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  await frame.getByRole('button',{name:'Customer dashboard',exact:true}).click();
  await page.screenshot({path:'release-evidence/wireframe-customer-mobile.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Wireframe screens fit at desktop, 390px and 320px. Signup/verification/clearing setup reaches the empty agency dashboard. No script errors.');
} finally {await browser.close();}
