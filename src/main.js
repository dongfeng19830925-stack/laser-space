import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Rhino3dmLoader} from 'three/addons/loaders/3DMLoader.js';

const $ = id => document.getElementById(id);
const mount = $('viewport');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40,1,0.01,1000);
camera.up.set(0,0,1);
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}
catch {showError('当前浏览器无法创建 WebGL 三维视图，请启用硬件加速后重试。');throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.25;
mount.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=0.09;controls.minDistance=0.1;controls.maxDistance=120;
controls.maxPolarAngle=Math.PI*0.96;
scene.add(new THREE.HemisphereLight(0xd9ebff,0x647066,2.3));
const sun=new THREE.DirectionalLight(0xfff2df,3.5);sun.position.set(3,-5,12);scene.add(sun);
const fill=new THREE.DirectionalLight(0x9dc8ff,1.6);fill.position.set(-6,10,7);scene.add(fill);
const grid=new THREE.GridHelper(30,30,0x607f83,0x425761);
grid.rotation.x=Math.PI/2;grid.position.set(9,2.5,-0.515);
grid.material.transparent=true;grid.material.opacity=0.25;scene.add(grid);
const selectionBox=new THREE.Box3Helper(new THREE.Box3(),0x8af2ce);selectionBox.visible=false;scene.add(selectionBox);

let model=null,layers=[],items=[],edgeItems=[],selected=null,currentName='',modelKey='',metresPerUnit=0.001;
let view='perspective',currentPreset='space',walk=false,loadId=0,toastTimer;
const keys=new Set(),pointer={down:false,x:0,y:0,moved:false};
const clock=new THREE.Clock();
const unitMap={1:{name:'微米',scale:1e-6},2:{name:'毫米',scale:0.001},3:{name:'厘米',scale:0.01},4:{name:'米',scale:1},5:{name:'千米',scale:1000},6:{name:'微英寸',scale:2.54e-8},7:{name:'密耳',scale:2.54e-5},8:{name:'英寸',scale:0.0254},9:{name:'英尺',scale:0.3048},10:{name:'英里',scale:1609.344},12:{name:'埃',scale:1e-10},13:{name:'纳米',scale:1e-9},14:{name:'分米',scale:0.1},15:{name:'十米',scale:10},16:{name:'百米',scale:100},17:{name:'兆米',scale:1e6},18:{name:'吉米',scale:1e9},19:{name:'码',scale:0.9144},20:{name:'印刷点',scale:0.0254/72},21:{name:'印刷派卡',scale:0.0254/6},22:{name:'海里',scale:1852}};
const loader=new Rhino3dmLoader();loader.setWorkerLimit(1);loader.setLibraryPath(new URL('rhino/',document.baseURI).href);

function showError(message){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=message;}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4200);}
function storageRead(){try{return JSON.parse(localStorage.getItem(modelKey)||'null');}catch{return null;}}
function save(){if(!modelKey||!model)return;try{localStorage.setItem(modelKey,JSON.stringify(snapshot()));}catch{}}
function snapshot(){return {schemaVersion:1,model:currentName,modelKey,units:'meters',layers:layers.map(l=>({id:l.id,path:l.path,visible:l.visible})),view,preset:currentPreset,camera:camera.position.toArray(),target:controls.target.toArray(),settings:{transparent:$('transparent').checked,edges:$('edges').checked,grid:$('grid').checked,originalColors:$('original-colors').checked}};}
function getLayerIndex(object){let o=object;while(o&&o!==model){if(o.userData.attributes?.layerIndex!==undefined)return o.userData.attributes.layerIndex;o=o.parent;}return -1;}
function wallLayer(path){return /土建|墙面|石膏板|涂料/.test(path);}
function categoryColor(path){if(/设备箱/.test(path))return 0x71cbb6;if(/地龙骨|地面龙骨/.test(path))return 0xaf9574;if(/总平图|强电|弱电/.test(path))return 0x8797aa;if(/墙面|石膏|土建/.test(path))return 0xa6b0b6;if(/底板|地板|地面/.test(path))return 0x5b6b72;return 0xc6a567;}
function visibleToRoot(object){let o=object;while(o){if(!o.visible)return false;o=o.parent;}return true;}

function refreshAppearance(){
  for(const object of items){
    const idx=getLayerIndex(object),layer=layers[idx],path=layer?.path||'';
    object.visible=layer?.visible??true;
    const mats=Array.isArray(object.material)?object.material:[object.material];
    for(const mat of mats){
      if(!mat)continue;
      const orig=mat.userData.originalColor;
      if(mat.color)mat.color.set($('original-colors').checked&&orig!==undefined?orig:categoryColor(path));
      const translucent=object.isMesh&&wallLayer(path)&&$('transparent').checked;
      mat.transparent=translucent;mat.opacity=translucent?0.24:1;mat.depthWrite=!translucent;
      mat.side=THREE.DoubleSide;
      if(mat.emissive)mat.emissive.set(object===selected?0x234b3e:0x000000);
      mat.needsUpdate=true;
    }
  }
  for(const edge of edgeItems){edge.visible=$('edges').checked;}
  grid.visible=$('grid').checked;
  if(selected&&!visibleToRoot(selected))selectObject(null);
}

function listLayers(){
  const container=$('layer-list');container.replaceChildren();
  for(const layer of layers){
    const row=document.createElement('label');row.className='layer-row';row.title=layer.path;
    const input=document.createElement('input');input.type='checkbox';input.checked=layer.visible;input.setAttribute('aria-label',layer.path);
    const swatch=document.createElement('span');swatch.className='layer-swatch';swatch.style.background=new THREE.Color(categoryColor(layer.path)).getStyle();
    const name=document.createElement('span');name.className='layer-label';name.textContent=(layer.depth?'↳ ':'')+layer.name;
    const count=document.createElement('span');count.className='layer-count';count.textContent=layer.count;
    row.append(input,swatch,name,count);container.append(row);layer.input=input;
    input.addEventListener('change',()=>{layer.visible=input.checked;currentPreset=null;document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});refreshAppearance();save();});
  }
}

function setPreset(name,store=true){
  currentPreset=name;
  for(const layer of layers){
    const p=layer.path;
    if(name==='all')layer.visible=true;
    else if(name==='space')layer.visible=!/总平图|强电|弱电|龙骨/.test(p)&&(/墙面|石膏板|涂料|底板|板，地面|设备箱/.test(p));
    else if(name==='structure')layer.visible=/土建|墙面|地龙骨|地面龙骨|设备箱/.test(p)&&!/石膏板/.test(p);
    else if(name==='plan')layer.visible=/装置/.test(p)&&!/墙面|石膏|底板|地面|龙骨/.test(p);
    if(layer.input)layer.input.checked=layer.visible;
  }
  document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  refreshAppearance();if(name==='plan')setView('top',false);if(store)save();
}

function modelBounds(visible=true){
  const box=new THREE.Box3();
  for(const obj of items){
    const includeCurve=visible&&view==='top'&&obj.isLine;
    if((!obj.isMesh&&!includeCurve)||(visible&&!visibleToRoot(obj))||/总平图/.test(layers[getLayerIndex(obj)]?.path||''))continue;
    obj.geometry.computeBoundingBox();box.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
  }
  if(box.isEmpty())box.set(new THREE.Vector3(1.4,0.3,-0.5),new THREE.Vector3(17,5.1,3.8));
  return box;
}
function fit(){
  if(walk)toggleWalk(false);
  const box=modelBounds(),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  controls.target.copy(center);
  const radius=size.length()/2;
  const vFov=THREE.MathUtils.degToRad(camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);
  const distance=radius/Math.sin(Math.min(vFov,hFov)/2)*1.08;
  const direction=view==='top'?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(0,-1,0):new THREE.Vector3(0.48,-0.78,0.72).normalize();
  camera.up.set(0,view==='top'?1:0,view==='top'?0:1);
  camera.position.copy(center).addScaledVector(direction,distance);
  camera.near=0.01;camera.far=Math.max(500,distance*10);camera.updateProjectionMatrix();controls.update();save();
}
function setView(name,store=true){view=name;document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});fit();if(store)save();}

function selectObject(object){
  selected=object;selectionBox.visible=!!object;
  const area=$('selection');area.replaceChildren();
  if(!object){const p=document.createElement('p');p.className='empty-text';p.textContent='点击模型中的物体，查看图层、尺寸与高度';area.append(p);refreshSelected();return;}
  const attrs=object.userData.attributes||{},layer=layers[getLayerIndex(object)];
  const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());selectionBox.box.copy(box);
  const heading=document.createElement('div');heading.className='object-name';heading.textContent=attrs.name||'未命名物体';
  const path=document.createElement('div');path.className='object-layer';path.textContent=layer?.path||'未分层';
  const dims=document.createElement('div');dims.className='object-dim';
  for(const [name,value]of[['X 向范围',size.x],['Y 向范围',size.y],['Z 向范围',size.z],['底部高程',box.min.z]]){const d=document.createElement('div'),k=document.createElement('span'),v=document.createElement('strong');k.textContent=name;v.textContent=value.toFixed(3)+' m';d.append(k,v);dims.append(d);}
  const id=document.createElement('div');id.className='object-id';id.textContent=`${object.userData.objectType||object.type} · ${attrs.id||''}\n尺寸为世界坐标轴方向的包围盒范围`;
  area.append(heading,path,dims,id);refreshSelected();
}
function refreshSelected(){for(const obj of items){for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material]))if(mat?.emissive)mat.emissive.set(obj===selected?0x234b3e:0);}}

async function loadBuffer(buffer,name){
  const request=++loadId;delete document.body.dataset.loaded;$('loading').hidden=false;$('error').hidden=true;$('loading-text').textContent='正在解析真实尺寸几何…';
  try{
    const hash=await crypto.subtle.digest('SHA-256',buffer.slice(0));
    const key='laser-space:'+Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');
    const loaded=await new Promise((resolve,reject)=>loader.parse(buffer,resolve,reject));
    if(request!==loadId){disposeModel(loaded);return false;}
    const units=loaded.userData.settings?.modelUnitSystem;
    const code=typeof units==='number'?units:units?.value;
    const unit=unitMap[code];
    if(!unit){disposeModel(loaded);throw new Error('模型单位未指定或暂不支持。请在犀牛中明确设置毫米、厘米或米后重新保存。');}
    disposeModel(model);model=loaded;currentName=name;modelKey=key;metresPerUnit=unit.scale;
    model.scale.setScalar(metresPerUnit);scene.add(model);model.updateMatrixWorld(true);items=[];edgeItems=[];selected=null;selectionBox.visible=false;
    const raw=model.userData.layers||[];
    const map=new Map(raw.map(l=>[l.id,l]));
    layers=raw.map((l,index)=>{
      let names=[l.name],parent=map.get(l.parentLayerId),depth=0;const seen=new Set([l.id]);
      while(parent&&!seen.has(parent.id)){seen.add(parent.id);names.unshift(parent.name);depth++;parent=map.get(parent.parentLayerId);}
      return {id:l.id,index,name:l.name,path:names.join('::'),depth,visible:l.visible!==false,count:0};
    });
    model.traverse(object=>{
      if(!object.isMesh&&!object.isLine&&!object.isPoints&&!object.isSprite)return;
      items.push(object);const layer=layers[getLayerIndex(object)];if(layer)layer.count++;
      if(object.material){object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();for(const mat of (Array.isArray(object.material)?object.material:[object.material])){mat.userData.originalColor=mat.color?.getHex();if(mat.roughness!==undefined)mat.roughness=0.75;}}
    });
    for(const obj of items.filter(o=>o.isMesh)){
      const mat=new THREE.LineBasicMaterial({color:0x23323a,transparent:true,opacity:0.5});
      const edge=new THREE.LineSegments(new THREE.EdgesGeometry(obj.geometry,30),mat);edge.userData.outline=true;obj.add(edge);edgeItems.push(edge);
    }
    $('source-units').textContent=`${unit.name} → 米`;$('model-name').textContent=name;$('mesh-count').textContent=items.filter(o=>o.isMesh).length;
    $('info-layer-count').textContent=layers.length;$('layer-count').textContent=layers.length+' 层';
    listLayers();setPreset('space',false);selectObject(null);
    const saved=storageRead();
    if(saved?.schemaVersion===1){
      for(const layer of layers){const old=saved.layers?.find(l=>l.id===layer.id);if(old){layer.visible=old.visible;layer.input.checked=layer.visible;}}
      for(const [name,id]of[['transparent','transparent'],['edges','edges'],['grid','grid'],['originalColors','original-colors']])if(typeof saved.settings?.[name]==='boolean')$(id).checked=saved.settings[name];
      refreshAppearance();
      currentPreset=saved.preset??null;
      document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===currentPreset;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    }
    setView(saved?.view||'perspective',false);
    if(saved?.camera?.length===3&&saved?.target?.length===3){camera.position.fromArray(saved.camera);controls.target.fromArray(saved.target);controls.update();}
    const box=modelBounds(false);grid.position.copy(box.getCenter(new THREE.Vector3()));grid.position.z=box.min.z-0.015;
    $('loading').hidden=true;document.body.dataset.loaded='true';document.body.dataset.unitScale=String(metresPerUnit);return true;
  }catch(error){if(request===loadId)showError('模型加载失败：'+error.message+'。可点击“打开新版模型”重新选择 .3dm 文件。');console.error(error);return false;}
}
function disposeModel(object){if(!object)return;scene.remove(object);const geos=new Set(),mats=new Set();object.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)mats.add(m);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}

function toggleWalk(enabled=!walk){
  walk=enabled;$('walk').classList.toggle('active',walk);$('walk').textContent=walk?'退出漫游':'进入空间';
  $('walk').setAttribute('aria-pressed',String(walk));controls.enablePan=!walk;controls.enableZoom=!walk;
  if(walk){
    const box=modelBounds(false),center=box.getCenter(new THREE.Vector3());camera.up.set(0,0,1);
    camera.position.set(box.min.x+1.2,center.y,1.7);
    controls.target.copy(camera.position).add(new THREE.Vector3(1,0,0));controls.update();
    $('interaction-hint').textContent='拖动环视 · W/A/S/D 移动 · Q/E 升降 · Esc 退出（自由漫游）';
    toast('已进入自由漫游；当前不限制穿墙。');
  }else{$('interaction-hint').textContent='左键旋转 · 右键平移 · 滚轮缩放 · 点击选择';}
}
function resize(){const w=mount.clientWidth,h=mount.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(model&&!walk)fit();}
new ResizeObserver(resize).observe(mount);
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('fit-view').addEventListener('click',fit);$('walk').addEventListener('click',()=>toggleWalk());
for(const id of ['transparent','edges','grid','original-colors'])$(id).addEventListener('change',()=>{refreshAppearance();save();});
$('model-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.3dm'))return toast('请选择 .3dm 犀牛文件');const ok=await loadBuffer(await file.arrayBuffer(),file.name);if(ok)toast('新版模型仅在当前浏览器预览，线上文件尚未改变。');e.target.value='';});
$('export-settings').addEventListener('click',()=>{if(!model)return;const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='laser-space-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
controls.addEventListener('end',save);
renderer.domElement.addEventListener('pointerdown',e=>{Object.assign(pointer,{down:true,x:e.clientX,y:e.clientY,moved:false});});
renderer.domElement.addEventListener('pointermove',e=>{if(pointer.down&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>4)pointer.moved=true;});
renderer.domElement.addEventListener('pointerup',e=>{
  if(pointer.down&&!pointer.moved&&e.button===0){const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=0.025;ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=ray.intersectObjects(items.filter(visibleToRoot),false);const hit=hits.find(h=>/设备箱/.test(layers[getLayerIndex(h.object)]?.path||''))||hits[0];selectObject(hit?.object||null);}pointer.down=false;
});
renderer.domElement.addEventListener('pointercancel',()=>{pointer.down=false;});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&walk){toggleWalk(false);fit();}if(walk&&['w','a','s','d','q','e'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),0.05);
  if(walk&&keys.size){const forward=controls.target.clone().sub(camera.position);forward.z=0;forward.normalize();const right=forward.clone().cross(new THREE.Vector3(0,0,1));const move=new THREE.Vector3();if(keys.has('w'))move.add(forward);if(keys.has('s'))move.sub(forward);if(keys.has('d'))move.add(right);if(keys.has('a'))move.sub(right);if(keys.has('e'))move.z+=1;if(keys.has('q'))move.z-=1;move.normalize().multiplyScalar(dt*2);camera.position.add(move);controls.target.add(move);}
  controls.update();renderer.render(scene,camera);
});
resize();
async function startup(){
  try{const config=await fetch(new URL('project.json',document.baseURI)).then(r=>{if(!r.ok)throw new Error('读取项目配置失败');return r.json();});const response=await fetch(new URL(config.model.url,document.baseURI));if(!response.ok)throw new Error('读取模型失败：HTTP '+response.status);await loadBuffer(await response.arrayBuffer(),config.model.name);}
  catch(e){showError(e.message);}
}
startup();
