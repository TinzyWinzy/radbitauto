import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStockSpecs, stockSpecsProjection } from '../src/publicStock.ts';
import { validateQuoteTerms } from '../src/quoteTerms.ts';
import { validateJourneyAction } from '../src/journeyAction.ts';
test('public specifications accept zero mileage but reject invalid ranges and choices',()=>{
 assert.deepEqual(validateStockSpecs({mileageKm:0,fuel:'Electric',make:' Toyota ',secret:'hidden'}),{make:'Toyota',mileageKm:0,fuel:'Electric'});
 for(const input of [{mileageKm:-1},{mileageKm:1.1},{fuel:'unverified'},{year:1800},{engineCc:0},{transmission:'script'}])assert.throws(()=>validateStockSpecs(input));
});
test('public projection never leaks chassis, customer or cost data',()=>{
 const result=stockSpecsProjection({publicSpecs:{fuel:'Hybrid',vinChassisUpper:'private',acquisitionCents:1,customerIds:['x']}},{make:'Toyota',model:'Aqua',year:2020,vinChassisUpper:'private',purchasePriceCents:100});
 assert.deepEqual(result,{make:'Toyota',model:'Aqua',year:2020,fuel:'Hybrid'});
});
test('quotation terms reject invalid and past dates, preserve explicit scope',()=>{
 assert.equal(validateQuoteTerms({route:' Durban ',exclusions:'Registration'}).route,'Durban');
 for(const date of ['2027-02-30','2000-01-01','not-a-date'])assert.throws(()=>validateQuoteTerms({validUntil:date}));
});
test('next actions require an owner and real date',()=>{
 assert.equal(validateJourneyAction({title:'Upload invoice',responsible:'customer',dueDate:'2027-01-01'}).state,'pending');
 assert.throws(()=>validateJourneyAction({title:' ',responsible:'agency'}));
 assert.throws(()=>validateJourneyAction({title:'Collect',responsible:'unknown'}));
 assert.throws(()=>validateJourneyAction({title:'Collect',responsible:'agency',dueDate:'2027-02-30'}));
});
