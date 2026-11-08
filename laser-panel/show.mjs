import { randomBytes, randomInt } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { connect } from 'mqtt';

export const FRAME_COUNT = 60;
export const FRAME_INTERVAL_MS = 2000;
const GRID_SIZE = 12;

export function createPattern(frame) {
  const mode = frame % 3;
  const colors = Array.from({ length: mode === 2 ? 36 : GRID_SIZE }, (_, i) => i % 3);
  for (let i = colors.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return Array.from({ length: GRID_SIZE ** 2 }, (_, i) => {
    const row = Math.floor(i / GRID_SIZE);
    const column = i % GRID_SIZE;
    if (mode === 0) return colors[row];
    if (mode === 1) return colors[column];
    return colors[Math.floor(row / 2) * (GRID_SIZE / 2) + Math.floor(column / 2)];
  });
}

async function runShow() {
  const broker = process.env.LASER_MQTT_URL || 'mqtt://192.168.10.80:1883';
  const client = connect(broker, {
    clientId: 'laser-show-' + randomBytes(4).toString('hex'),
    connectTimeout: 4000,
    reconnectPeriod: 0,
  });
  client.on('error', error => console.error('MQTT:', error.message));

  async function publish(state) {
    if (!client.connected) throw new Error('MQTT 连接已断开');
    let timer;
    try {
      await Promise.race([
        client.publishAsync('changeState', JSON.stringify({ state }), { qos: 1, retain: false }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('等待 MQTT 确认超时')), 3500);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  let started = false;
  try {
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', reject);
      client.once('close', () => reject(new Error('MQTT 连接已断开')));
    });

    const start = performance.now();
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const remaining = start + frame * FRAME_INTERVAL_MS - performance.now();
      await wait(Math.max(0, remaining), undefined, { signal: stop.signal });
      started = true;
      await publish(createPattern(frame));
      if (frame === 0 || (frame + 1) % 15 === 0) {
        console.log(`MQTT 已确认 ${frame + 1}/${FRAME_COUNT} 组`);
      }
    }
    await wait(Math.max(0, start + FRAME_COUNT * FRAME_INTERVAL_MS - performance.now()),
      undefined, { signal: stop.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('展示已中止');
    } else {
      console.error(error.message);
      process.exitCode = 1;
    }
  } finally {
    if (started) {
      try {
        await publish(Array(GRID_SIZE ** 2).fill(0));
        console.log('MQTT 已确认全关指令');
      } catch (error) {
        console.error('全关未获 MQTT 确认，请通过现场面板全关。', error.message);
        process.exitCode = 1;
      }
    }
    await client.endAsync(true);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runShow();
}
