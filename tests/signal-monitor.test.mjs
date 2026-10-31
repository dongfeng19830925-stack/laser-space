import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createSignalFusion} from '../laser-room/src/signal-monitor.js';
import {createWalkers} from '../laser-room/src/walkers.js';
import {lensFov,fitCamera} from '../src/camera-fit.js';

const layout=JSON.parse(readFileSync(new URL('../public/scene-layout.json',import.meta.url)));
const plan=JSON.parse(readFileSync(new URL('../public/camera-plan.json',import.meta.url)));
function entry(source,group,angle){
  const fov=lensFov(angle),fit=fitCamera(source.position,group.targets,fov),camera=new THREE.PerspectiveCamera(fov.vertical,fov.aspect,.015,100);
  camera.up.set(0,0,1);camera.position.fromArray(source.position);camera.lookAt(new THREE.Vector3(...source.position).add(new THREE.Vector3(...fit.forward)));camera.updateMatrixWorld();
  return{...source,group,camera};
}
const floor=plan.floor.filter(c=>c.installed).map(c=>entry(c,c.current,85)),wall=plan.wall.map(c=>entry(c,c,120));
const beamFor=receiver=>layout.beams.find(b=>b.receiverId===receiver.id&&b.color==='red');
function blockingBox(camera,receiver){
  const box=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  box.position.copy(camera.position).lerp(new THREE.Vector3(...beamFor(receiver).spot),.2);box.updateMatrixWorld();return box;
}
function fusionWith(meshes=[]){const fusion=createSignalFusion(layout,meshes);fusion.configure(floor,wall);return fusion;}

test('actual six floor cameras pair all 72 points; wall cameras each own four columns',()=>{
  const states=fusionWith().sample(new Map(),true,[]);
  assert.equal(states.length,144);
  assert(states.filter(s=>s.kind==='floor').every(s=>s.dot&&s.ring&&!s.alarm));
  for(const s of states){const expected=s.kind==='floor'?floor.filter(c=>s.row>=c.group.rows[0]&&s.row<=c.group.rows[1]):wall.filter(c=>s.row>=c.group.rows[0]&&s.row<=c.group.rows[1]);assert.deepEqual(new Set(s.cameraIds),new Set(expected.map(c=>c.id)));}
});

test('one camera view occluded keeps the other white indicator without alarming',()=>{
  const fusion=fusionWith(),receiver=layout.receivers.find(r=>r.kind==='floor'&&r.row===1&&r.slot===1),box=blockingBox(floor[0].camera,receiver);
  const state=fusion.sample(new Map(),true,[{colliders:[box]}]).find(s=>s.id===receiver.id);
  assert.equal(state.dot,false);assert.equal(state.ring,true);assert.equal(state.alarm,false);
  const staticState=fusionWith([box]).sample(new Map(),true,[]).find(s=>s.id===receiver.id);
  assert.equal(staticState.dot,false);assert.equal(staticState.ring,true);assert.equal(staticState.alarm,false);
});

test('red beam interruption alarms both floor views; green alarms every monitored point',()=>{
  const fusion=fusionWith(),receiver=layout.receivers.find(r=>r.kind==='floor'),beam=beamFor(receiver);
  const blocked=fusion.sample(new Map([[beam.id,{blocked:true}]]),true,[]).find(s=>s.id===receiver.id);
  assert(!blocked.dot&&!blocked.ring&&blocked.alarm);
  const green=fusion.sample(new Map(),false,[]);
  assert(green.every(s=>s.uncovered?!s.alarm:s.alarm));
});

test('wall is a single white ring; only unavailable top points become blue',()=>{
  const base=fusionWith().sample(new Map(),true,[]),receiver=layout.receivers.find(r=>r.kind==='wall'&&r.row===2&&r.slot===3),box=blockingBox(wall[0].camera,receiver);
  const blocked=fusionWith([box]).sample(new Map(),true,[]).find(s=>s.id===receiver.id);
  assert(!blocked.dot&&!blocked.ring&&blocked.alarm&&!blocked.uncovered);
  assert(base.filter(s=>s.kind==='wall').every(s=>!s.dot));
  assert(base.filter(s=>s.uncovered).every(s=>s.kind==='wall'&&s.slot===6&&!s.alarm));
  const top=base.find(s=>s.kind==='wall'&&s.slot===6&&s.ring),camera=wall.find(c=>c.id===top.cameraIds[0]).camera;
  const hiddenTop=fusionWith([blockingBox(camera,layout.receivers.find(r=>r.id===top.id))]).sample(new Map(),true,[]).find(s=>s.id===top.id);
  assert(hiddenTop.uncovered&&!hiddenTop.alarm);
});

test('single player can cross all three zones; existing three/four player modes remain available',()=>{
  const walkers=createWalkers(new THREE.Scene(),layout);walkers.reset('single');assert.equal(walkers.active().length,1);
  const p=walkers.people[0];Object.assign(p,{distance:.2,sign:1,speed:1,targetSpeed:1,decision:Infinity,pause:0,goalY:walkers.midY});
  let min=Infinity,max=-Infinity;
  for(let i=0;i<2500;i++){walkers.update(.02);assert.equal(walkers.active().length,1);min=Math.min(min,p.distance);max=Math.max(max,p.distance);assert(p.distance>=.2&&p.distance<=Math.abs(walkers.exit-walkers.entry)-.2);}
  assert(max-min>9);walkers.seek(9.41);assert(!walkers.walking);assert(Math.abs(walkers.info().p1-9.41)<1e-8);
  walkers.reset('zones');assert.equal(walkers.active().length,3);walkers.reset('free');assert.equal(walkers.active().length,4);
});
