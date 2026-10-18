import {test,expect} from '@playwright/test';
import {loginAs,adminEmail} from './accounts';
import {beforwardSeed} from '../../firebase/functions/src/beforwardSeed';
test('dealer issues a full proposal, schedules follow-up and shares revocable customer tracking',async({page,browser})=>{
 test.setTimeout(180000);
 await loginAs(page,adminEmail);await expect(page).toHaveURL(/\/app$/);
 await page.goto('/app/dealership');await page.getByRole('button',{name:'+ New enquiry',exact:true}).click();
 const buyer=`Proposal buyer ${Date.now()}`;
 await page.getByLabel('Customer name',{exact:true}).fill(buyer);await page.getByLabel('WhatsApp / phone',{exact:true}).fill('+263771234567');await page.getByLabel('Looking for').selectOption('import');await page.getByLabel('Vehicle preferences',{exact:true}).fill('Toyota Aqua sourcing');await page.getByRole('button',{name:'Save enquiry',exact:true}).click();
 await expect(page.getByRole('heading',{name:buyer,exact:true})).toBeVisible();
 const card=page.locator('.card').filter({has:page.getByRole('heading',{name:buyer,exact:true})});await card.getByRole('link',{name:'Manage quotation, follow-up & tracking'}).click();
 await page.getByRole('button',{name:'Prepare import quotation',exact:true}).click();
 for(const [label,amount]of [['Vehicle price','5000'],['Shipping','1000'],['Insurance','100'],['Duties and taxes','2000'],['Clearing','300'],['Delivery','500'],['Dealer fee','600']])await page.getByLabel(`${label} (USD)`,{exact:true}).fill(amount);
 await page.getByLabel('Tax assessment source / assumptions').fill('Estimated from clearing agent assessment; final valuation to be confirmed.');
 await page.getByRole('button',{name:'Issue itemised quotation'}).click();
 await expect(page.getByRole('region',{name:'Import quotation'})).toContainText('9,500.00');
 await page.getByLabel('Total expected costs, including supplier and third-party costs (USD)').fill('8123.45');await page.getByLabel('All expected costs are included').check();await page.getByRole('button',{name:'Save private margin review'}).click();await expect(page.getByText(/Expected margin:/)).toContainText('1,376.55');
 await page.getByLabel('Next action',{exact:true}).fill('Internal negotiation call');await page.getByLabel('Due date',{exact:true}).fill('2020-01-01');await page.getByLabel('Update visible to customer').fill('Your itemised quotation is ready. Please contact us to discuss.');await page.getByRole('button',{name:'Save next action & customer update'}).click();await expect(page.getByRole('alert')).toContainText('Overdue');
 const enquiryUrl=page.url();await page.getByRole('button',{name:'Create / replace tracking link'}).click();const link=await page.getByLabel('Private tracking link',{exact:true}).inputValue();
 const context=await browser.newContext({viewport:{width:390,height:844}}),customer=await context.newPage();
 try{await customer.goto(link);await expect(customer.getByRole('region',{name:'Import quotation'})).toContainText('9,500.00');await expect(customer.getByText('Your itemised quotation is ready. Please contact us to discuss.')).toBeVisible();await expect(customer.getByText('Internal negotiation call')).toHaveCount(0);await expect(customer.getByText(buyer,{exact:true})).toHaveCount(0);await expect(customer.getByText(/8,123.45|1,376.55|Private margin/)).toHaveCount(0);expect(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await customer.getByRole('button',{name:'Print / save quotation PDF'}).click();await expect(customer.locator('.print-sheet')).toContainText('TOTAL: $9,500.00');await expect(customer.locator('.print-sheet')).not.toContainText('Private margin');await customer.getByRole('button',{name:'Close document'}).click();
 await page.goto('/app/dealership');await expect(page.getByRole('heading',{name:/Follow-up reminders/})).toBeVisible();await expect(page.getByRole('link',{name:new RegExp('Overdue: '+buyer)})).toBeVisible();await page.goto(enquiryUrl);await page.getByRole('button',{name:'Revoke tracking link',exact:true}).click();await expect(page.getByText('Tracking link revoked.',{exact:true})).toBeVisible();await customer.reload();await expect(customer.getByRole('alert')).toContainText('unavailable or expired');
 }finally{await context.close();}
});
test('public supplier enquiry immediately receives private tracking that survives reload',async({page})=>{
 const vehicle=beforwardSeed[0];await page.route('**/publicSupplierCatalogue',r=>r.fulfill({json:{result:{stock:[vehicle]}}}));await page.route('**/publicSupplierVehicle',r=>r.fulfill({json:{result:{photos:vehicle.photos}}}));
 await page.goto(`/imports/${vehicle.id}`);await expect(page.getByLabel('Choose your import dealer')).toBeVisible();await page.getByLabel('Choose your import dealer').selectOption({index:1});await page.getByLabel('Your name',{exact:true}).fill('Tracking customer');await page.getByLabel('WhatsApp / phone',{exact:true}).fill('+263771234567');await page.getByRole('button',{name:'Request verification & quote'}).click();const link=page.getByRole('link',{name:'Track your enquiry & quotation',exact:true});await expect(link).toBeVisible();const url=await link.getAttribute('href');expect(url).toMatch(/\/enquiry#[a-f0-9]{64}$/);await page.reload();await expect(link).toHaveAttribute('href',url!);await link.click();await expect(page.getByRole('heading',{name:'Your import enquiry',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('Enquiry received');
});
