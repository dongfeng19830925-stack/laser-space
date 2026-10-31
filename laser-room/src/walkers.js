import * as THREE from 'three';

// Original articulated mannequin, mounted from local Y-up into Rhino's Z-up.
export function createWalkers(scene,layout){
  const template=new THREE.Group(),shirt=new THREE.MeshStandardMaterial({color:0xffa650,roughness:.7}),trousers=new THREE.MeshStandardMaterial({color:0x365a7d,roughness:.85}),skin=new THREE.MeshStandardMaterial({color:0xe9b18b,roughness:.8}),shoes=new THREE.MeshStandardMaterial({color:0x202b38,roughness:.8});
  const part=(geometry,material,parent,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  part(new THREE.SphereGeometry(.135,16,12),skin,template,0,1.665,0);part(new THREE.CylinderGeometry(.063,.068,.10,10),skin,template,0,1.51,0);part(new THREE.CylinderGeometry(.23,.17,.5,12),shirt,template,0,1.245,0).scale.z=.63;part(new THREE.BoxGeometry(.32,.17,.21),trousers,template,0,.94,0);
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.095,.89,0);template.add(leg);part(new THREE.CylinderGeometry(.075,.055,.79,10),trousers,leg,0,-.395,0);part(new THREE.BoxGeometry(.12,.10,.25),shoes,leg,0,-.84,.055);
    const arm=new THREE.Group();arm.position.set(side*.24,1.43,0);template.add(arm);part(new THREE.CylinderGeometry(.067,.055,.27,10),shirt,arm,0,-.12,0);part(new THREE.CylinderGeometry(.05,.04,.29,10),skin,arm,0,-.39,0);part(new THREE.SphereGeometry(.047,8,6),skin,arm,0,-.555,0);
  }
  const floor=layout.receivers.filter(r=>r.kind==='floor'),ys=floor.map(r=>r.center[1]),midY=(Math.min(...ys)+Math.max(...ys))/2;
  const direction=layout.entryHighX?-1:1,first=layout.rows[0],last=layout.rows.at(-1),entry=first-direction*.45,exit=last+direction*.45,travel=Math.abs(exit-entry),zoneLength=travel/3;
  const people=[0xffa650,0x6bd5f5,0xd69bf5,0x97de7b].map((color,i)=>{
    const root=new THREE.Group(),body=template.clone(true),colliders=[];body.rotation.x=Math.PI/2;root.add(body);scene.add(root);const outfit=shirt.clone();outfit.color.setHex(color);
    body.traverse(node=>{if(node.isMesh){if(node.material===shirt)node.material=outfit;colliders.push(node);}});
    return{id:'P'+(i+1),root,body,colliders,legs:[body.children[4],body.children[6]],arms:[body.children[5],body.children[7]],distance:0,y:midY,speed:1,phase:0,sign:1,decision:0,pause:0,goalY:midY};
  });
  let mode='zones',walking=true;
  const random=(lo,hi)=>lo+Math.random()*(hi-lo),active=()=>people.filter(p=>p.root.visible);
  function choose(p){p.goalY=midY+random(-.7,.7);p.targetSpeed=random(.65,1.25);p.decision=random(1.5,3.5);p.pause=Math.random()<.2?random(.3,1.3):0;}
  function reset(nextMode=mode){mode=nextMode;people.forEach((p,i)=>{p.root.visible=mode==='single'?i===0:mode==='free'||i<3;p.distance=mode==='zones'?i*zoneLength+random(.6,zoneLength-.6):random(.4,travel-.4);p.y=midY+random(-.6,.6);p.sign=1;p.speed=random(.7,1.1);p.phase=0;choose(p);});walking=true;update(0);}
  function sync(){for(const p of active()){p.root.position.set(entry+direction*p.distance,p.y,layout.floorZ);p.root.rotation.z=(direction*p.sign<0?Math.PI:0)+Math.PI/2;p.root.updateWorldMatrix(true,true);}}
  function update(dt){for(const [i,p]of people.entries()){
    if(!p.root.visible)continue;let moved=0;
    if(walking){p.decision-=dt;if(p.decision<=0)choose(p);if(p.pause>0)p.pause-=dt;else{
      p.speed=THREE.MathUtils.damp(p.speed,p.targetSpeed,2,dt);const lo=mode==='zones'?i*zoneLength+.35:.2,hi=mode==='zones'?(i+1)*zoneLength-.35:travel-.2;
      if(p.distance>=hi)p.sign=-1;if(p.distance<=lo)p.sign=1;
      const next=THREE.MathUtils.clamp(p.distance+p.sign*p.speed*dt,lo,hi),ny=THREE.MathUtils.damp(p.y,p.goalY,1,dt),nx=entry+direction*next;
      if(!active().some(q=>q!==p&&Math.hypot(nx-q.root.position.x,ny-q.y)<.6)){moved=Math.abs(next-p.distance);p.distance=next;p.y=ny;p.phase+=moved*7;}
    }}
    const swing=moved>0?Math.sin(p.phase)*.3:0;p.legs[0].rotation.x=swing;p.legs[1].rotation.x=-swing;p.arms[0].rotation.x=-swing*.8;p.arms[1].rotation.x=swing*.8;
  }sync();}
  function seek(progress){people[0].distance=(first+direction*progress-entry)/direction;walking=false;sync();}
  function info(){const list=active(),zones=list.map(p=>Math.max(0,Math.min(2,Math.floor(p.distance/zoneLength))));return{mode,walking,count:list.length,p1:(people[0].root.position.x-first)/direction,violation:mode==='zones'&&new Set(zones).size<list.length,people:list.map(p=>({id:p.id,position:p.root.position.toArray()}))};}
  reset();return{people,active,update,reset,seek,info,setWalking(value){walking=value;},get walking(){return walking;},first,last,entry,exit,midY,direction};
}
