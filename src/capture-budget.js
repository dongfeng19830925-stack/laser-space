const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const normalize=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};

// Local planar projection of a circular spot, before sensor blur, filtering or resizing.
export function spotPixelFootprint(position,points,fit,fov,width,height,diameterMm){
  const pitch=fit.pitch*Math.PI/180,yaw=fit.yaw*Math.PI/180;
  const right=[Math.sin(yaw),-Math.cos(yaw),0],up=[Math.sin(pitch)*Math.cos(yaw),Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
  const fx=width/(2*fov.ht),fy=height/(2*fov.vt);let result=null;
  for(let i=0;i<points.length;i+=4){
    const corners=points.slice(i,i+4),center=[0,1,2].map(k=>corners.reduce((s,p)=>s+p[k],0)/4),delta=sub(center,position),depth=dot(delta,fit.forward);
    if(depth<=0)continue;
    const axes=[normalize(sub(corners[2],corners[0])),normalize(sub(corners[1],corners[0]))];
    const j=axes.map(axis=>[fx*(dot(right,axis)*depth-dot(right,delta)*dot(fit.forward,axis))/depth**2,fy*(dot(up,axis)*depth-dot(up,delta)*dot(fit.forward,axis))/depth**2]);
    const a=dot(j[0],j[0]),b=dot(j[0],j[1]),c=dot(j[1],j[1]),discriminant=Math.hypot(a-c,2*b);
    const minor=Math.sqrt(Math.max(0,(a+c-discriminant)/2))*diameterMm/1000,major=Math.sqrt((a+c+discriminant)/2)*diameterMm/1000;
    if(!result||minor<result.minor)result={minor,major,targetIndex:i/4};
  }
  return result;
}

export function samplingBudget(fps,targetMs,confirmFrames=1){
  const intervalMs=1000/fps,worstSamplingMs=intervalMs*confirmFrames;
  return {intervalMs,worstSamplingMs,remainingMs:targetMs-worstSamplingMs,samplingFits:worstSamplingMs<targetMs};
}

export const captureBudgetMarkup=`<details class="capture-budget" id="capture-budget"><summary>地面采集预算 · 非实时视频</summary>
  <div class="camera-preview-fields"><label>处理分辨率<select id="capture-resolution"><option value="1080">1920×1080</option><option value="720">1280×720</option><option value="540">960×540</option><option value="480" selected>约854×480</option></select></label><label>判定帧率<select id="capture-fps"><option>30</option><option>20</option><option>15</option><option>10</option><option selected>8</option><option>4</option><option>2</option></select></label></div>
  <div class="camera-preview-fields"><label>变暗确认<select id="capture-confirm"><option value="1">单帧融合</option><option value="2">连续2帧</option></select></label><label>光斑直径 / mm<input id="capture-spot" type="number" value="50" min="1" max="200" step="1"></label></div>
  <p id="capture-budget-result" role="status"></p><p class="capture-budget-note">200ms为暂定检出/响应预算。像素为理想几何估算；ROI尺寸、曝光、压缩、传输、解码及真实报警延迟需实测。低清档位不代表相机已支持或已设置。</p>
</details>`;

export function updateCaptureBudget(panel,{position,points,fit,fov}){
  const $=selector=>panel.querySelector(selector),height=Number($('#capture-resolution').value),width=height===480?854:height*16/9;
  const fps=Number($('#capture-fps').value),frames=Number($('#capture-confirm').value),diameter=Number($('#capture-spot').value);
  const budget=samplingBudget(fps,200,frames),spot=diameter>0?spotPixelFootprint(position,points,fit,fov,width,height,diameter):null;
  const perSecond=6*24*9*9*fps;
  $('#capture-budget-result').textContent=`${width}×${height} · ${fps}fps；${spot?`${diameter}mm亮斑在当前机位最不利处约 ${spot.minor.toFixed(1)}×${spot.major.toFixed(1)} 像素。`:'请填写光斑直径。'}\n${frames}帧确认：最坏采样等待约 ${budget.worstSamplingMs.toFixed(0)}ms；${budget.samplingFits?`其余环节剩约${budget.remainingMs.toFixed(0)}ms，尚需实测。`:'仅采样等待已用尽或超过200ms预算。'}\n全6台共144个ROI，若每个9×9，每秒读取约${perSecond.toLocaleString('zh-CN')}个像素；仅计ROI采样，不含视频采集和解码。`;
}
