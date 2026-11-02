import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animateVehicle } from '../vehicles.js';

function model() {
  const mesh=new THREE.Group();
  mesh.userData={body:new THREE.Group(),driver:new THREE.Group(),shield:new THREE.Group(),wheelGroups:[],impact:0,shock:0,shockAge:0,previousSpeed:0};
  return mesh;
}
test('vehicle impacts are consumed and spring motion settles',()=>{
  const car=model(),entity={x:4,z:8,angle:.2,speed:0};
  car.userData.impact=1;
  animateVehicle(car,entity,1,1/60);
  assert.equal(car.userData.impact,0);
  assert.ok(Math.abs(car.userData.body.position.y)>.01);
  for(let i=0;i<180;i++) animateVehicle(car,entity,1+i/60,1/60);
  assert.ok(car.userData.shock<.000001);
  assert.ok(Math.abs(car.userData.body.position.y)<.004);
  assert.equal(car.position.x,4);assert.equal(car.position.z,8);
});
test('reduced effects suppress every chassis and driver shake including impacts',()=>{
  const car=model();car.userData.impact=1;
  animateVehicle(car,{x:0,z:0,angle:0,speed:40,boosting:true},1,1/60,1,false);
  car.userData.impact=1;
  animateVehicle(car,{x:0,z:0,angle:0,speed:40,boosting:true},2,1/60,1,true);
  assert.equal(car.userData.body.position.y,0);
  assert.deepEqual(car.userData.body.rotation.toArray().slice(0,3),[0,0,0]);
  assert.equal(car.userData.driver.position.y,1.76);
  assert.deepEqual(car.userData.driver.rotation.toArray().slice(0,3),[0,0,0]);
  assert.equal(car.userData.impact,0);assert.equal(car.userData.shock,0);
});
