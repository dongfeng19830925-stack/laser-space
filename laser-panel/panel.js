const colors = ['关闭', '红', '绿'];
const grid = document.querySelector('#grid');
const status = document.querySelector('#status');
const presets = [...document.querySelectorAll('[data-preset]')];
let state = null;
let revision;
let panelKey;
let busy = true;

const cells = Array.from({ length: 144 }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = String(index).padStart(2, '0');
  button.addEventListener('click', () => apply({ index }));
  grid.append(button);
  return button;
});

function render(message) {
  status.textContent = message;
  presets.forEach(button => { button.disabled = busy || revision === undefined; });
  cells.forEach((button, index) => {
    const color = state?.[index];
    button.dataset.color = color ?? 'unknown';
    button.setAttribute('aria-label', '点位 ' + index + '，' + (colors[color] ?? '未知'));
    button.disabled = busy || state === null;
  });
}

async function apply(action) {
  if (busy) return;
  busy = true;
  render('正在发送到 MQTT 服务…');
  let message;
  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Laser-Panel-Key': panelKey },
      body: JSON.stringify({ ...action, revision }),
    });
    const result = await response.json();
    if ('revision' in result) ({ state, revision } = result);
    if (response.status === 403) revision = undefined;
    message = response.ok
      ? (action.index === undefined ? '已发布' + ['全关', '全红', '全绿'][action.preset] + '指令'
        : '已发布点位 ' + action.index + ' · ' + colors[state[action.index]])
      : result.error;
  } catch {
    state = null;
    revision = undefined;
    message = '本地连接中断，请刷新页面确认状态。';
  } finally {
    busy = false;
    render(message);
  }
}

presets.forEach(button => {
  button.addEventListener('click', () => apply({ preset: Number(button.dataset.preset) }));
});

render('正在加载控制面板…');
try {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error('Could not load state');
  ({ state, revision, panelKey } = await response.json());
  busy = false;
  render(state ? '已载入本面板上次下发的状态' : '设备初始状态未知，请先选择全红、全绿或全关。');
} catch {
  render('无法连接本地服务，请刷新重试。');
}
