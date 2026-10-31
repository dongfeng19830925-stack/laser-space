import * as THREE from 'three';
import {lensFov,fitCamera,countBeamBlockedPlates} from './camera-fit.js';
import {captureBudgetMarkup,updateCaptureBudget} from './capture-budget.js';
import './camera-preview.css';
export function createCameraPreview({scene,controls,stage}){
  const panel=document.createElement('details');panel.className='camera-preview';
  panel.innerHTML=`<summary>现场摄像头预演 <span>v2.0 实际机位</span></summary><div class="camera-preview-body">
  <label>机位方案<select id="real-camera-mode"><option value="current">当前试验 · 6台 / 3区 / 每区1人</option><option value="future">后续扩展 · 12台 / 每组2列</option><option value="wall">墙面 · 3台 / 每组4列</option></select></label>
  <label>查看机位<select id="real-camera-select"></select></label>
  <div class="camera-preview-fields"><label>画面方向<select id="real-camera-roll"><option value="landscape">横构图 16:9</option><option value="portrait">竖构图 9:16</option></select></label><label>标称角度解释<select id="real-camera-fov"><option value="diagonal">对角角（暂定）</option><option value="horizontal">水平角（对照）</option></select></label></div>
  <label id="real-camera-lowering-label" hidden>同吊点下调 · 仅预演 <output id="real-camera-lowering-value">0 mm</output><input id="real-camera-lowering" type="range" min="0" max="600" step="10" value="0"></label>
  <p id="real-camera-result" role="status">正在读取实际机位…</p>
  <div class="camera-preview-actions"><button id="real-camera-enter" type="button" disabled>查看拍摄画面</button><button id="real-camera-exit" type="button">返回模型</button></div>${captureBudgetMarkup}
  <p class="camera-preview-assumptions">当前试验：6台分3区，每区最多1人，观察地面72个红色光点。红色滤片＋黑白采集＋软件ROI亮度检测待接入；本页只预演几何视场。地面按85°、墙面按120°；理想投影不包含镜头畸变、裁切和人员遮挡。俯角从水平向下计。</p></div>`;
  stage.append(panel);
  const $=selector=>panel.querySelector(selector),mode=$('#real-camera-mode'),select=$('#real-camera-select');
  const previewCamera=new THREE.PerspectiveCamera(50,16/9,.01,100);previewCamera.up.set(0,0,1);
  let plan=null,sourceHash='',active=false,selected=null;
  const valid=()=>plan&&sourceHash===plan.source.sha256;
  function options(){
    if(!plan)return;const wall=mode.value==='wall',list=wall?plan.wall:plan.floor.filter(c=>mode.value==='future'||c.installed);
    select.replaceChildren(...list.map(c=>{const o=document.createElement('option'),g=wall?c:c[mode.value];o.value=c.id;o.textContent=`${c.id} · 第${g.rows[0]}–${g.rows[1]}列${wall?'':g.playerView==='正面'?' · 朝入口':' · 朝出口'}${!wall&&!c.installed?' · 未来':''}`;return o;}));
    $('#real-camera-lowering-label').hidden=!wall;refresh();
  }
  function refresh(){
    $('#real-camera-enter').disabled=!valid();
    if(!valid()){$('#real-camera-result').textContent=plan?'当前模型与v2.0机位数据不匹配，请使用模型总览。':'正在读取实际机位…';stop();return;}
    const wall=mode.value==='wall';selected=(wall?plan.wall:plan.floor).find(c=>c.id===select.value);if(!selected)return;
    const g=wall?selected:selected[mode.value],lowering=wall?Number($('#real-camera-lowering').value):0,position=[...selected.position];position[2]-=lowering/1000;
    const fov=lensFov(wall?plan.wallNominalAngle:plan.floorNominalAngle,$('#real-camera-fov').value,$('#real-camera-roll').value==='portrait',plan.aspect),fit=fitCamera(position,g.targets,fov);
    const blocked=countBeamBlockedPlates(position,g.targets,plan.beamBoxes),count=g.targets.length/4;
    $('#capture-budget').hidden=mode.value!=='current';
    if(mode.value==='current')updateCaptureBudget(panel,{position,points:g.targets,fit,fov});
    previewCamera.aspect=fov.aspect;previewCamera.fov=fov.vertical;previewCamera.position.fromArray(position);previewCamera.up.set(0,0,1);
    previewCamera.lookAt(new THREE.Vector3().fromArray(position.map((v,i)=>v+fit.forward[i])));previewCamera.updateProjectionMatrix();previewCamera.updateMatrixWorld(true);
    $('#real-camera-lowering-value').textContent=`${lowering} mm`;
    $('#real-camera-result').textContent=`${selected.id} · 俯角 ${fit.pitch.toFixed(1)}° · ${wall?'拍摄接收器墙':g.playerView==='正面'?'朝入口看地面红点':'朝出口看地面红点'}\n理想视场 ${fov.horizontal.toFixed(1)}° × ${fov.vertical.toFixed(1)}°；${fit.covered?`可容纳${count}个反光板位置，最窄边余量${fit.edgeMarginPercent.toFixed(1)}%`:'无法完整容纳全部目标'}。\n横梁包围盒检查：${blocked?`${blocked}个点位存在遮挡交集`:'目标未与横梁遮挡相交'}。${wall?'已排除最高一行；下调值不改动原模型。':mode.value==='current'?`当前${String.fromCharCode(65+Math.floor((g.rows[0]-1)/4))}区：24点，每区最多1人；亮度检测待接入。`:'扩展方案：每组12个点位。'}`;
  }
  function stop(){active=false;controls.enabled=true;panel.querySelector('summary span').textContent='v2.0 实际机位';}
  mode.addEventListener('change',options);
  for(const id of ['#real-camera-select','#real-camera-roll','#real-camera-fov'])$(id).addEventListener('change',refresh);
  $('#real-camera-lowering').addEventListener('input',refresh);
  for(const id of ['#capture-resolution','#capture-fps','#capture-confirm'])$(id).addEventListener('change',refresh);
  $('#capture-spot').addEventListener('input',refresh);
  $('#real-camera-enter').addEventListener('click',()=>{refresh();if(valid()){active=true;controls.enabled=false;panel.open=false;panel.querySelector('summary span').textContent=selected.id+' 拍摄画面';}});
  $('#real-camera-exit').addEventListener('click',stop);
  fetch(new URL('camera-plan.json',document.baseURI),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('机位数据读取失败');return r.json();}).then(data=>{plan=data;options();}).catch(e=>{$('#real-camera-result').textContent=e.message;});
  return {stop,setModel(hash){sourceHash=hash;refresh();},get camera(){return active?previewCamera:null;},get hiddenMarkerId(){return active?selected?.objectId:null;}};
}
