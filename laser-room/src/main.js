import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const scene=new THREE.Scene();scene.background=new THREE.Color('#080d13');scene.fog=new THREE.FogExp2('#080d13',.018);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.03,150);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;document.querySelector('#viewport').appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.3;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.98;
scene.add(new THREE.HemisphereLight(0xaccfe5,0x162030,2.7));const light=new THREE.DirectionalLight(0xd1f4ff,4);light.position.set(4,10,0);scene.add(light);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,23),new THREE.MeshStandardMaterial({color:0x111d29,roughness:.65,metalness:.35}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-.13,4.95);scene.add(floor);
const grid=new THREE.GridHelper(22,44,0x34505b,0x1c2c39);grid.position.set(0,-.12,4.95);scene.add(grid);
// Opaque side panels: receiver faces remain inside the room.
const sideWalls=new THREE.Group();scene.add(sideWalls);
const wallMaterial=new THREE.MeshStandardMaterial({color:0x263542,roughness:.9,side:THREE.DoubleSide});
for(const side of [-1,1]){const wall=new THREE.Mesh(new THREE.BoxGeometry(.06,2.94,10.1),wallMaterial);wall.position.set(side*1.49,1.4,4.95);sideWalls.add(wall);}
const frameMat=new THREE.MeshStandardMaterial({color:0x3a4d5d,metalness:.75,roughness:.32});const emitterMat=new THREE.MeshStandardMaterial({color:0x71f6d4,emissive:0x31bb94,emissiveIntensity:1.5});const receiverMat=new THREE.MeshStandardMaterial({color:0x78b7ed,emissive:0x285e9c,emissiveIntensity:.7});
const beamMat=new THREE.MeshBasicMaterial({color:0x6dffce,transparent:true,opacity:.88,depthWrite:false});const glowMat=new THREE.MeshBasicMaterial({color:0x32e8b3,transparent:true,opacity:.055,depthWrite:false,blending:THREE.AdditiveBlending});
const cyl=new THREE.CylinderGeometry(.004,.004,2.8,6),glow=new THREE.CylinderGeometry(.019,.019,2.8,6),emit=new THREE.SphereGeometry(.025,10,8),receive=new THREE.BoxGeometry(.052,.052,.035);
const frames=[],beams=[];
function box(group,w,h,d,x,y,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),frameMat);mesh.position.set(x,y,z);group.add(mesh);}
function label(text){const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#a7bccb';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,42);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));sp.scale.set(1.2,.3,1);return sp;}
for(let n=0;n<12;n++){const z=n*.9,fg=new THREE.Group(),bg=new THREE.Group();scene.add(fg,bg);frames.push(fg);beams.push(bg);box(fg,.07,2.94,.07,-1.435,1.4,z);box(fg,.07,2.94,.07,1.435,1.4,z);box(fg,2.8,.07,.07,0,2.835,z);box(fg,2.8,.07,.07,0,-.035,z);
for(let i=1;i<=6;i++){const v=i*.4;for(let direction=0;direction<2;direction++){const vertical=direction===0;for(const [geo,mat] of [[cyl,beamMat],[glow,glowMat]]){const beam=new THREE.Mesh(geo,mat);beam.position.set(vertical?v-1.4:0,vertical?1.4:v,z);if(!vertical)beam.rotation.z=Math.PI/2;bg.add(beam);}const a=new THREE.Mesh(emit,emitterMat),b=new THREE.Mesh(receive,receiverMat);if(vertical){a.position.set(v-1.4,2.8,z);b.position.set(v-1.4,0,z);b.rotation.x=Math.PI/2;}else{a.position.set(1.4,v,z);b.position.set(-1.4,v,z);b.rotation.y=Math.PI/2;}fg.add(a,b);}}
const number=label(String(n+1).padStart(2,'0'));number.position.set(-1.9,.1,z);scene.add(number);}
for(const [txt,pos] of [['2.8 m',[0,3.2,0]],['9.9 m',[2.05,.1,4.95]],['入口',[0,.02,-.9]],['出口',[0,.02,10.8]]]){const s=label(txt);s.position.set(...pos);scene.add(s);}
// Horizontal FOV is configurable; camera remains landscape while its physical orientation is rotated 90 degrees.
const sensorAspect=16/9, cameraBodies=new THREE.Group(), coverageGroup=new THREE.Group();
scene.add(cameraBodies,coverageGroup);
const securityCameras=Array.from({length:6},(_,i)=>{
 const z=1.35+(i%3)*3.6;
 const c=new THREE.PerspectiveCamera(36,sensorAspect,.06,3.0);
 c.position.set(0,2.8,z);c.up.set(-1,0,0);c.lookAt(0,0,z);c.updateMatrixWorld();
 const body=new THREE.Mesh(new THREE.BoxGeometry(.24,.08,.09),new THREE.MeshStandardMaterial({color:0x647587,metalness:.5,roughness:.4}));body.position.set(0,2.86,z);body.rotation.y=Math.PI/2;cameraBodies.add(body);
 const lens=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.05,16),new THREE.MeshStandardMaterial({color:0x388bb3,emissive:0x183c56}));lens.position.set(0,2.795,z);cameraBodies.add(lens);
 const tag=label('CAM 0'+(i+1));tag.position.set(0,3.2,z);cameraBodies.add(tag);
 return c;
});
let activeCamera=-1,horizontalFov=90,cameraLayout='cross';
function cameraInfo(){const width=2*2.8*Math.tan(THREE.MathUtils.degToRad(horizontalFov/2)),depth=width/sensorAspect;
 document.querySelector('#coverage-value').hidden=cameraLayout!=='top';document.querySelector('#coverage-value').textContent=`地面覆盖约 ${depth.toFixed(2)} × ${width.toFixed(2)}m；每4列跨度2.70m`;
 window.__LASER_ROOM_CAMERAS__={activeCamera,horizontalFov,aspect:sensorAspect,rollDegrees:cameraLayout==='top'?90:0,layout:cameraLayout,mounts:securityCameras.map(c=>c.position.toArray()),floorCoverage:cameraLayout==='top'?[depth,width]:null};
}
function updateFov(){horizontalFov=Number(document.querySelector('#camera-fov').value);document.querySelector('#fov-value').textContent=horizontalFov+'°';
 for(const child of [...coverageGroup.children]){coverageGroup.remove(child);child.geometry?.dispose();child.material?.dispose();}
 for(const [index,c] of securityCameras.entries()){c.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontalFov/2))/sensorAspect));c.updateProjectionMatrix();
 if(cameraLayout==='top'&&index>=3)continue;const helper=new THREE.CameraHelper(c);helper.setColors(0xf6b95c,0xf6b95c,0xf6b95c,0x758995,0x758995);coverageGroup.add(helper);}
 cameraInfo();
}
document.querySelector('#camera-fov').oninput=updateFov;
document.querySelector('#coverage').onchange=e=>{coverageGroup.visible=activeCamera<0&&e.target.checked;};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{
 activeCamera=Number(b.dataset.camera);controls.enabled=false;cameraBodies.visible=false;coverageGroup.visible=false;
 document.querySelectorAll('[data-view]').forEach(x=>x.classList.remove('active'));
 document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('active',x===b));
 document.querySelector('#status').textContent=`● CAM 0${activeCamera+1} · ${cameraLayout==='top'?'顶部向下':'左右相向斜拍'} · 16:9`;
 cameraInfo();
});
updateFov();
const poses={overview:[[9,7,-9],[0,1,4.1]],front:[[0,1.4,-6],[0,1.4,0]],inside:[[0,1.45,-.9],[0,1.4,9.9]],top:[[0,17,4.95],[0,0,4.95]]};
function view(name){activeCamera=-1;controls.enabled=true;cameraBodies.visible=true;coverageGroup.visible=document.querySelector('#coverage').checked;document.querySelectorAll('[data-camera]').forEach(b=>b.classList.remove('active'));document.querySelector('#status').textContent='● 模拟就绪 · 真实比例 1:1';cameraInfo();const [p,t]=poses[name];camera.position.set(...p);controls.target.set(...t);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
const laserToggle=document.querySelector('#beams'),frameToggle=document.querySelector('#shell'),layer=document.querySelector('#layer');
function update(){const selected=Number(layer.value);frames.forEach((f,i)=>{f.visible=frameToggle.checked&&(!selected||i===selected-1);beams[i].visible=laserToggle.checked&&(!selected||i===selected-1);});document.querySelector('#layer-value').textContent=selected?`第${selected}框`:'全部12框';}
laserToggle.onchange=frameToggle.onchange=layer.oninput=update;
view('overview');
const viewport=document.querySelector('#viewport');
const feedRenderers=securityCameras.map((c,i)=>{const r=new THREE.WebGLRenderer({antialias:true});r.setPixelRatio(Math.min(devicePixelRatio,1.5));r.outputColorSpace=renderer.outputColorSpace;r.toneMapping=renderer.toneMapping;document.querySelector('#feed-'+i).appendChild(r.domElement);return r;});
function resizeViews(){camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewport.clientWidth,viewport.clientHeight);feedRenderers.forEach((r,i)=>{const el=document.querySelector('#feed-'+i);r.setSize(el.clientWidth,el.clientWidth/sensorAspect);});}
new ResizeObserver(resizeViews).observe(viewport);resizeViews();
function setLayout(){
 cameraLayout=document.querySelector('#camera-layout').value;
 securityCameras.forEach((c,i)=>{const group=i%3,center=1.35+group*3.6;
 if(cameraLayout==='top'){c.position.set(0,2.8,center);c.up.set(-1,0,0);c.lookAt(0,0,center);c.far=3;}
 else{const side=i<3?1:-1;c.position.set(side*1.28,2.5,center-side*1.2);c.up.set(0,1,0);c.lookAt(0,1,center);c.far=8;}
 c.updateProjectionMatrix();c.updateMatrixWorld();
 const body=cameraBodies.children[i*3],lens=cameraBodies.children[i*3+1],tag=cameraBodies.children[i*3+2];
 body.position.copy(c.position).add(new THREE.Vector3(0,.06,0));body.quaternion.copy(c.quaternion);lens.position.copy(c.position);lens.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),c.getWorldDirection(new THREE.Vector3()));tag.position.copy(c.position).add(new THREE.Vector3(0,.32,0));body.visible=lens.visible=tag.visible=cameraLayout!=='top'||i<3;
 document.querySelector('#feed-'+i).closest('.monitor').hidden=cameraLayout==='top'&&i>=3;
 document.querySelector('[data-camera="'+i+'"]').hidden=cameraLayout==='top'&&i>=3;
 const text=cameraLayout==='top'?`第${group*4+1}–${group*4+4}列 · 顶拍`:`第${group*4+1}–${group*4+4}列 · ${i<3?'入口左侧':'入口右侧'}斜拍`;
 document.querySelector('[data-expand-camera="'+i+'"] span').textContent=text;
 });
 document.querySelector('#layout-note').textContent=cameraLayout==='top'?'原机位：高2.8m，每4列中心朝下。':'试验机位：左右封板内侧（距中线1.28m），高2.5m；纵深错开±1.2m，相向看本组中心高1m。封板不透视。';
 document.querySelector('.rail-heading span').textContent=cameraLayout==='top'?'原3台顶拍':'6台相向斜拍';
 document.querySelector('#camera-rail').classList.toggle('six-cameras',cameraLayout==='cross');
 updateFov();resizeViews();view('overview');
}
document.querySelector('#camera-layout').onchange=setLayout;
document.querySelectorAll('[data-expand-camera]').forEach(b=>b.onclick=()=>document.querySelector('[data-camera="'+b.dataset.expandCamera+'"]').click());

// A 1.80 m articulated mannequin; walking is a visual simulation, not hardware input.
const person=new THREE.Group();scene.add(person);
const shirt=new THREE.MeshStandardMaterial({color:0xffa650,roughness:.7});
const trousers=new THREE.MeshStandardMaterial({color:0x365a7d,roughness:.85});
const skin=new THREE.MeshStandardMaterial({color:0xe9b18b,roughness:.8});
const shoes=new THREE.MeshStandardMaterial({color:0x202b38,roughness:.8});
function part(geometry,material,parent,x,y,z){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
part(new THREE.SphereGeometry(.135,20,16),skin,person,0,1.665,0);
part(new THREE.CylinderGeometry(.063,.068,.10,12),skin,person,0,1.51,0);
part(new THREE.CylinderGeometry(.23,.17,.50,16),shirt,person,0,1.245,0).scale.z=.63;
part(new THREE.BoxGeometry(.32,.17,.21),trousers,person,0,.94,0);
const legs=[],arms=[];
for(const side of [-1,1]){
 const leg=new THREE.Group();leg.position.set(side*.095,.89,0);person.add(leg);legs.push(leg);
 part(new THREE.CylinderGeometry(.075,.055,.79,12),trousers,leg,0,-.395,0);
 part(new THREE.BoxGeometry(.12,.10,.25),shoes,leg,0,-.84,.055);
 const arm=new THREE.Group();arm.position.set(side*.24,1.43,0);person.add(arm);arms.push(arm);
 part(new THREE.CylinderGeometry(.067,.055,.27,12),shirt,arm,0,-.12,0);
 part(new THREE.CylinderGeometry(.05,.04,.29,12),skin,arm,0,-.39,0);
 part(new THREE.SphereGeometry(.047,10,8),skin,arm,0,-.555,0);
}
// Two abreast, two rows; IDs and shirt colors stay consistent in every camera.
const colors=[0xffa650,0x6bd5f5,0xd69bf5,0x97de7b];
const people=Array.from({length:4},(_,i)=>{
 const root=person.clone(true);scene.add(root);
 const outfit=shirt.clone();outfit.color.setHex(colors[i]);const colliders=[];
 root.traverse(node=>{if(node.isMesh){if(node.material===shirt)node.material=outfit;colliders.push(node);}});
 const tag=label('P'+(i+1));tag.position.set(0,2.02,0);tag.scale.set(.5,.125,1);root.add(tag);
 return {id:'P'+(i+1),root,x:i%2===0?-.65:.65,lag:i<2?0:1.2,legs:[root.children[4],root.children[6]],arms:[root.children[5],root.children[7]],colliders};
});
scene.remove(person);
// Independent, smooth random routes with short pauses and personal-space checks.
let walking=true,walkZ=0,lastWalkTime=performance.now();
const walkButton=document.querySelector('#walk-toggle'),walkSlider=document.querySelector('#walk-progress');
const randomBetween=(lo,hi)=>lo+Math.random()*(hi-lo);
function chooseRoute(p){p.goalX=randomBetween(-.92,.92);p.targetSpeed=randomBetween(.65,1.35);p.decision=randomBetween(1.4,3.8);p.pause=Math.random()<.25?randomBetween(.5,1.8):0;}
function randomizePeople(atEntrance=false){people.forEach((p,i)=>{p.x=randomBetween(-.85,.85);p.z=atEntrance?-.8-i*1.1:.5+i*2.5+randomBetween(-.2,.2);p.phase=randomBetween(0,Math.PI*2);p.speed=randomBetween(.7,1.2);p.yaw=0;p.exitWait=0;chooseRoute(p);});}
function syncWalk(){people.forEach(p=>{p.root.position.set(p.x,0,p.z);p.root.rotation.y=p.yaw;});walkZ=people[0].z;walkSlider.value=String(walkZ);document.querySelector('#walk-position').textContent=walkZ<0?'入口外':walkZ>9.9?'出口外':walkZ.toFixed(2)+'m';walkButton.textContent=walking?'暂停行走':'继续行走';window.__LASER_ROOM_WALKER__={height:1.8,mode:'independent-random',z:walkZ,walking,count:4,people:people.map(p=>({id:p.id,height:1.8,x:p.x,z:p.z,speed:p.speed,paused:p.pause>0}))};}
function seekP1(z){const shift=z-people[0].z;people.forEach(p=>{p.z+=shift;});walking=false;syncWalk();inspectContact(true);}
walkButton.onclick=()=>{walking=!walking;syncWalk();};
document.querySelector('#walk-reset').onclick=()=>{randomizePeople(true);walking=true;syncWalk();inspectContact(true);};
walkSlider.oninput=()=>seekP1(Number(walkSlider.value));
function animateWalker(){const now=performance.now(),dt=Math.min((now-lastWalkTime)/1000,.05);lastWalkTime=now;
 for(const p of people){let moved=0;
 if(walking){p.decision-=dt;if(p.decision<=0)chooseRoute(p);
 if(p.z>10.8){p.exitWait+=dt;if(p.exitWait>1.5){const z=randomBetween(-1.8,-.8),x=randomBetween(-.85,.85);if(people.every(q=>q===p||Math.hypot(x-q.x,z-q.z)>.7)){p.z=z;p.x=x;p.exitWait=0;chooseRoute(p);}}}
 else if(p.pause>0){p.pause-=dt;p.speed=THREE.MathUtils.damp(p.speed,0,5,dt);}
 else{p.speed=THREE.MathUtils.damp(p.speed,p.targetSpeed,2,dt);let dx=THREE.MathUtils.clamp((p.goalX-p.x)*.7,-.28,.28)*dt,dz=p.speed*dt;
 const nx=THREE.MathUtils.clamp(p.x+dx,-.95,.95),nz=p.z+dz;
 const blocked=people.some(q=>q!==p&&Math.hypot(nx-q.x,nz-q.z)<.60);
 if(!blocked){p.x=nx;p.z=nz;moved=Math.hypot(dx,dz);p.yaw=THREE.MathUtils.damp(p.yaw,Math.atan2(dx,dz),5,dt);p.phase+=moved*7;}
 else{p.decision=Math.min(p.decision,.4);p.speed=THREE.MathUtils.damp(p.speed,.2,4,dt);}
 }}
 const swing=walking&&moved>0?Math.sin(p.phase)*.30:0;p.legs[0].rotation.x=swing;p.legs[1].rotation.x=-swing;p.arms[0].rotation.x=-swing*.8;p.arms[1].rotation.x=swing*.8;
 }syncWalk();
}
randomizePeople();syncWalk();
const contactRay=new THREE.Raycaster(),rayOrigin=new THREE.Vector3(),rayDirection=new THREE.Vector3();
const hitMaterial=new THREE.MeshBasicMaterial({color:0xff5b52,depthWrite:false});
let lastContactTime=-Infinity;
function inspectContact(force=false){const now=performance.now();if(!force&&now-lastContactTime<100)return;lastContactTime=now;people.forEach(p=>p.root.updateWorldMatrix(true,true));const contacts=[];
 for(let n=0;n<12;n++)for(let k=1;k<=6;k++)for(let d=0;d<2;d++){
 const v=k*.4,z=n*.9;rayOrigin.set(d===0?v-1.4:-1.4,d===0?2.8:v,z);rayDirection.set(d===0?0:1,d===0?-1:0,0);contactRay.set(rayOrigin,rayDirection);contactRay.near=0;contactRay.far=2.8;
 const hitPeople=people.filter(p=>Math.abs(p.root.position.z-z)<.8&&contactRay.intersectObjects(p.colliders,false).length>0).map(p=>p.id);const hit=hitPeople.length>0;const idx=(k-1)*4+d*2;beams[n].children[idx].material=hit?hitMaterial:beamMat;beams[n].children[idx+1].material=hit?hitMaterial:glowMat;
 if(hit)contacts.push({frame:n+1,direction:d===0?'上下':'左右',beam:k,people:hitPeople});}
 window.__LASER_ROOM_CONTACTS__=contacts;const summary=document.querySelector('#collision-summary');summary.textContent= `4人随机行走 · P1 ${walkZ.toFixed(2)}m · 模型${contacts.length?'碰到'+contacts.length+'条光束':'当前未碰线'}（几何模拟）`;summary.style.color=contacts.length?'#ff8a78':'#83dfbf';document.querySelector('#contact-status').textContent=contacts.length?'模型碰线：'+contacts.map(h=>`${h.people.join("/")}：第${h.frame}列${h.direction}${h.beam}号`).join('、'):'模型当前未碰线（非图像识别）';
}
document.querySelector('#inspect-941').onclick=()=>seekP1(9.41);
setLayout();
window.__LASER_ROOM__={frames:12,pairsPerFrame:12,totalPairs:144,crossingsPerFrame:36,frameSize:2.8,beamSpacing:.4,frameSpacing:.9,depth:9.9,positions:Array.from({length:6},(_,i)=>(i+1)*.4)};
renderer.setAnimationLoop(()=>{
 animateWalker();
 inspectContact();
 controls.update();
 sideWalls.visible=activeCamera>=0||!document.querySelector('#wall-cutaway').checked;
 const vw=viewport.clientWidth,vh=viewport.clientHeight;
 if(activeCamera<0){renderer.setViewport(0,0,vw,vh);renderer.setScissorTest(false);renderer.render(scene,camera);}
 else{const w=Math.min(vw,vh*sensorAspect),h=w/sensorAspect,x=(vw-w)/2,y=(vh-h)/2;
 renderer.setScissorTest(false);renderer.setViewport(0,0,vw,vh);renderer.clear();renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);renderer.render(scene,securityCameras[activeCamera]);renderer.setScissorTest(false);}
sideWalls.visible=true;
const bodiesVisible=cameraBodies.visible,coverageVisible=coverageGroup.visible;cameraBodies.visible=false;coverageGroup.visible=false;
 feedRenderers.forEach((r,i)=>{if(cameraLayout!=='top'||i<3)r.render(scene,securityCameras[i]);});cameraBodies.visible=bodiesVisible;coverageGroup.visible=coverageVisible;
});document.querySelector('#status').textContent='● 模拟就绪 · 真实比例 1:1';

view('overview');

walking=true;syncWalk();inspectContact(true);
