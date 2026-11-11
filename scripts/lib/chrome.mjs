// 헤드리스 크롬으로 Delta Field 화면을 여는 도우미. scripts/playtest.mjs와 scripts/loadtest.mjs가 함께 쓴다.
// 개발 모드에서만 있는 window.__df로 위치를 옮기고 상태를 읽는다.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** CDP 연결 하나 */
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const handlers = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? { error: m.error }); pending.delete(m.id); }
    else if (m.method) for (const h of handlers) h(m);
  });
  return {
    send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (h) => handlers.push(h),
    close: () => ws.close(),
  };
}

const KEYS = {
  Space: [' ', 'Space', 32], Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  1: ['1', 'Digit1', 49], 2: ['2', 'Digit2', 50], 3: ['3', 'Digit3', 51], 4: ['4', 'Digit4', 52],
};

/** 크롬을 켠다. outDir에 프로필과 캡처를 둔다. 돌려주는 openPage로 창을 열고, consoleErrors에 화면 오류가 모인다. */
export async function launchChrome(outDir, port = 9334) {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, '--window-size=1280,800',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--user-data-dir=${outDir}/profile`, 'about:blank',
  ], { stdio: 'ignore' });

  let version;
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await wait(250); }
  }
  const browser = await cdp(version.webSocketDebuggerUrl);
  const consoleErrors = [];

  /** 따로 떨어진 창(쿠키·저장소를 나누지 않음) 하나를 연다. */
  async function openPage(name, url, { touch = false } = {}) {
    const { browserContextId } = await browser.send('Target.createBrowserContext');
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
    const page = await cdp(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(`[${name}] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(`[${name}] ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      }
    });
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    if (touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Page.navigate', { url });
    await wait(2000);
    let shotN = 0;
    const p = {
      name,
      js: async (expr) => (await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value,
      shot: async (label) => {
        const r = await page.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${outDir}/${name}-${String(++shotN).padStart(2, '0')}-${label}.png`, Buffer.from(r.data, 'base64'));
      },
      press: async (key, holdMs = 80) => {
        const [k, code, vk] = KEYS[key];
        const text = k.length === 1 ? k : k === 'Enter' ? '\r' : undefined;
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text });
        await wait(holdMs);
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
        await wait(300);
      },
      touch: (type, points) => page.send('Input.dispatchTouchEvent', { type, touchPoints: points }),
      /** 화면 좌표를 마우스로 누른다. */
      click: async (x, y) => {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        }
        await wait(300);
      },
      dialogText: () => p.js(`document.querySelector('.df-dialog')?.innerText ?? null`),
      error: () => p.js(`(() => { const e = document.querySelector('.df-error'); return e && !e.hidden ? e.textContent : null; })()`),
      /** 첫 화면에 입력하고 들어가기를 누른다. teacher면 선생님 화면으로 바꾼다. */
      enter: async ({ teacher = false, nickname, code = '', pw = '' }) => {
        await p.js(`(() => {
          const sw = document.querySelector('.df-link');
          if (${teacher} !== sw.textContent.includes('학생')) sw.click();
          const set = (id, v) => { const i = document.getElementById(id); i.value = v; };
          set('df-nickname', ${JSON.stringify(nickname)});
          set('df-code', ${JSON.stringify(code)});
          set('df-password', ${JSON.stringify(pw)});
          document.querySelector('.df-start form').requestSubmit();
        })()`);
        await wait(1500);
      },
      /** 이 창의 화면 그리기 빠르기(초당 프레임)를 ms 동안 잰다. */
      fps: (ms = 5000) => p.js(`new Promise((done) => {
        let n = 0;
        const t0 = performance.now();
        const frame = () => { n++; const t = performance.now() - t0; if (t < ${ms}) requestAnimationFrame(frame); else done(n / (t / 1000)); };
        requestAnimationFrame(frame);
      })`),
      close: () => browser.send('Target.closeTarget', { targetId }),
    };
    return p;
  }

  return {
    openPage,
    consoleErrors,
    close: () => {
      browser.close();
      chrome.kill();
    },
  };
}
