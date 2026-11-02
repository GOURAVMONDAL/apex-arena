import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaGame, VEHICLES } from '../game.js';
import { VEHICLE_ROSTER, vehicleIndex } from '../roster.js';
import { createVehicle, disposeVehicle } from '../vehicles.js';

test('all six vehicles survive selection, a run and restart with distinct handling',()=>{
  assert.equal(VEHICLE_ROSTER.length,6);
  assert.equal(new Set(VEHICLES.map(v=>`${v.speed}/${v.turn}/${v.damage}`)).size,6);
  for(let index=0;index<VEHICLES.length;index++){
    const game=new ArenaGame({seed:42});game.setVehicle(index);game.start();
    for(let frame=0;frame<240;frame++)game.update(1/60,{throttle:1});
    assert.equal(game.state.vehicle,index);assert.ok(game.state.player.speed>0);
    assert.ok(Number.isFinite(game.state.player.x));game.restart();assert.equal(game.state.vehicle,index);
  }
  assert.equal(vehicleIndex(NaN),0);assert.equal(vehicleIndex(99),5);assert.equal(vehicleIndex(-1),0);
});

test('all six rendered chassis build with four animated wheels and unique silhouettes',()=>{
  const previous=globalThis.document;
  const gradient={addColorStop(){}};
  const context=new Proxy({createRadialGradient:()=>gradient},{get:(target,key)=>target[key]??(()=>{})});
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
  try{
    const signatures=[];
    for(let index=0;index<VEHICLES.length;index++){
      const model=createVehicle({car:index});assert.equal(model.userData.vehicle,index);
      assert.equal(model.userData.wheelGroups.length,4);
      let vertices=0;model.traverse(mesh=>{vertices+=mesh.geometry?.attributes.position.count||0;});
      signatures.push(vertices);disposeVehicle(model);
    }
    assert.equal(new Set(signatures.slice(2)).size,4);
  }finally{globalThis.document=previous;}
});
