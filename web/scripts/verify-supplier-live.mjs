import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const origin=process.env.RADBIT_ORIGIN??'https://studio-285787437-bc95b.web.app';
async function call(name,data={}) {
 const response=await fetch(`https://us-central1-studio-285787437-bc95b.cloudfunctions.net/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});
 assert.equal(response.status,200,`${name} HTTP ${response.status}`);const body=await response.json();assert.ok(body.result&&!body.error,`${name} failed`);return body.result;
}
const [catalogue,directory]=await Promise.all([call('publicSupplierCatalogue'),call('publicImportDealers')]);
assert.ok(catalogue.stock.length>0,'Live catalogue is empty');
const first=catalogue.stock[0],gallery=await call('publicSupplierVehicle',{supplierVehicleId:first.id});
assert.ok(gallery.photos.length>0,'No supplier photographs');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(`${origin}/imports/${first.id}`,{waitUntil:'domcontentloaded'});
 await page.getByText(`Supplier reference: ${first.id}`).waitFor({timeout:60000});
 await page.waitForFunction(src=>{const image=document.querySelector('.vehicle-main-photo');return image?.src===src&&image.complete&&image.naturalWidth>0;},gallery.photos[0],{timeout:60000});
 if(directory.dealers.length){await page.getByLabel('Choose your import dealer').waitFor({timeout:60000});assert.ok(await page.locator('select[name="slug"] option').count()>1);}
 await page.screenshot({path:'release-evidence/supplier-live-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');
 await page.screenshot({path:'release-evidence/supplier-live-mobile.png',fullPage:true});
 console.log(JSON.stringify({origin,stockCount:catalogue.stock.length,dealerCountInFirstPage:directory.dealers.length,firstReference:first.id,galleryPhotos:gallery.photos.length,browser:'passed',submittedEnquiries:0}));
}finally{await browser.close();}
