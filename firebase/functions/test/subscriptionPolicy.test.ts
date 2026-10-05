import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionState, activeVehicleKeys } from '../src/subscriptionPolicy.ts';
test('managed subscriptions fail closed at expiry and for invalid plans, while existing pilots remain explicit',()=>{
  const s={version:1,planId:'solo',status:'trial',accessUntil:1001};
  assert.equal(subscriptionState(s,1000).writable,true);
  assert.equal(subscriptionState(s,1001).writable,false);
  assert.equal(subscriptionState({...s,planId:'unknown'},1000).writable,false);
  assert.equal(subscriptionState({...s,status:'paused'},1000).writable,false);
  assert.equal(subscriptionState({...s,accessUntil:null},1000).writable,false);
  assert.equal(subscriptionState({status:'pilot'},1000).status,'legacy_pilot');
});
test('vehicle capacity counts shared vehicles once, unassigned enquiries individually and excludes completed history',()=>{
  const keys=activeVehicleKeys([{id:'a',vehicleId:'a',status:'reserved'},{id:'b',status:'sold'}],[{id:'c',vehicleId:'a',currentStage:'enquiry'},{id:'d',currentStage:'enquiry'},{id:'e',currentStage:'delivered'}],[{id:'a',stage:'prepared'},{id:'b',stage:'stocked'}]);
  assert.deepEqual([...keys].sort(),['case:d','vehicle:a']);
});
