import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Rhino3dmLoader} from 'three/addons/loaders/3DMLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {lensFov,fitCamera} from '../../src/camera-fit.js';
import {createWalkers} from './walkers.js';

const $=id=>document.getElementById(id),base=new URL('../',document.baseURI),viewport=$('viewport');
const scene=new THREE.Scene(),normalBackground=new THREE.Color(0x0b141c),blackBackground=new THREE.Color(0x010203);scene.background=normalBackground;
const camera=new THREE.PerspectiveCamera(45,1,.01,150);camera.up.set(0,0,1);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;viewport.append(renderer.domElement);
const feedRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});feedRenderer.setPixelRatio(1);feedRenderer.outputColorSpace=renderer.outputColorSpace;feedRenderer.toneMapping=renderer.toneMapping;
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.2;controls.maxDistance=150;
scene.add(new THREE.HemisphereLight(0xc2dcec,0x253b32,2.5));const light=new THREE.DirectionalLight(0xfff2df,3);light.position.set(4,-3,12);scene.add(light);
const coverageGroup=new THREE.Group(),labelGroup=new THREE.Group(),occlusionRoot=new THREE.Group(),dotGroup=new THREE.Group();scene.add(coverageGroup,labelGroup,occlusionRoot,dotGroup);occlusionRoot.visible=false;
const darkMaterial=new THREE.MeshBasicMaterial({color:0x010203,side:THREE.DoubleSide}),whiteMaterial=new THREE.MeshBasicMaterial({color:0xeaffea,side:THREE.DoubleSide,toneMapped:false}),redMaterial=new THREE.MeshBasicMaterial({color:0xff493d,side:THREE.DoubleSide,toneMapped:false}),greenMaterial=new THREE.MeshBasicMaterial({color:0x68ff8b,side:THREE.DoubleSide,toneMapped:false});
const ray=new THREE.Raycaster(),rayOrigin=new THREE.Vector3(),rayDirection=new THREE.Vector3();
let model,layout,plan,walkers,grid,modelBounds,items=[],wallItems=[],cameraNodes=[],sourcePaths=[],cameraEntries=[],activeCamera=-1,lastTime=performance.now(),lastSignal=-Infinity,lastFeeds=-Infinity,lastRender=-Infinity;
const beamStates=new Map(),dotEntries=[],sourceById=new Map(),labels=[];
const compact=matchMedia('(max-width:760px)');
$('controls-details').open=!compact.matches;compact.addEventListener('change',e=>{$('controls-details').open=!e.matches;});
function fail(error){$('loading').hidden=true;$('error').hidden=false;$('error').textContent='场景加载失败：'+error.message;console.error(error);}
function label(text){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.font='28px sans-serif';ctx.fillStyle='#bcf5df';ctx.textAlign='center';ctx.fillText(text,128,44);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false,transparent:true}));sprite.scale.set(.65,.16,1);return sprite;}
function sourceLayer(object,layers){let node=object;while(node&&node!==model){const index=node.userData.attributes?.layerIndex;if(index!==undefined)return layers[index]?.path||'';node=node.parent;}return '';}
function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);resize();

function preparePhysicalScene(){
  const raw=model.userData.layers||[],map=new Map(raw.map(l=>[l.id,l])),layers=raw.map(l=>{const names=[l.name],seen=new Set([l.id]);let p=map.get(l.parentLayerId);while(p&&!seen.has(p.id)){seen.add(p.id);names.unshift(p.name);p=map.get(p.parentLayerId);}return{path:names.join('::')};});
  const markerIds=new Set([...plan.floor,...plan.wall].map(c=>c.objectId)),pathIds=new Set(layout.beams.map(b=>b.id));
  const indexed=[],plain=[];modelBounds=new THREE.Box3();
  model.traverse(object=>{
    if(!object.isMesh){if(object.isSprite||object.isLine||object.isPoints)object.visible=false;return;}
    const layer=sourceLayer(object,layers);object.userData.layerPath=layer;items.push(object);
    if(object.userData.attributes?.id)sourceById.set(object.userData.attributes.id,object);
    object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();
    const materials=Array.isArray(object.material)?object.material:[object.material];for(const m of materials){m.side=THREE.DoubleSide;if(m.roughness!==undefined)m.roughness=.8;}
    if(/土建|墙面|石膏板|涂料/.test(layer)&&!layer.includes('反光板'))wallItems.push(object);
    object.geometry.computeBoundingBox();modelBounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    if(markerIds.has(object.userData.attributes?.id)){cameraNodes.push(object);return;}
    if(pathIds.has(object.userData.attributes?.id)){sourcePaths.push(object);return;}
    // One merged depth occluder per index format, shared by all monitor views.
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',object.geometry.attributes.position.clone());
    if(object.geometry.index)geometry.setIndex(object.geometry.index.clone());geometry.applyMatrix4(object.matrixWorld);
    (geometry.index?indexed:plain).push(geometry);
  });
  for(const list of [indexed,plain])if(list.length){const merged=mergeGeometries(list,false);if(!merged)throw new Error('Cannot prepare physical depth geometry');occlusionRoot.add(new THREE.Mesh(merged,darkMaterial));list.forEach(g=>g.dispose());}
  grid=new THREE.GridHelper(24,48,0x426a70,0x203940);grid.rotation.x=Math.PI/2;grid.position.set(modelBounds.getCenter(new THREE.Vector3()).x,walkers.midY,layout.floorZ-.01);scene.add(grid);
  const receivers=new Map(layout.receivers.map(r=>[r.id,r]));
  for(const beam of layout.beams){
    const receiver=receivers.get(beam.receiverId),mesh=new THREE.Mesh(new THREE.CircleGeometry(.025,16),beam.color==='red'?redMaterial:greenMaterial);mesh.position.fromArray(beam.spot);if(beam.kind==='wall')mesh.rotation.x=Math.PI/2;mesh.userData.signal=true;dotGroup.add(mesh);dotEntries.push({beam,receiver,mesh});beamStates.set(beam.id,{blocked:false,people:[]});
  }
  for(const c of [...plan.floor,...plan.wall]){const sprite=label(c.id);sprite.position.fromArray(c.position);sprite.position.z+=.14;labelGroup.add(sprite);labels.push({sprite,c});}
}
function updateVisibility(){
  if(!layout)return;const row=Number($('layer').value),color=$('light-mode').value;
  $('layer-value').textContent=row?'第'+row+'列':'全部'+layout.rows.length+'列';
  for(const entry of dotEntries){const state=beamStates.get(entry.beam.id);entry.mesh.visible=(!row||entry.beam.row===row)&&entry.beam.color===color&&!state.blocked;entry.mesh.material=entry.beam.color==='red'?redMaterial:greenMaterial;}
  const pathMap=new Map(layout.beams.map(b=>[b.id,b]));
  for(const object of sourcePaths){const beam=pathMap.get(object.userData.attributes.id);object.visible=$('beams').checked&&beam.color===color&&(!row||beam.row===row);}
  const future=$('camera-layout').value==='future',futureIds=new Set(plan.floor.filter(c=>!c.installed).map(c=>c.objectId));
  for(const node of cameraNodes)node.visible=future||!futureIds.has(node.userData.attributes.id);
  for(const {sprite,c}of labels)sprite.visible=c.installed!==false||future;
}
function updateWalkStatus(){
  const info=walkers.info();$('walk-toggle').textContent=info.walking?'暂停行走':'继续行走';$('walk-progress').value=String(info.p1);$('walk-position').textContent=info.p1.toFixed(2)+'m';
  $('phase-note').textContent=info.violation?'手动定位已越区；当前不满足每区最多1人的试验条件。':info.mode==='zones'?'3区单人试验：每人仅在自己的区域内独立变速、停顿和往返。':'4人自由行走压力对照，不作为3区单人阶段验收。';
  window.__LASER_ROOM_WALKER__=info;
}
function inspectContact(force=false){
  if(!layout)return;const now=performance.now();if(!force&&now-lastSignal<100)return;lastSignal=now;
  const contacts=[];
  for(const beam of layout.beams){
    rayOrigin.fromArray(beam.start);rayDirection.fromArray(beam.spot).sub(rayOrigin);const length=rayDirection.length();rayDirection.normalize();ray.set(rayOrigin,rayDirection);ray.near=.002;ray.far=length-.002;
    const people=walkers.active().filter(p=>Math.abs(p.root.position.x-beam.end[0])<.65&&ray.intersectObjects(p.colliders,false).length).map(p=>p.id);
    beamStates.set(beam.id,{blocked:people.length>0,people});if(people.length&&beam.color==='red')contacts.push({frame:beam.row,beam:beam.slot,direction:beam.kind,people});
  }
  updateVisibility();updateWalkStatus();
  const redOn=$('light-mode').value==='red',floorCount=layout.receivers.filter(r=>r.kind==='floor').length,wallCount=layout.receivers.filter(r=>r.kind==='wall').length,floorOff=redOn?contacts.filter(c=>c.direction==='floor').length:floorCount,wallOff=redOn?contacts.filter(c=>c.direction==='wall').length:wallCount;
  $('collision-summary').textContent='几何状态 · 地面红点 '+(floorCount-floorOff)+'/'+floorCount+' · 墙面红点 '+(wallCount-wallOff)+'/'+wallCount+' · 非实测';
  $('contact-status').textContent=!redOn?'当前模拟绿光：红色滤光视图中红点熄灭，按当前策略报警。':contacts.length?'红光光路遮挡：'+contacts.slice(0,8).map(c=>c.people.join('/')+' 第'+c.frame+'列'+(c.direction==='floor'?'地面':'墙面')+c.beam+'号').join('、')+(contacts.length>8?'…':''):'当前未计算到人体遮断红光。画面仍可能被人体遮住视线。';
  window.__LASER_ROOM_CONTACTS__=contacts;window.__LASER_ROOM_RECEIVERS__={total:floorCount+wallCount,lit:floorCount+wallCount-floorOff-wallOff,off:floorOff+wallOff};
}
function disposeCoverage(){for(const child of [...coverageGroup.children]){coverageGroup.remove(child);child.geometry?.dispose();child.material?.dispose();}}
function setLayout(resetAngle=false){
  if(!plan)return;const mode=$('camera-layout').value,wall=mode==='wall';if(resetAngle)$('camera-fov').value=String(wall?plan.wallNominalAngle:plan.floorNominalAngle);
  const angle=Number($('camera-fov').value),portrait=$('camera-orientation').value==='portrait',definition=$('fov-definition').value,lowering=wall?Number($('wall-lowering').value)/1000:0;
  $('fov-value').textContent=angle+'°';$('wall-lowering-label').hidden=!wall;$('wall-lowering-value').textContent=(lowering*1000).toFixed(0)+'mm';
  const sources=wall?plan.wall:plan.floor.filter(c=>mode==='future'||c.installed),selectedId=cameraEntries[activeCamera]?.id;disposeCoverage();
  cameraEntries=sources.map(source=>{
    const group=wall?source:source[mode],position=[...source.position];position[2]-=lowering;const fov=lensFov(angle,definition,portrait,plan.aspect),fit=fitCamera(position,group.targets,fov);
    const c=new THREE.PerspectiveCamera(fov.vertical,fov.aspect,.015,Math.max(...group.targets.map(p=>Math.hypot(...p.map((v,k)=>v-position[k]))))*1.1);c.up.set(0,0,1);c.position.fromArray(position);c.lookAt(new THREE.Vector3().fromArray(position.map((v,k)=>v+fit.forward[k])));c.updateMatrixWorld(true);
    const helper=new THREE.CameraHelper(c);helper.setColors(0xf6b95c,0xf6b95c,0xf6b95c,0x758995,0x758995);coverageGroup.add(helper);
    return{...source,group,camera:c,fit,fov,position};
  });
  activeCamera=selectedId?cameraEntries.findIndex(c=>c.id===selectedId):-1;controls.enabled=activeCamera<0;
  $('camera-count').textContent=cameraEntries.length+'台 · 模型原机位';$('camera-buttons').replaceChildren();$('camera-monitors').replaceChildren();
  for(const [index,entry]of cameraEntries.entries()){
    const button=document.createElement('button');button.textContent=entry.id;button.dataset.cameraId=entry.id;button.onclick=()=>selectCamera(index);$('camera-buttons').append(button);
    const article=document.createElement('article');article.className='monitor';article.dataset.cameraId=entry.id;
    const title=document.createElement('button');title.className='monitor-title';title.textContent=entry.id+' · 第'+entry.group.rows[0]+'–'+entry.group.rows[1]+'列';
    const detail=document.createElement('span');detail.textContent=(wall?'墙面':entry.group.playerView==='正面'?'朝入口':'朝出口')+' · 俯角'+entry.fit.pitch.toFixed(1)+'°';title.append(detail);title.onclick=()=>selectCamera(index);
    const feed=document.createElement('div');feed.className='camera-feed';feed.style.aspectRatio=String(entry.fov.aspect);entry.canvas=document.createElement('canvas');entry.canvas.width=portrait?360:640;entry.canvas.height=portrait?640:360;entry.context=entry.canvas.getContext('2d');feed.append(entry.canvas);
    const note=document.createElement('p');note.className='feed-note';note.textContent='模型坐标固定 · '+(entry.fit.covered?'理想视场可容纳目标':'当前视场不足');
    article.append(title,feed,note);$('camera-monitors').append(article);
  }
  feedRenderer.setSize(portrait?360:640,portrait?640:360,false);lastFeeds=-Infinity;
  $('layout-note').textContent=wall?'3个模型墙侧机位，分别观察4列、排除最高一行；下调仅为对照预演。':mode==='current'?'6个现有中心轴机位；每对朝入口/出口观察相同的4列地面红点。':'12个中心轴机位，含模型中标注未来采购的6个；每对观察2列。';
  updateVisibility();updateCameraInfo();
  window.__LASER_ROOM_CAMERAS__={layout:mode,activeCamera,aspect:portrait?9/16:16/9,mounts:cameraEntries.map(e=>e.position),sourceMounts:cameraEntries.map(e=>e.position.map((v,k)=>k===2?v+lowering:v)),cameraIds:cameraEntries.map(e=>e.id),modelHash:layout.source.sha256};
}
function updateCameraInfo(){
  if(!cameraEntries.length)return;const entry=cameraEntries[Math.max(0,activeCamera)],mm=entry.position.map(v=>(v*1000).toFixed(1));
  $('camera-position').textContent=entry.id+' 镜头参考坐标(mm)\nX '+mm[0]+' / Y '+mm[1]+' / Z '+mm[2]+'\n'+entry.fit.pitch.toFixed(1)+'°向下 · '+entry.fov.horizontal.toFixed(1)+'° × '+entry.fov.vertical.toFixed(1)+'°';
  document.querySelectorAll('[data-camera-id]').forEach(node=>node.classList.toggle('active',node.dataset.cameraId===cameraEntries[activeCamera]?.id));
  coverageGroup.visible=activeCamera<0&&$('coverage').checked;
  $('status').textContent=activeCamera<0?'● v2.0真实模型 · 相机原坐标 · 几何模拟':('● '+entry.id+' 实际机位画面 · '+($('receiver-only').checked?'接收点滤光预演':'普通视图'));
}
function selectCamera(index){activeCamera=index;controls.enabled=false;document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));updateCameraInfo();}
function view(name){
  if(!modelBounds)return;activeCamera=-1;controls.enabled=true;const center=modelBounds.getCenter(new THREE.Vector3()),size=modelBounds.getSize(new THREE.Vector3()),radius=size.length()/2;
  camera.up.set(0,0,1);
  if(name==='overview'){const vfov=THREE.MathUtils.degToRad(camera.fov),hfov=2*Math.atan(Math.tan(vfov/2)*camera.aspect),distance=radius/Math.sin(Math.min(vfov,hfov)/2)*1.05;controls.target.copy(center);camera.position.copy(center).addScaledVector(new THREE.Vector3(layout.entryHighX?1:-1,-1,.85).normalize(),distance);}
  else if(name==='top'){camera.up.set(0,1,0);controls.target.set((walkers.first+walkers.last)/2,walkers.midY,layout.floorZ);camera.position.copy(controls.target).add(new THREE.Vector3(0,0,Math.max(size.x,size.y)*1.8));}
  else{const extra=name==='inside'?.5:4;camera.position.set(walkers.entry-walkers.direction*extra,walkers.midY,layout.floorZ+1.6);controls.target.set(walkers.last,walkers.midY,layout.floorZ+1.3);}
  camera.updateProjectionMatrix();controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));updateCameraInfo();
}
function withCameraScene(filtered,render){
  const state={model:model.visible,occlusion:occlusionRoot.visible,grid:grid.visible,labels:labelGroup.visible,coverage:coverageGroup.visible,background:scene.background},saved=[];
  model.visible=!filtered;occlusionRoot.visible=filtered;grid.visible=false;labelGroup.visible=false;coverageGroup.visible=false;scene.background=filtered?blackBackground:normalBackground;
  for(const node of cameraNodes){saved.push([node,'visible',node.visible]);node.visible=false;}
  if(filtered){
    for(const p of walkers.active())for(const mesh of p.colliders){saved.push([mesh,'material',mesh.material]);mesh.material=darkMaterial;}
    for(const entry of dotEntries){saved.push([entry.mesh,'visible',entry.mesh.visible],[entry.mesh,'material',entry.mesh.material]);entry.mesh.visible=entry.mesh.visible&&entry.beam.color==='red';entry.mesh.material=whiteMaterial;}
  }
  try{render();}finally{for(const [object,key,value]of saved)object[key]=value;model.visible=state.model;occlusionRoot.visible=state.occlusion;grid.visible=state.grid;labelGroup.visible=state.labels;coverageGroup.visible=state.coverage;scene.background=state.background;}
}
function renderMain(){
  const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);
  if(activeCamera>=0){
    const entry=cameraEntries[activeCamera],width=Math.min(w,h*entry.fov.aspect),height=width/entry.fov.aspect;
    withCameraScene($('receiver-only').checked,()=>{renderer.clear();renderer.setViewport((w-width)/2,(h-height)/2,width,height);renderer.setScissor((w-width)/2,(h-height)/2,width,height);renderer.setScissorTest(true);renderer.render(scene,entry.camera);renderer.setScissorTest(false);});
  }else{
    model.visible=$('shell').checked;coverageGroup.visible=$('coverage').checked;
    const saved=[];if($('wall-cutaway').checked)for(const object of wallItems)for(const material of (Array.isArray(object.material)?object.material:[object.material])){saved.push([material,material.transparent,material.opacity,material.depthWrite]);material.transparent=true;material.opacity=.23;material.depthWrite=false;}
    renderer.render(scene,camera);for(const [m,t,o,d]of saved){m.transparent=t;m.opacity=o;m.depthWrite=d;}model.visible=true;
  }
}
function renderFeeds(){
  withCameraScene($('receiver-only').checked,()=>{for(const entry of cameraEntries){feedRenderer.render(scene,entry.camera);entry.context.drawImage(feedRenderer.domElement,0,0,entry.canvas.width,entry.canvas.height);}});
}
async function startup(){
  const json=async name=>{const response=await fetch(new URL(name,base),{cache:'no-cache'});if(!response.ok)throw new Error(name+' HTTP '+response.status);return response.json();};
  const [config,sceneLayout,cameraPlan]=await Promise.all([json('project.json'),json('scene-layout.json'),json('camera-plan.json')]);layout=sceneLayout;plan=cameraPlan;
  const url=new URL(config.model.url,base);url.searchParams.set('v',config.model.revision);const response=await fetch(url);if(!response.ok)throw new Error('Model HTTP '+response.status);
  const buffer=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer.slice(0)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==layout.source.sha256||hash!==plan.source.sha256)throw new Error('模型、光路和相机数据不一致，请重新运行 npm run model:layout');
  $('loading').textContent='模型校验通过，正在解析实际场景…';const loader=new Rhino3dmLoader();loader.setWorkerLimit(1);loader.setLibraryPath(new URL('rhino/',base).href);
  model=await new Promise((resolve,reject)=>loader.parse(buffer,resolve,reject));const units=model.userData.settings?.modelUnitSystem,code=typeof units==='number'?units:units?.value,scale={1:1e-6,2:.001,3:.01,4:1,5:1000,8:.0254,9:.3048}[code];if(!scale)throw new Error('未支持的模型单位');
  model.scale.setScalar(scale);scene.add(model);model.updateWorldMatrix(true,true);walkers=createWalkers(scene,layout);preparePhysicalScene();
  $('model-description').textContent=config.model.name+' · '+items.length+'实体 / '+(model.userData.layers||[]).length+'图层';
  $('model-version').textContent=config.model.revision;$('model-units').textContent=code===2?'毫米 → 米':'源单位 → 米';$('receiver-count').textContent=layout.receivers.filter(r=>r.kind==='floor').length+' / '+layout.receivers.filter(r=>r.kind==='wall').length;
  const depth=Math.abs(layout.rows.at(-1)-layout.rows[0]);$('row-depth').textContent=depth.toFixed(2)+'m';$('layer').max=String(layout.rows.length);$('walk-progress').max=String(depth+.5);
  $('loading').hidden=true;document.body.dataset.loaded='true';document.body.dataset.modelHash=hash;document.body.dataset.unitScale=String(scale);
  setLayout(true);view('overview');inspectContact(true);
  window.__LASER_ROOM__={source:'Rhino',model:config.model.name,sha256:hash,units:'meters',upAxis:'Z',frames:layout.rows.length,totalPairs:layout.receivers.length,meshCount:items.length};
}
for(const id of ['receiver-only','beams','shell','wall-cutaway','coverage'])$(id).onchange=()=>{updateVisibility();updateCameraInfo();lastFeeds=-Infinity;};
$('layer').oninput=updateVisibility;$('light-mode').onchange=()=>{inspectContact(true);lastFeeds=-Infinity;};
$('camera-layout').onchange=()=>setLayout(true);for(const id of ['camera-orientation','fov-definition'])$(id).onchange=()=>setLayout();$('camera-fov').oninput=()=>setLayout();$('wall-lowering').oninput=()=>setLayout();
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>view(button.dataset.view));
$('walk-toggle').onclick=()=>{if(walkers){walkers.setWalking(!walkers.walking);updateWalkStatus();}};$('walk-reset').onclick=()=>{if(walkers){walkers.reset($('player-mode').value);inspectContact(true);}};$('player-mode').onchange=()=>{if(walkers){walkers.reset($('player-mode').value);inspectContact(true);}};
$('walk-progress').oninput=()=>{if(walkers){walkers.seek(Number($('walk-progress').value));inspectContact(true);}};$('inspect-941').onclick=()=>{if(walkers){walkers.seek(9.41);inspectContact(true);}};
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(!model||!walkers)return;walkers.update(dt);inspectContact();controls.update();
  if(now-lastRender>=1000/30){renderMain();lastRender=now;}
  if(now-lastFeeds>=1000/Number($('feed-fps').value)){renderFeeds();lastFeeds=now;}
});
startup().catch(fail);
