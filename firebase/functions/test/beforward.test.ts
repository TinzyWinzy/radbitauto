import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBeforward, freshSupplierVehicle, parseSupplierPhotos, parseSupplierDetail } from '../src/beforwardParser.ts';
import { beforwardSeed } from '../src/beforwardSeed.ts';
const row=`<tr class="stocklist-row"><td><a href="/toyota/aqua/ce123456/id/123456/"><img src="//image-cdn.beforward.jp/medium/123/CE123456.jpg?w=200"></a><p class="make-model"><a>2020 TOYOTA AQUA &amp; G</a></p><p class="vehicle-price"><span class="price">$4,250</span></p><p class="total-price">$8,000</p><table><tr><td class="basic-spec-col mileage"><p class="title">Mileage</p><p class="val">42,100 km</p></td><td class="basic-spec-col year"><p class="title">Year</p><p class="val">2020/4</p></td><td class="basic-spec-col trans"><p class="title">Trans.</p><p class="val">AT</p></td></tr></table><td>Fuel</td><td>Hybrid(Petrol)</td></td></tr>`;
test('extracts supplier price rather than destination total, decodes text and deduplicates',()=>{
 const stock=parseBeforward(row+row,'2026-10-09T07:00:00Z');assert.equal(stock.length,1);assert.equal(stock[0].askingPriceCents,425000);assert.equal(stock[0].specs.mileageKm,42100);assert.equal(stock[0].specs.transmission,'Automatic');assert.equal(stock[0].specs.fuel,'Hybrid');assert.equal(stock[0].title,'2020 TOYOTA AQUA & G');assert.match(stock[0].photos[0],/^https:\/\/image-cdn.beforward.jp/);
});
test('drops reserved vehicles and incomplete or foreign image entries',()=>{
 assert.equal(parseBeforward(row.replace('2020 TOYOTA','RESERVED 2020 TOYOTA')).length,0);
 assert.equal(parseBeforward(row.replace('image-cdn.beforward.jp','evil.example')).length,0);
 assert.equal(parseBeforward(row.replace('$4,250','ASK')).length,0);
 assert.equal(parseBeforward('<html>Access denied</html>').length,0);
});
test('expires stale inventory and rejects invalid/future timestamps',()=>{
 const v={...beforwardSeed[0],checkedAt:'2026-10-09T07:00:00Z'},now=Date.parse(v.checkedAt);
 assert.equal(freshSupplierVehicle(v,now+47*3600000),true);assert.equal(freshSupplierVehicle(v,now+49*3600000),false);
 assert.equal(freshSupplierVehicle({...v,checkedAt:'invalid'},now),false);assert.equal(freshSupplierVehicle(v,now-3600000),false);
});
test('real captured selection contains five makes and only positive USD supplier prices',()=>{
 assert.ok(beforwardSeed.length>=100);assert.equal(new Set(beforwardSeed.map(v=>v.specs.make)).size,5);
 for(const v of beforwardSeed){assert.ok(v.askingPriceCents>0);assert.match(v.listingUrl,/^https:\/\/www.beforward.jp\/[^?#]+\/id\/\d+\/?$/);}
});
test('gallery accepts only the selected reference on the supplier image host',()=>{
 const src='//image-cdn.beforward.jp/large/202608/123/CE123456_photo.jpg';
 assert.deepEqual(parseSupplierPhotos(`<input data-path="${src}"><input data-path="${src}"><input data-path="//image-cdn.beforward.jp/large/123/OTHER_photo.jpg"><input data-path="https://evil.example/CE123456_photo.jpg">`,'CE123456'),[`https:${src}`]);
});
const detailPage=`<html><body><table>
 <tr><th>Ref. No.</th><td>CE457744</td></tr><tr><th>Chassis No.</th><td>M700A-0160915</td></tr>
 <tr><th>Engine Code</th><td>1KR</td></tr><tr><th>Ext. Color</th><td>Silver</td></tr>
 <tr><th>Steering<br/>Right</th><td>Right</td></tr><tr><th>Seats</th><td>5</td></tr>
 <tr><th>Drive</th><td>2wheel drive</td></tr><tr><th>Doors</th><td>5</td></tr>
 <tr><th>Weight</th><td>910 kg</td></tr><tr><th>Dimension</th><td>3.65&times;1.66&times;1.52 m</td></tr>
 <tr><th>Registration Year/month</th><td>2020/3</td></tr><tr><th>Version/Class</th><td>X L PACKAGE S</td></tr>
 </table><input data-path="//image-cdn.beforward.jp/large/202608/16340830/CE457744_photo1.jpg"></body></html>`;
test('extracts buyer-facing detail specifications from a supplier detail page',()=>{
 const parsed=parseSupplierDetail(detailPage,'CE457744');
 assert.equal(parsed.detail.chassis,'M700A-0160915');
 assert.equal(parsed.detail.engineCode,'1KR');
 assert.equal(parsed.detail.colour,'Silver');
 assert.equal(parsed.detail.drive,'2WD');
 assert.equal(parsed.detail.seats,5);assert.equal(parsed.detail.doors,5);assert.equal(parsed.detail.weightKg,910);
 assert.equal(parsed.detail.dimensions,'3.65×1.66×1.52 m');
 assert.equal(parsed.detail.registration,'2020/3');
 assert.equal(parsed.detail.version,'X L PACKAGE S');
 assert.deepEqual(parsed.photos,['https://image-cdn.beforward.jp/large/202608/16340830/CE457744_photo1.jpg']);
});
test('normalises four-wheel drive and tolerates markup without a specification table',()=>{
 const html=detailPage.replace('2wheel drive','4WD (4x4)');
 assert.equal(parseSupplierDetail(html,'CE457744').detail.drive,'4WD');
 const empty=parseSupplierDetail('<html><body>Access denied</body></html>','CE457744');
 assert.deepEqual(empty.detail,{});assert.deepEqual(empty.photos,[]);
});
