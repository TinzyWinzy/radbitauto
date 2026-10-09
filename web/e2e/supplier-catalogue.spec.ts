import { test, expect } from '@playwright/test';
import { beforwardSeed } from '../../firebase/functions/src/beforwardSeed';
const vehicle={...beforwardSeed[0],checkedAt:new Date().toISOString()};
test('buyer selects supplier vehicle and dealer; enquiry carries reference and remains inside Radbit',async({page})=>{
 await page.route('**/publicSupplierCatalogue',r=>r.fulfill({json:{result:{stock:[vehicle],limited:true}}}));
 await page.route('**/publicVehicleCatalogue',r=>r.fulfill({json:{result:{stock:[],limited:false}}}));
 await page.route('**/publicImportDealers',r=>r.fulfill({json:{result:{dealers:[{slug:'import-motors',name:'Import Motors',operationMode:'sourcing'}],nextCursor:null}}}));
 let submitted:Record<string,unknown>|undefined;
 await page.route('**/enquireSupplierVehicle',r=>{submitted=r.request().postDataJSON().data;return r.fulfill({json:{result:{received:true,ref:'A1B2C3D4',dealer:{name:'Import Motors',slug:'import-motors',whatsapp:'+263771234567'}}}});});
 await page.route('**/publicSupplierVehicle',r=>r.fulfill({json:{result:{photos:vehicle.photos}}}));
 await page.goto('/');await expect(page.getByRole('heading',{name:vehicle.title,exact:true})).toBeVisible();
 await page.getByRole('link',{name:/View car & choose a dealer/}).click();await expect(page).toHaveURL(new RegExp('/imports/'+vehicle.id+'$'));
 await expect(page.getByText(`Supplier reference: ${vehicle.id}`)).toBeVisible();
 await expect.poll(()=>page.locator('.vehicle-main-photo').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`release-evidence/supplier-car-${width}.png`,fullPage:true});}
 await page.getByLabel('Choose your import dealer').selectOption('import-motors');await page.getByLabel('Your name',{exact:true}).fill('Test Buyer');await page.getByLabel('WhatsApp / phone').fill('+263771234567');await page.getByLabel('Total import budget').fill('10000');await page.getByRole('button',{name:'Request verification & quote'}).click();
 await expect(page.getByRole('status')).toContainText('Your request has reached Import Motors');expect(submitted?.supplierVehicleId).toBe(vehicle.id);expect(submitted?.slug).toBe('import-motors');expect(submitted?.budgetCents).toBe(1000000);
 await expect(page.getByText('Enquiry reference A1B2C3D4')).toBeVisible();
 await expect(page.getByRole('link',{name:'Continue on WhatsApp'})).toHaveAttribute('href',/^https:\/\/wa\.me\/263771234567\?text=/);
 await expect(page.getByRole('link',{name:'Share this car'})).toHaveAttribute('href',/^https:\/\/wa\.me\/\?text=/);
 await page.getByRole('button',{name:'Download request (PDF)'}).click();
 const sheet=page.locator('.print-sheet');
 await expect(sheet.getByText('Import enquiry request — Radbit Auto')).toBeVisible();
 await expect(sheet.getByText(`Supplier reference: ${vehicle.id}`)).toBeVisible();
 await expect(sheet.getByText('Confirm availability of')).toBeVisible();
 await page.getByRole('button',{name:'Close document'}).click();
 await page.goto('/imports');
 await expect(page.getByRole('region',{name:'Your open import enquiry'})).toContainText('A1B2C3D4');
 await expect(page.getByRole('link',{name:'Return to this enquiry'})).toHaveAttribute('href',`/imports/${vehicle.id}`);
});
test('supplier failures retry; expired cars and no eligible dealers have useful states',async({page})=>{
 let failed=true;await page.route('**/publicSupplierCatalogue',r=>r.fulfill({json:failed?{error:{status:'UNAVAILABLE',message:'Supplier unavailable'}}:{result:{stock:[vehicle],limited:true}}}));
 await page.route('**/publicSupplierVehicle',r=>r.fulfill({json:{result:{photos:vehicle.photos}}}));
 await page.route('**/publicImportDealers',r=>r.fulfill({json:{result:{dealers:[],nextCursor:null}}}));
 await page.goto(`/imports/${vehicle.id}`);await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();failed=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No participating import dealers are accepting enquiries yet.')).toBeVisible();
 await page.goto('/imports/EXPIRED');await expect(page.getByRole('link',{name:'Browse import vehicles'})).toBeVisible();
});
