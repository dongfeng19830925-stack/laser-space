import * as THREE from 'three';

// Test the same 50mm red discs used in the camera previews. A view is lit if
// any of five interior samples is in frame and clear of static and human depth.
// Static rays are cached when camera intrinsics/extrinsics change.
export function createSignalFusion(layout,physicalMeshes){
  const receivers=[...layout.receivers].sort((a,b)=>a.row-b.row||a.slot-b.slot);
  const wallTop=Math.max(...receivers.filter(r=>r.kind==='wall').map(r=>r.slot));
  const beams=new Map(layout.beams.map(b=>[b.id,b]));
  const boxes=physicalMeshes.map(mesh=>({mesh,box:new THREE.Box3().setFromObject(mesh)}));
  const ray=new THREE.Raycaster(),point=new THREE.Vector3();
  let points=[];
  function configure(floorEntries,wallEntries){
    points=receivers.map(receiver=>{
      const entries=receiver.kind==='floor'?floorEntries:wallEntries;
      const beam=beams.get(receiver.redBeamId),pair=entries.filter(e=>receiver.row>=e.group.rows[0]&&receiver.row<=e.group.rows[1]);
      const ordered=receiver.kind==='floor'?['背面','正面'].map(view=>pair.find(e=>e.group.playerView===view)):pair;
      if(ordered.some(e=>!e)||pair.length!==(receiver.kind==='floor'?2:1))throw new Error('接收点与负责机位的分组不完整');
      const views=ordered.map(entry=>{
        const origin=entry.camera.position.clone(),samples=[];
        for(const [dx,dy]of [[0,0],[-.015,-.015],[-.015,.015],[.015,-.015],[.015,.015]]){
          const target=new THREE.Vector3(...beam.spot).add(receiver.kind==='floor'?new THREE.Vector3(dx,dy,0):new THREE.Vector3(dx,0,dy)),ndc=target.clone().project(entry.camera),distance=origin.distanceTo(target),direction=target.clone().sub(origin).normalize();
          if(ndc.z< -1||ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)continue;
          ray.set(origin,direction);ray.near=entry.camera.near;ray.far=distance-.0002;
          const candidates=boxes.filter(({box})=>box.containsPoint(origin)||(ray.ray.intersectBox(box,point)&&point.distanceTo(origin)<distance)).map(o=>o.mesh);
          if(!ray.intersectObjects(candidates,false).length)samples.push({origin,direction,distance});
        }
        return{id:entry.id,samples};
      });
      return{receiver,beam,views};
    });
  }
  function sample(beamStates,redOn,people){
    const bodies=people.flatMap(p=>p.colliders);
    return points.map(({receiver,beam,views})=>{
      const lit=redOn&&!beamStates.get(beam.id)?.blocked;
      const visible=views.map(view=>lit&&view.samples.some(s=>{
        ray.set(s.origin,s.direction);ray.near=.015;ray.far=s.distance-.0002;
        return !ray.intersectObjects(bodies,false).length;
      }));
      const floor=receiver.kind==='floor',uncovered=!floor&&receiver.slot===wallTop&&!views[0].samples.length,dot=floor&&visible[0],ring=visible[floor?1:0];
      return{id:receiver.id,kind:receiver.kind,row:receiver.row,slot:receiver.slot,position:receiver.center,cameraIds:views.map(v=>v.id),dot,ring,uncovered,alarm:!uncovered&&!dot&&!ring,redLit:lit,staticCovered:views.some(v=>v.samples.length)};
    });
  }
  return{configure,sample};
}

const NS='http://www.w3.org/2000/svg';
function svg(tag,attributes={},parent){const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));parent?.append(node);return node;}
function text(parent,x,y,label,attributes={}){const node=svg('text',{x,y,...attributes},parent);node.textContent=label;return node;}

export function createSignalMonitor(layout,plan){
 const panels=['floor','wall'].map(kind=>buildPanel(kind));
 function buildPanel(kind){
  const isFloor=kind==='floor',map=document.getElementById('fusion-'+kind+'-map'),zones=document.getElementById('fusion-'+kind+'-zones'),nodes=new Map(),zoneNodes=[];
  const floor=layout.receivers.filter(r=>r.kind===kind),cameras=isFloor?plan.floor.filter(c=>c.installed):plan.wall,direction=layout.entryHighX?-1:1;
  const minX=Math.min(...floor.map(r=>r.center[0]),...cameras.map(c=>c.position[0])),maxX=Math.max(...floor.map(r=>r.center[0]),...cameras.map(c=>c.position[0]));
  const axis=isFloor?1:2,minY=Math.min(...floor.map(r=>r.center[axis])),maxY=Math.max(...floor.map(r=>r.center[axis]),...cameras.map(c=>c.position[axis])),scale=90,width=(maxX-minX)*scale+130,height=(maxY-minY)*scale+240;
  const xy=p=>[65+(layout.entryHighX?maxX-p[0]:p[0]-minX)*scale,130+(maxY-p[axis])*scale];
  const at=(x,v)=>isFloor?[x,v,0]:[x,0,v];
  map.setAttribute('viewBox',`0 0 ${width} ${height}`);map.replaceChildren();zones.replaceChildren();
  const zoneLayer=svg('g',{class:'fusion-zone-layer'},map),playerLayer=svg('g',{class:'fusion-players'},map),cameraLayer=svg('g',{class:'fusion-camera-layer'},map),pointLayer=svg('g',{},map);
  const pairs=[];
  for(let z=0;z<3;z++){
    const rows=[z*4+1,z*4+4],pair=cameras.filter(c=>(isFloor?c.current:c).rows[0]===rows[0]);pairs.push(pair);
    const a=xy(at(layout.rows[rows[0]-1]-direction*.45,maxY+.25)),b=xy(at(layout.rows[rows[1]-1]+direction*.45,minY-.25));
    svg('rect',{x:a[0],y:a[1],width:b[0]-a[0],height:b[1]-a[1],rx:6,class:'fusion-zone'},zoneLayer);
    text(zoneLayer,(a[0]+b[0])/2,40,`${'ABC'[z]}区 · 第${rows[0]}–${rows[1]}列`,{'text-anchor':'middle',class:'fusion-zone-title'});
    const card=document.createElement('div');card.className='fusion-zone-card';const title=document.createElement('strong');title.textContent=`${'ABC'[z]}区 · ${pair.map(c=>c.id).join(' / ')}`;const status=document.createElement('span');card.append(title,status);zones.append(card);zoneNodes.push(status);
  }
  for(let row=1;row<=layout.rows.length;row++)text(zoneLayer,xy(at(layout.rows[row-1],minY))[0],height-78,String(row),{'text-anchor':'middle',class:'fusion-row-number'});
  text(zoneLayer,30,height-8,'入口 →', {class:'fusion-direction'});text(zoneLayer,width-30,height-8,'→ 出口',{'text-anchor':'end',class:'fusion-direction'});
  for(const [index,c]of cameras.entries()){
    const [x,y]=xy(c.position),towardsExit=isFloor&&c.current.playerView==='背面',labelY=isFloor&&index%2?height-36:84;
    svg('line',{x1:x,y1:y,x2:x,y2:labelY+(index%2?-14:7),class:'fusion-camera-leader'},cameraLayer);
    const g=svg('g',{transform:`translate(${x} ${y})`,class:'fusion-camera','data-camera-id':c.id},cameraLayer);
    svg('path',{d:!isFloor?'M -6 -5 L 6 -5 L 0 8 Z':towardsExit?'M -6 -6 L 8 0 L -6 6 Z':'M 6 -6 L -8 0 L 6 6 Z'},g);
    const title=svg('title',{},g);title.textContent=`${c.id} 模型机位(mm)：${c.position.map(v=>(v*1000).toFixed(1)).join(' / ')}`;
    text(cameraLayer,x,labelY,c.id,{'text-anchor':'middle',class:'fusion-camera-label'});
  }
  for(const r of floor){
    const [x,y]=xy(r.center),g=svg('g',{transform:`translate(${x} ${y})`,'data-receiver-id':r.id,'data-row':r.row,'data-slot':r.slot,role:'img',class:'fusion-point'},pointLayer);
    const ring=svg('circle',{r:8,class:'fusion-ring'},g),dot=svg('circle',{r:3.2,class:'fusion-dot'},g),alarm=svg('circle',{r:7,class:'fusion-alarm'},g),uncovered=svg('circle',{r:6,class:'fusion-uncovered'},g),title=svg('title',{},g);nodes.set(r.id,{g,ring,dot,alarm,uncovered,title});
  }
  const playerNodes=Array.from({length:4},(_,i)=>{const g=svg('g',{class:'fusion-player'},playerLayer);svg('circle',{r:14},g);text(g,0,4,'P'+(i+1),{'text-anchor':'middle'});return g;});
  function update(states,people){
    states=states.filter(s=>s.kind===kind);const counts={both:0,single:0,alarm:0,uncovered:0};
    for(const state of states){
      const node=nodes.get(state.id),name=state.uncovered?'uncovered':state.alarm?'alarm':state.dot&&state.ring?'both':state.dot?'dot':'ring';
      counts[state.uncovered?'uncovered':state.alarm?'alarm':state.dot&&state.ring?'both':'single']++;
      node.g.dataset.state=name;node.dot.style.display=state.dot?'':'none';node.ring.style.display=state.ring?'':'none';node.alarm.style.display=state.alarm?'':'none';
      node.uncovered.style.display=state.uncovered?'':'none';
      const label=`${isFloor?'地面':'墙面'}第${state.row}列${state.slot}号：`+(isFloor?`${state.cameraIds[0]}${state.dot?'可见':'不可见'}，${state.cameraIds[1]}${state.ring?'可见':'不可见'}`:`${state.cameraIds[0]}${state.uncovered?'顶排未覆盖（视场或固定遮挡）':state.ring?'可见':'不可见'}`)+(state.alarm?'，遮挡/断光报警':'')+(!state.staticCovered&&!state.uncovered?'（模型固定遮挡或视场不足）':'');node.g.setAttribute('aria-label',label);node.title.textContent=label;
    }
    for(let i=0;i<3;i++){const group=states.filter(s=>s.row>i*4&&s.row<=i*4+4),alarm=group.filter(s=>s.alarm).length,uncovered=group.filter(s=>s.uncovered).length;zoneNodes[i].textContent=`${alarm} 报警${isFloor?' · '+group.filter(s=>s.dot!==s.ring).length+' 单侧可见':' · '+uncovered+' 未覆盖'}`;zoneNodes[i].parentElement.classList.toggle('has-alarm',alarm>0);}
    const badge=document.getElementById('fusion-'+kind+'-count');badge.textContent=`${counts.alarm} 报警`+(isFloor?'':` · ${counts.uncovered} 未覆盖`);badge.classList.toggle('has-alarm',counts.alarm>0);
    playerNodes.forEach((node,i)=>{const p=isFloor?people[i]:null;node.style.display=p?'':'none';if(p){const [x,y]=xy(p.position||p.root.position.toArray());node.setAttribute('transform',`translate(${x} ${y})`);}});
    map.dataset.alarms=String(counts.alarm);map.dataset.single=String(counts.single);map.dataset.both=String(counts.both);map.dataset.uncovered=String(counts.uncovered);map.dataset.players=String(people.length);
    return counts;
  }
  return{update};
 }
 return{update(states,people){const counts=panels.map(p=>p.update(states,people)),alarm=counts.reduce((n,c)=>n+c.alarm,0),badge=document.getElementById('fusion-alarm-count');badge.textContent=`${alarm} / ${states.length} 报警`;badge.classList.toggle('has-alarm',alarm>0);document.getElementById('fusion-status').textContent=`当前${people.length}名玩家 · 地面双侧可见 ${counts[0].both} / 单侧可见 ${counts[0].single} · 墙面未覆盖 ${counts[1].uncovered} · 与模拟监看同批更新`;}};
}
