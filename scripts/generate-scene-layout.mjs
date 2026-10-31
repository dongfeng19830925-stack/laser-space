import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import rhino3dm from 'rhino3dm';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function generateSceneLayout(){
  const data=await readFile(path.join(root,'public/models/space.3dm')),sha256=createHash('sha256').update(data).digest('hex');
  const config=JSON.parse(await readFile(path.join(root,'public/project.json'),'utf8'));
  const rhino=await rhino3dm(),doc=rhino.File3dm.fromByteArray(new Uint8Array(data));
  if(!doc)throw new Error('Cannot read current Rhino model');
  const unit=doc.settings().modelUnitSystem.value,scales={1:1e-6,2:.001,3:.01,4:1,5:1000,8:.0254,9:.3048};
  const scale=scales[unit];if(!scale)throw new Error('Model units must be specified and supported');
  const layers=[];for(let i=0;i<doc.layers().count;i++){const l=doc.layers().get(i);layers.push({id:l.id,parentId:l.parentLayerId,name:l.name});}
  const byId=new Map(layers.map(l=>[l.id,l]));
  for(const l of layers){const names=[l.name],seen=new Set([l.id]);let p=byId.get(l.parentId);while(p&&!seen.has(p.id)){seen.add(p.id);names.unshift(p.name);p=byId.get(p.parentId);}l.path=names.join('::');}
  const objects=[],entryMarkers={};
  for(let i=0;i<doc.objects().count;i++){
    const object=doc.objects().get(i),a=object.attributes(),g=object.geometry(),box=g.getBoundingBox(),layer=layers[a.layerIndex];
    if(!box.isValid)continue;
    const min=box.min.map(v=>v*scale),max=box.max.map(v=>v*scale),center=min.map((v,k)=>(v+max[k])/2),type=g.constructor.name;
    if(type==='Leader'&&/游戏入口|游戏出口/.test(g.plainText||''))entryMarkers[g.plainText.trim()]=center;
    objects.push({id:a.id,layer:layer?.path||'',name:a.name,type,min,max,center,color:a.objectColor});
  }
  const floor=objects.filter(o=>o.layer.endsWith('地面反光板')),wall=objects.filter(o=>o.layer.endsWith('墙面反光板'));
  if(!floor.length||!wall.length)throw new Error('Current model is missing named reflector layers');
  if(!entryMarkers['游戏入口']||!entryMarkers['游戏出口'])throw new Error('Model must identify 游戏入口 and 游戏出口');
  const entryHighX=entryMarkers['游戏入口'][0]>entryMarkers['游戏出口'][0];
  const order=(a,b)=>entryHighX?b-a:a-b;
  const unique=values=>[...new Set(values.map(v=>Math.round(v*1e6)/1e6))].sort(order);
  const rowXs=unique(floor.map(o=>o.center[0])),wallRows=unique(wall.map(o=>o.center[0]));
  const rowOf=(o,rows)=>rows.findIndex(x=>Math.abs(x-o.center[0])<1e-4)+1;
  const receivers=[...floor.map(o=>({...o,kind:'floor',row:rowOf(o,rowXs)})),...wall.map(o=>({...o,kind:'wall',row:rowOf(o,wallRows)}))];
  for(const kind of ['floor','wall'])for(let row=1;row<=rowXs.length;row++){
    const list=receivers.filter(o=>o.kind===kind&&o.row===row).sort((a,b)=>kind==='floor'?a.center[1]-b.center[1]:a.center[2]-b.center[2]);
    list.forEach((o,i)=>{o.slot=i+1;o.label=`${kind==='floor'?'地面':'墙面'}${row}-${i+1}`;});
  }
  const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
  const beams=[];
  for(const o of objects.filter(o=>o.layer.endsWith('激光路径模拟')&&['Brep','Extrusion'].includes(o.type))){
    const size=o.max.map((v,k)=>v-o.min[k]),axis=size.indexOf(Math.max(...size));
    if(![1,2].includes(axis)||size[axis]<10*Math.max(...size.filter((v,k)=>k!==axis)))throw new Error('Non-axis-aligned source laser path needs explicit endpoint extraction');
    const kind=axis===2?'floor':'wall',a=[...o.center],b=[...o.center];a[axis]=o.min[axis];b[axis]=o.max[axis];
    const candidates=receivers.filter(r=>r.kind===kind).map(r=>({r,da:distance(a,r.center),db:distance(b,r.center)})).sort((x,y)=>Math.min(x.da,x.db)-Math.min(y.da,y.db));
    const nearest=candidates[0];if(!nearest||Math.min(nearest.da,nearest.db)>.1)throw new Error('A source laser path has no matching reflector');
    const color=o.color.r>o.color.g*2&&o.color.r>o.color.b*2?'red':o.color.g>o.color.r*2&&o.color.g>o.color.b*2?'green':'unknown';
    if(color==='unknown')throw new Error('A source laser path has no explicit red/green color');
    const end=nearest.da<nearest.db?a:b,start=nearest.da<nearest.db?b:a;
    const spot=[...end];if(kind==='floor')spot[2]=nearest.r.max[2]+.001;else spot[1]=nearest.r.min[1]-.001;
    beams.push({id:o.id,receiverId:nearest.r.id,kind,color,start,end,spot,row:nearest.r.row,slot:nearest.r.slot});
  }
  for(const receiver of receivers){for(const color of ['red','green']){const matched=beams.filter(b=>b.receiverId===receiver.id&&b.color===color);if(matched.length!==1)throw new Error(`${receiver.label}: expected one ${color} source path`);receiver[color+'BeamId']=matched[0].id;}}
  const cube=o=>['Brep','Extrusion'].includes(o.type)&&o.max.every((v,k)=>v-o.min[k]>.005)&&Math.max(...o.max.map((v,k)=>v-o.min[k]))<.25;
  const cameras=objects.filter(o=>o.layer.includes('摄像机')&&cube(o)).sort((a,b)=>order(a.center[0],b.center[0]));
  const groundCameras=cameras.filter(o=>!o.layer.includes('120度广角摄像机')),existing=groundCameras.filter(o=>!o.layer.includes('未来增加'));
  const wallCameras=cameras.filter(o=>o.layer.includes('120度广角摄像机'));
  if(existing.length%2||groundCameras.length%2||!wallCameras.length)throw new Error('Camera pairing is incomplete');
  const currentRows=rowXs.length/(existing.length/2),futureRows=rowXs.length/(groundCameras.length/2),wallCount=wallRows.length/wallCameras.length;
  if(![currentRows,futureRows,wallCount].every(Number.isInteger))throw new Error('Reflector rows cannot be divided into camera groups');
  const points=o=>o.kind==='floor'?[[o.min[0],o.min[1],o.max[2]],[o.min[0],o.max[1],o.max[2]],[o.max[0],o.min[1],o.max[2]],[o.max[0],o.max[1],o.max[2]]]:[[o.min[0],o.min[1],o.min[2]],[o.min[0],o.min[1],o.max[2]],[o.max[0],o.min[1],o.min[2]],[o.max[0],o.min[1],o.max[2]]];
  const group=(list,start,count)=>list.filter(o=>o.row>start&&o.row<=start+count).flatMap(points);
  const floorPlans=groundCameras.map((o,i)=>{const k=existing.findIndex(c=>c.id===o.id),start=Math.floor(i/2)*futureRows,currentStart=Math.floor(k/2)*currentRows;return{id:'G'+String(i+1).padStart(2,'0'),objectId:o.id,installed:k>=0,position:o.center,future:{rows:[start+1,start+futureRows],playerView:i%2?'正面':'背面',targets:group(receivers.filter(r=>r.kind==='floor'),start,futureRows)},current:k<0?null:{rows:[currentStart+1,currentStart+currentRows],playerView:k%2?'正面':'背面',targets:group(receivers.filter(r=>r.kind==='floor'),currentStart,currentRows)}};});
  const highest=Math.max(...wall.map(o=>o.center[2])),wallPlans=wallCameras.map((o,i)=>({id:'W'+String(i+1).padStart(2,'0'),objectId:o.id,position:o.center,rows:[i*wallCount+1,(i+1)*wallCount],targets:group(receivers.filter(r=>r.kind==='wall'&&r.center[2]<highest-1e-4),i*wallCount,wallCount)}));
  const beamBoxes=[...new Map(objects.filter(o=>o.layer.endsWith('天顶方管')).map(o=>[JSON.stringify([o.min,o.max]),{min:o.min,max:o.max}])).values()];
  const source={name:config.model.name,sha256};
  const plan={schemaVersion:1,source,units:'meters',aspect:16/9,floorNominalAngle:85,wallNominalAngle:120,fovDefinition:'diagonal',angleStatus:'标称角度轴向未核实；默认按对角视场作理想投影',cameraReference:'模型机位方块中心代用光心，实际光心待标定',entryDirection:entryHighX?'-X':'+X',floor:floorPlans,wall:wallPlans,beamBoxes};
  const floorSurface=objects.filter(o=>o.layer.endsWith('12mm阻燃板，地面'));
  const floorZ=floorSurface.length?Math.max(...floorSurface.map(o=>o.max[2])):Math.min(...floor.map(o=>o.min[2]));
  const layout={schemaVersion:1,source,units:'meters',upAxis:'Z',entryHighX,rows:rowXs,floorZ,sourceObjectCount:objects.length,receivers:receivers.map(({color,name,type,...o})=>o),beams};
  async function writeChanged(filename,value){const text=JSON.stringify(value,null,2)+'\n';try{if((await readFile(filename,'utf8')).replaceAll('\r\n','\n')===text)return;}catch(error){if(error.code!=='ENOENT')throw error;}await writeFile(filename,text);}
  await writeChanged(path.join(root,'public/camera-plan.json'),plan);
  await writeChanged(path.join(root,'public/scene-layout.json'),layout);
  console.log(JSON.stringify({model:source.name,hash:sha256,rows:rowXs.length,floor:floor.length,wall:wall.length,redPaths:beams.filter(b=>b.color==='red').length,greenPaths:beams.filter(b=>b.color==='green').length,existingCameras:existing.length,futureCameras:groundCameras.length-existing.length,wallCameras:wallCameras.length,floorZ}));
  return {layout,plan};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await generateSceneLayout();
