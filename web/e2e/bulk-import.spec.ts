import {test,expect} from '@playwright/test';
import Excel from 'exceljs';
import {loginAs,adminEmail,uid} from './accounts';

test('CSV stock maps, previews invalid rows, preserves unknown costs and skips re-upload',async({page})=>{
 test.setTimeout(180000);await loginAs(page,adminEmail);await expect(page).toHaveURL(/\/app$/);await page.goto('/app/import-data');await page.getByLabel('Record type').selectOption('stock');
 const suffix=String(Date.now()).slice(-7);const vin=`NHP10-${suffix}`;
 const csv=`VIN,Make,Model,Year,Category,Asking Price,Location,Ownership,Acquisition Cost,Direct Costs,Costs Complete\r\n${vin},Toyota,Aqua,2020,sedan_station_wagon,"7,500.25","Harare, showroom",owned,,,no\r\nINVALID,Toyota,Aqua,2020,sedan_station_wagon,7000,Harare,owned,,,no`;
 await page.getByLabel('Upload file').setInputFiles({name:'stock.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.getByRole('button',{name:'Validate and preview'}).click();await expect(page.getByRole('status').filter({hasText:/ready/})).toContainText('1 ready');await expect(page.getByText(/USD 7500.25/)).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'release-evidence/bulk-import-stock-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Import valid rows'}).click();await expect(page.getByRole('status').filter({hasText:/ready/})).toContainText('1 imported');await expect(page.getByText('Acquisition/settlement cost not recorded')).toBeVisible();await page.getByRole('button',{name:'Validate and preview'}).click();await expect(page.getByRole('status').filter({hasText:/ready/})).toContainText('1 duplicates skipped');await expect(page.getByRole('button',{name:'Import valid rows'})).toBeDisabled();
 await page.goto('/app/dealership');await page.getByRole('button',{name:'Stock',exact:true}).click();const card=page.locator('div.card').filter({has:page.getByRole('heading',{name:'2020 Toyota Aqua',exact:true})});await expect(card.getByLabel('Actual acquisition cost (USD)')).toHaveValue('');await expect(card.getByLabel('Other actual direct costs (USD)')).toHaveValue('');await expect(card.getByLabel('Publish available stock')).not.toBeChecked();
});

test('Excel customers choose worksheet/header and import without creating login access',async({page})=>{
 test.setTimeout(180000);const name=`Workbook Buyer ${uid()}`;const book=new Excel.Workbook();book.addWorksheet('Notes').addRow(['Read me']);const sheet=book.addWorksheet('Clients');sheet.addRow(['Client register']);sheet.addRow(['Client','Mobile']);sheet.addRow([name,'0771234567']);
 await loginAs(page,adminEmail);await expect(page).toHaveURL(/\/app$/);await page.goto('/app/import-data');await page.getByLabel('Upload file').setInputFiles({name:'clients.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});
 await page.getByLabel('Worksheet').selectOption({label:'Clients'});await page.getByLabel('Header row').fill('2');await page.getByLabel('First data row').fill('3');await page.getByRole('button',{name:'Suggest column matches'}).click();await page.getByRole('button',{name:'Validate and preview'}).click();await expect(page.getByRole('status').filter({hasText:/ready/})).toContainText('1 ready');await expect(page.getByText(`${name} · +263771234567`)).toBeVisible();await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'release-evidence/bulk-import-customers-desktop.png',fullPage:true});await page.getByRole('button',{name:'Import valid rows'}).click();await expect(page.getByRole('status').filter({hasText:/ready/})).toContainText('1 imported');
 await page.goto('/app/team');await expect(page.getByText(name,{exact:true})).toBeVisible();
});

