const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
export function lensFov(angle,definition='diagonal',portrait=false,aspect=16/9){
  const t=Math.tan(rad(angle/2));
  let ht=definition==='horizontal'?t:t*aspect/Math.hypot(aspect,1),vt=definition==='horizontal'?t/aspect:t/Math.hypot(aspect,1);
  if(portrait)[ht,vt]=[vt,ht];
  return {horizontal:deg(2*Math.atan(ht)),vertical:deg(2*Math.atan(vt)),ht,vt,aspect:portrait?1/aspect:aspect};
}
// Fit the complete target rectangles at a fixed optical center; only yaw/pitch change.
export function fitCamera(position,points,fov){
  if(!points.length)throw new Error('机位没有目标反光板');
  const center=[0,1,2].map(k=>(Math.min(...points.map(p=>p[k]))+Math.max(...points.map(p=>p[k])))/2);
  const yaw=Math.atan2(center[1]-position[1],center[0]-position[0]),cy=Math.cos(yaw),sy=Math.sin(yaw),right=[sy,-cy,0],deltas=points.map(p=>sub(p,position));
  const evaluate=pitch=>{
    const cp=Math.cos(pitch),sp=Math.sin(pitch),forward=[cp*cy,cp*sy,-sp],up=[sp*cy,sp*sy,cp];let q=0;
    for(const d of deltas){const depth=dot(d,forward);if(depth<=0)return Infinity;q=Math.max(q,Math.abs(dot(d,right))/(depth*fov.ht),Math.abs(dot(d,up))/(depth*fov.vt));}return q;
  };
  let lo=0,hi=Math.PI/2;const ratio=(Math.sqrt(5)-1)/2;
  for(let i=0;i<60;i++){const a=hi-ratio*(hi-lo),b=lo+ratio*(hi-lo);if(evaluate(a)<evaluate(b))hi=b;else lo=a;}
  const pitch=(lo+hi)/2,q=evaluate(pitch),forward=[Math.cos(pitch)*cy,Math.cos(pitch)*sy,-Math.sin(pitch)];
  return {pitch:deg(pitch),yaw:deg(yaw),forward,frameFraction:q,covered:q<=1+1e-8,edgeMarginPercent:(1-q)*50};
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Full plate sight pyramid versus each conservatively enclosing beam box.
export function countBeamBlockedPlates(position,points,boxes){
  let count=0;
  for(let i=0;i<points.length;i+=4){
    const p=points.slice(i,i+4),order=[p[0],p[2],p[3],p[1]],pyramid=[position,...order],edges=[];
    const axes=[[1,0,0],[0,1,0],[0,0,1],cross(sub(order[1],order[0]),sub(order[3],order[0]))];
    for(let j=0;j<4;j++){edges.push(sub(order[j],position),sub(order[(j+1)%4],order[j]));axes.push(cross(sub(order[j],position),sub(order[(j+1)%4],position)));}
    for(const edge of edges)for(const axis of [[1,0,0],[0,1,0],[0,0,1]])axes.push(cross(edge,axis));
    const projections=axes.filter(a=>dot(a,a)>1e-20).map(axis=>{const v=pyramid.map(p=>dot(p,axis));return{axis,min:Math.min(...v),max:Math.max(...v)};});
    if(boxes.some(box=>!projections.some(p=>{
      const lo=p.axis.reduce((s,v,k)=>s+v*(v>=0?box.min[k]:box.max[k]),0),hi=p.axis.reduce((s,v,k)=>s+v*(v>=0?box.max[k]:box.min[k]),0);
      return hi<p.min-1e-10||lo>p.max+1e-10;
    })))count++;
  }return count;
}
