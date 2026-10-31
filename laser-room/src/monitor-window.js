import {createSignalMonitor} from './signal-monitor.js';

document.body.classList.add('monitor-standalone','monitor-stale');
document.title='激光空间 · 144点合成监视器';
const $=id=>document.getElementById(id),session=new URLSearchParams(location.search).get('session'),base=new URL('../',document.baseURI);
let channel,lastReceived=0,monitor,sourceHash;
$('signal-monitor').hidden=false;$('open-monitor').hidden=true;
const controls=[$('monitor-player-mode'),$('monitor-walk-toggle'),$('monitor-light-mode')];controls.forEach(c=>c.disabled=true);
function stale(message){document.body.classList.add('monitor-stale');$('fusion-connection').textContent=message;controls.forEach(c=>c.disabled=true);}
function send(command,value){channel?.postMessage({type:'control',command,value});}
$('monitor-player-mode').onchange=()=>send('players',$('monitor-player-mode').value);
$('monitor-light-mode').onchange=()=>send('light',$('monitor-light-mode').value);
$('monitor-walk-toggle').onclick=()=>send('toggle-walk');
try{
  if(!session)throw new Error('请从模拟页面点击“单独打开大监视器”，以连接同一场模拟。');
  const load=async name=>{const response=await fetch(new URL(name,base),{cache:'no-cache'});if(!response.ok)throw new Error('监视器资料加载失败');return response.json();};
  const [layout,plan]=await Promise.all([load('scene-layout.json'),load('camera-plan.json')]);
  sourceHash=layout.source.sha256;if(sourceHash!==plan.source.sha256)throw new Error('模型与机位资料不一致，请刷新原模拟页面。');
  monitor=createSignalMonitor(layout,plan);channel=new BroadcastChannel('laser-space-monitor:'+session);
  channel.onmessage=({data})=>{
    if(data.type!=='snapshot')return;
    if(data.sourceHash!==sourceHash){stale('模型版本不同，请从原页面重新打开监视器。');return;}
    if(Date.now()-data.sampledAt>3000){stale('原模拟已停止更新；请回到原页面检查。');return;}
    lastReceived=performance.now();document.body.classList.remove('monitor-stale');controls.forEach(c=>c.disabled=false);
    monitor.update(data.states,data.players);$('monitor-player-mode').value=data.mode;$('monitor-light-mode').value=data.lightMode;$('monitor-walk-toggle').textContent=data.walking?'暂停行走':'继续行走';
    $('fusion-connection').textContent='已连接原模拟 · 同步状态，不重复运行场景';
  };
  channel.postMessage({type:'request-state'});$('loading').hidden=true;stale('正在连接原模拟页面…');const started=performance.now();
  setInterval(()=>{if(lastReceived&&performance.now()-lastReceived>3000)stale('原模拟已停止更新；以下为过期画面，请回到原页面检查。');else if(!lastReceived&&performance.now()-started>3000)stale('尚未连接到原模拟；请从运行中的模拟页面重新打开监视器。');},1000);
}catch(error){$('loading').hidden=true;stale(error.message);}
