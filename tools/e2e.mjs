/**
 * tools/e2e.mjs — 真浏览器端到端自测（不需要装 puppeteer）
 *
 * 原理：起一个 headless Chrome，开远程调试端口，用 DevTools 协议
 *       发真实键盘/鼠标事件，再读画布像素判断结果。
 *
 * 用法：
 *   node tools/e2e.mjs                 # 用默认 Chrome 路径
 *   CHROME_PATH="D:\\...\\chrome.exe" node tools/e2e.mjs
 *
 * 退出码 0 = 全过。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file:///' + path.resolve(HERE, '..', 'index.html').replace(/\\/g, '/');
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find((p) => { try { return fs.existsSync(p); } catch { return false; } });

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
}

async function json(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

async function waitForBrowser() {
  for (let i = 0; i < 80; i++) {
    try { await json(`http://127.0.0.1:${PORT}/json/version`); return true; } catch { await sleep(250); }
  }
  return false;
}

async function main() {
  if (!CHROME) { console.error('找不到 Chrome/Edge，请用 CHROME_PATH 指定'); process.exit(2); }

  const profile = path.join(os.tmpdir(), 'paint-smash-e2e-profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1280,800',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const ok = await waitForBrowser();
  if (!ok) { console.error('浏览器没起来'); chrome.kill(); process.exit(2); }

  const target = await json(`http://127.0.0.1:${PORT}/json/new?about:blank`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')); });

  let id = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + r.exceptionDetails.text);
    return r.result?.value;
  };

  const COVER = `(() => {
    const c = document.getElementById('paint');
    const o = document.createElement('canvas');
    o.width = 160; o.height = 100;
    const g = o.getContext('2d');
    g.drawImage(c, 0, 0, 160, 100);
    const d = g.getImageData(0, 0, 160, 100).data;
    let n = 0, sum = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] > 24) n++; sum += d[i]; }
    return { cover: +(n / 16000).toFixed(3), meanAlpha: +(sum / 16000).toFixed(1) };
  })()`;

  const press = async (ch) => {
    const code = /[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : 'Digit' + ch;
    const vk = ch.toUpperCase().charCodeAt(0);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: PAGE });
    await sleep(1600);

    check('开始页出现', await evaluate(`!document.getElementById('start').classList.contains('gone')`));
    await evaluate(`document.getElementById('go').click()`);
    await sleep(400);
    check('开始页隐藏（已开始玩）', await evaluate(`document.getElementById('start').classList.contains('gone')`));

    const blank = await evaluate(COVER);
    check('初始化就是一张干净白纸', blank.cover === 0 && blank.meanAlpha === 0, JSON.stringify(blank));

    /* 1. 疯狂按键 → 画布被画满 */
    const keys = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 200; i++) await press(keys[i % keys.length]);
    const full = await evaluate(COVER);
    check('按 200 下能画满屏', full.cover > 0.4, `cover=${full.cover}`);

    /* 2. 自动洗画 → 擦成干净白纸（不留淡影） */
    let cleaned = null;
    for (let i = 0; i < 48; i++) {
      await sleep(250);
      const c = await evaluate(COVER);
      if (c.cover < 0.02 && c.meanAlpha < 2) { cleaned = c; break; }
    }
    check('画满后自动洗画，且擦干净不留淡影', !!cleaned, cleaned ? `meanAlpha=${cleaned.meanAlpha}` : '超时');

    /* 3. 洗完还能继续画 */
    for (let i = 0; i < 24; i++) await press(keys[i]);
    const again = await evaluate(COVER);
    check('洗完能继续画', again.cover > 0.05, `cover=${again.cover}`);

    /* 4. 家长快捷键 Ctrl+Shift+X：立刻清屏 */
    const beforeClear = await evaluate(COVER);
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'X', code: 'KeyX', text: 'X',
      windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88, modifiers: 2 | 8
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'X', code: 'KeyX',
      windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88, modifiers: 2 | 8
    });
    await sleep(250);
    const afterClear = await evaluate(COVER);
    check('Ctrl+Shift+X 立刻清成干净白纸',
      beforeClear.cover > 0.05 && afterClear.cover === 0 && afterClear.meanAlpha === 0,
      `${beforeClear.cover} -> ${afterClear.cover}`);

    /* 5. 不管颜料怎么来的，满了都会洗（模拟鼠标涂满） */
    await evaluate(`(() => { const c = document.getElementById('paint'); const g = c.getContext('2d');
      for (let i = 0; i < 70; i++) { g.fillStyle = ['#ff6b6b','#ffc93c','#4ecdc4'][i % 3];
        g.fillRect(Math.random() * c.width * 0.8, Math.random() * c.height * 0.8, 320, 240); } })()`);
    let clearedByAny = false;
    for (let i = 0; i < 48; i++) {
      await sleep(250);
      const c = await evaluate(COVER);
      if (c.cover < 0.02 && c.meanAlpha < 2) { clearedByAny = true; break; }
    }
    check('任何方式涂满都会自动洗', clearedByAny);

    /* 6. 功能性按键不产生颜料 */
    await evaluate(`document.getElementById('paint').getContext('2d').clearRect(0, 0, 9999, 9999)`);
    for (const k of [{ key: 'Tab', code: 'Tab', vk: 9 }, { key: 'Escape', code: 'Escape', vk: 27 },
                     { key: 'F5', code: 'F5', vk: 116 }, { key: 'Control', code: 'ControlLeft', vk: 17 }]) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
    }
    const blocked = await evaluate(COVER);
    check('Tab / Esc / F5 / Ctrl 全部被屏蔽', blocked.cover === 0, `cover=${blocked.cover}`);

    check('页面没有 JS 异常', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    try { ws.close(); } catch {}
    try { await json(`http://127.0.0.1:${PORT}/json/close/${target.id}`); } catch {}
    chrome.kill();
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
