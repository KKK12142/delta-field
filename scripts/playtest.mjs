// 헤드리스 크롬으로 선생님 1명, 학생 2명이 들어와 교실 방탈출을 해 보고, 선생님은 CCTV 모드로 지켜본다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버의 선생님 비밀번호를 DF_TEACHER_PASSWORD로 넘긴다.
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest [주소] [캡처 폴더]   기본값: http://localhost:5173/  .run/playtest
// 개발 모드에서만 있는 window.__df로 위치를 옮기고 상태를 읽는다.
// 퀴즈 답 번호와 사물 위치는 src/data/classroom.json에 맞춰 두었다. 방 데이터를 바꾸면 함께 고친다.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [baseUrl = 'http://localhost:5173/', outDir = '.run/playtest'] = process.argv.slice(2);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const port = 9334;
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, '--window-size=1280,800',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${outDir}/profile`, 'about:blank',
], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let version;
for (let i = 0; i < 40 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await wait(250); }
}

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

const browser = await cdp(version.webSocketDebuggerUrl);
const consoleErrors = [];
const KEYS = {
  Space: [' ', 'Space', 32], Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  1: ['1', 'Digit1', 49], 2: ['2', 'Digit2', 50], 3: ['3', 'Digit3', 51], 4: ['4', 'Digit4', 52],
};

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
    close: () => browser.send('Target.closeTarget', { targetId }),
  };
  return p;
}

const results = [];
function check(name, ok, detail = '') { results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }
const fmt = (s) => s?.replace(/\n+/g, ' / ');

// ---- 선생님: 새 방 만들기 ----
const teacher = await openPage('teacher', baseUrl);
await teacher.enter({ teacher: true, nickname: '선생님', pw: 'wrong-password' });
check('선생님 비밀번호가 틀리면 안내', /비밀번호가 맞지 않습니다/.test((await teacher.error()) ?? ''), await teacher.error());
await teacher.enter({ teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님이 방을 만들고 방 코드를 받음', /^\d{4}$/.test(code ?? ''), code);
check('선생님 화면에 방 코드가 보임', (await teacher.js(`document.querySelector('.df-hud').innerText`))?.includes(`방 코드 ${code}`));
await teacher.shot('room-created');

// ---- 학생: 잘못된 입력 ----
const a = await openPage('student-a', baseUrl);
await a.enter({ nickname: '', code });
check('빈 닉네임이면 안내', /닉네임을 입력해야/.test((await a.error()) ?? ''));
await a.enter({ nickname: '가람', code: '12' });
check('방 코드가 4자리가 아니면 안내', /숫자 4자리/.test((await a.error()) ?? ''));
const wrongCode = code === '0000' ? '0001' : '0000';
await a.enter({ nickname: '가람', code: wrongCode });
check('없는 방 코드면 안내', /인 방이 없습니다/.test((await a.error()) ?? ''), await a.error());
await a.enter({ nickname: '선생님', code });
check('겹치는 닉네임이면 안내', /같은 닉네임/.test((await a.error()) ?? ''), await a.error());
await a.shot('nickname-taken');
await a.enter({ nickname: '가람', code });
check('학생 A가 방 코드로 들어감', (await a.js(`window.__df?.code()`)) === code);

// ---- 학생 B(태블릿) ----
const b = await openPage('student-b', baseUrl + '?touch=1', { touch: true });
await b.enter({ nickname: '나래', code });
check('학생 B가 들어감', (await b.js(`window.__df?.code()`)) === code);
await wait(500);
check('선생님 화면: 학생 2명 접속', (await teacher.js(`document.querySelector('.df-hud').innerText`))?.includes('학생 2명 접속'));
const seenByTeacher = await teacher.js(`__df.others().map((o) => o.nickname).sort().join(',')`);
check('선생님이 두 학생을 봄', seenByTeacher === '가람,나래', seenByTeacher);
check('학생 A가 선생님과 학생 B를 봄', (await a.js(`__df.others().map((o) => o.nickname).sort().join(',')`)) === '나래,선생님');

// ---- 학생 B가 조이스틱으로 움직이면 다른 화면에 보임 ----
const box = await b.js(`(() => { const r = document.querySelector('.df-joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; })()`);
const bBefore = await b.js(`__df.pos()`);
await b.touch('touchStart', [{ x: box.x, y: box.y }]);
await b.touch('touchMove', [{ x: box.x + box.r, y: box.y }]);
await wait(500);
await b.touch('touchEnd', []);
await wait(500);
const bAfter = await b.js(`__df.pos()`);
check('학생 B가 조이스틱으로 오른쪽으로 감', bAfter.col - bBefore.col > 1, `col ${bBefore.col.toFixed(2)} → ${bAfter.col.toFixed(2)}`);
const bOnTeacher = await teacher.js(`__df.others().find((o) => o.nickname === '나래')`);
check('선생님 화면의 학생 B 위치가 따라옴', Math.abs(bOnTeacher.col - bAfter.col) < 0.05, `서버 ${bOnTeacher.col.toFixed(2)}, B ${bAfter.col.toFixed(2)}`);
const drawn = await teacher.js(`__df.drawn()`);
check('선생님 화면에 다른 사람 아바타 2개가 그려짐', drawn.length === 2);
await teacher.shot('sees-students');
await b.shot('touch');

// ---- 선생님: CCTV 모드 켜기 ----
const cctvText = () => teacher.js(`document.querySelector('.df-cctv')?.innerText ?? null`);
const rowText = (nick) => teacher.js(`[...document.querySelectorAll('.df-cctv-row')]
  .find((r) => r.querySelector('.df-cctv-row-name').textContent === ${JSON.stringify(nick)})?.innerText ?? null`);
const clickText = (page, selector, text) => page.js(`[...document.querySelectorAll(${JSON.stringify(selector)})]
  .find((b) => b.textContent === ${JSON.stringify(text)})?.click()`);
const cctv = () => teacher.js(`__df.cctv()`);
check('학생 화면에는 CCTV 단추가 없음', (await a.js(`document.querySelector('.df-hud .df-button-small').hidden`)) === true);
const cctvOffBefore = (await teacher.js(`(() => { const s = window.__df; return s && s.cctv() === null; })()`)) === true;
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(400);
check('CCTV: 창이 뜨고 학생 2명', cctvOffBefore && /학생 2명/.test((await cctvText()) ?? ''), fmt(await cctvText()));
check('CCTV: 목록이 닉네임 순',
  (await teacher.js(`[...document.querySelectorAll('.df-cctv-row-name')].map((n) => n.textContent).join(',')`)) === '가람,나래');
check('CCTV: 처음에는 돌아다니는 중, 진행 0/4', /돌아다니는 중/.test((await rowText('가람')) ?? '') && /진행 0\/4/.test((await rowText('가람')) ?? ''),
  fmt(await rowText('가람')));
check('CCTV: 오른쪽 안내와 살펴보기 단추를 감춤',
  (await teacher.js(`document.querySelector('.df-action').hidden && !document.querySelector('.df-hud').innerText.includes('가진 물건')`)) === true);
const overviewZoom = (await cctv()).zoom;
const tPos = await teacher.js(`__df.pos()`);
await teacher.press('ArrowRight', 400);
const tPos2 = await teacher.js(`__df.pos()`);
check('CCTV 모드에서는 선생님이 움직이지 않음', Math.abs(tPos2.col - tPos.col) < 0.01);

// ---- 학생 A: 방탈출 한 판(선생님은 CCTV로 봄) ----
await a.js(`__df.teleport(1.5, 1.5)`);
await a.press('ArrowLeft', 600);
await a.press('ArrowUp', 600);
const p = await a.js(`__df.pos()`);
check('벽을 뚫고 나가지 않음', p.col >= 1.29 && p.row >= 1.29, `col ${p.col.toFixed(2)}, row ${p.row.toFixed(2)}`);
await a.js(`__df.teleport(3, 3.5)`);
await a.press('ArrowDown', 600);
check('책상을 지나가지 않음', (await a.js(`__df.pos().row`)) <= 3.71);

await a.js(`__df.teleport(11, 8.6)`);
await a.press('Space');
check('열쇠 없이 문: 잠김 안내', /잠겨/.test((await a.dialogText()) ?? ''));
await wait(300);
check('CCTV: 잠긴 문을 보는 중', /문 살펴보는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
await a.press('Enter');
await wait(400);
check('닫은 뒤 다시 열리지 않음', (await a.dialogText()) === null);
check('CCTV: 닫으면 돌아다니는 중', /돌아다니는 중/.test((await rowText('가람')) ?? ''));

// (6.5, 1.5)는 칠판과 교탁이 같은 거리라 교탁이 골라진다. 칠판만 닿는 자리에서 살펴본다.
await a.js(`__df.teleport(5, 1.5)`);
await a.press('Space');
check('칠판 단서', /칠판에 글이 적혀 있습니다/.test((await a.dialogText()) ?? ''), fmt(await a.dialogText()));
await a.press('Space');
await wait(300);
check('CCTV: 칠판을 본 뒤 진행 1/4', /진행 1\/4/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

await a.js(`__df.teleport(7, 3.5)`);
await a.press('Space');
check('교탁 퀴즈가 뜸', /가속도/.test((await a.dialogText()) ?? ''));
await wait(300);
check('CCTV: 교탁 퀴즈 푸는 중(목록)', /교탁 퀴즈 푸는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
check('CCTV: 지도의 아바타 위에 "교탁 퀴즈"', (await cctv()).tags.includes('교탁 퀴즈'), (await cctv()).tags.join(','));
await teacher.shot('cctv-overview');
await a.press('1');
check('틀린 답 안내', /틀렸습니다/.test((await a.dialogText()) ?? ''));
await a.shot('quiz-wrong');
await a.press('2');
check('맞힌 뒤 사물함 열쇠를 얻음', /사물함 열쇠를 얻었습니다/.test((await a.dialogText()) ?? ''));
await a.press('Enter');
check('가진 물건에 사물함 열쇠', (await a.js(`document.querySelector('.df-hud').innerText`)).includes('사물함 열쇠'));
await wait(300);
check('CCTV: 진행 2/4', /진행 2\/4/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

// ---- 선생님: 지도에서 학생을 눌러 따라가기, Esc로 돌아오기 ----
const bScreen = await teacher.js(`__df.screenOf('나래')`);
await teacher.click(bScreen.x, bScreen.y);
await wait(500);
check('CCTV: 지도에서 누른 학생(나래)을 따라감', (await cctv()).following === '나래' && /나래/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.press('Escape');
check('CCTV: Esc로 전체 보기', (await cctv()).following === null && (await rowText('가람')) !== null);

// ---- 선생님: 목록에서 학생 A를 눌러 따라가기 ----
await clickText(teacher, '.df-cctv-row-name', '가람');
await wait(900);
const panelLeft = await teacher.js(`document.querySelector('.df-cctv').getBoundingClientRect().left`);
/** 따라가는 학생이 지도 자리(CCTV 창 왼쪽, 위쪽 안내 아래)의 가운데쯤에 보이는지 */
const nearMiddle = async (nick) => {
  const at = await teacher.js(`__df.screenOf(${JSON.stringify(nick)})`);
  const h = await teacher.js(`innerHeight`);
  return { ok: Math.abs(at.x - panelLeft / 2) < 60 && Math.abs(at.y - (100 + h) / 2) < 60, at };
};
let mid = await nearMiddle('가람');
const follow = await cctv();
check('CCTV: 목록에서 누른 학생(가람)을 크게 보며 따라감',
  follow.following === '가람' && follow.zoom > overviewZoom * 1.3 && mid.ok,
  `zoom ${overviewZoom.toFixed(2)} → ${follow.zoom.toFixed(2)}, 화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
check('CCTV: 정보 창에 진행과 가진 물건', /진행 2\/4/.test((await cctvText()) ?? '') && /사물함 열쇠/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.shot('cctv-follow');

await a.js(`__df.teleport(11.5, 3.5)`);
await a.press('Space');
check('사물함 퀴즈가 뜸', /중력 가속도/.test((await a.dialogText()) ?? ''));
await wait(900);
mid = await nearMiddle('가람');
check('CCTV: 학생이 옮겨 가도 따라감', mid.ok && /사물함 퀴즈 푸는 중/.test((await cctvText()) ?? ''), `화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
await a.press('3');
check('교실 문 열쇠를 얻음', /교실 문 열쇠를 얻었습니다/.test((await a.dialogText()) ?? ''));
await a.press('Enter');

await a.js(`__df.teleport(11, 8.6)`);
await a.press('Space');
check('문 퀴즈가 뜸', /전류/.test((await a.dialogText()) ?? ''));
await a.press('1');
const fin = await a.dialogText();
check('탈출 화면', /탈출했습니다/.test(fin ?? '') && /걸린 시간/.test(fin ?? ''), fmt(fin));
await a.shot('escaped');
await wait(300);
check('CCTV: 탈출 완료, 진행 4/4', /탈출 완료/.test((await cctvText()) ?? '') && /진행 4\/4/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.shot('cctv-escaped');
await clickText(teacher, '.df-cctv button', '전체 보기');
check('CCTV: 전체 보기 단추로 돌아감', (await cctv()).following === null && Math.abs((await cctv()).zoom - overviewZoom) < 0.01);

await a.js(`document.querySelector('.df-dialog button').click()`);
await wait(800);
check('다시 하기: 물건이 비워짐', (await a.js(`__df.items().length`)) === 0);
check('다시 하기 뒤에도 방에 남아 있음', (await a.js(`__df.code()`)) === code);
await wait(300);
const aOnTeacher = await teacher.js(`__df.others().find((o) => o.nickname === '가람')`);
const aPos = await a.js(`__df.pos()`);
check('다시 하기 뒤 시작 둘레로 돌아가고 선생님 화면에 반영',
  Math.abs(aPos.col - 2.5) <= 1.5 && Math.abs(aPos.row - 8.5) <= 1.5 &&
  Math.abs(aOnTeacher.col - aPos.col) < 0.05 && Math.abs(aOnTeacher.row - aPos.row) < 0.05,
  `A ${aPos.col.toFixed(2)}, ${aPos.row.toFixed(2)} / 선생님 화면 ${aOnTeacher.col.toFixed(2)}, ${aOnTeacher.row.toFixed(2)}`);
check('CCTV: 다시 하기 뒤 진행 0/4, 돌아다니는 중',
  /진행 0\/4/.test((await rowText('가람')) ?? '') && /돌아다니는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

// ---- 선생님: CCTV 끄고 다시 돌아다니기 ----
await clickText(teacher, '.df-cctv button', 'CCTV 끄기');
check('CCTV 끄기: 창이 닫히고 살펴보기 단추가 돌아옴',
  (await teacher.js(`!document.querySelector('.df-cctv') && !document.querySelector('.df-action').hidden && __df.cctv() === null`)) === true);
const tPos3 = await teacher.js(`__df.pos()`);
await teacher.press('ArrowRight', 400);
check('CCTV를 끄면 선생님이 다시 움직임', (await teacher.js(`__df.pos().col`)) - tPos3.col > 0.5);

// ---- 학생 B가 창을 닫으면 CCTV에 연결 끊김, 다시 붙기 시간(20초)이 지난 뒤 사라짐 ----
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(300);
await b.close();
await wait(1000);
check('창을 닫은 직후에는 다시 붙기를 기다림(남아 있음)', (await teacher.js(`__df.others().length`)) === 2);
check('CCTV: 연결 끊김 표시', /연결 끊김/.test((await rowText('나래')) ?? ''), fmt(await rowText('나래')));
await wait(21000);
check('20초 뒤 선생님 화면에서 사라짐', (await teacher.js(`__df.others().map((o) => o.nickname).join(',')`)) === '가람');
check('CCTV: 학생 1명', /학생 1명/.test((await cctvText()) ?? '') && (await rowText('나래')) === null);
await clickText(teacher, '.df-cctv button', 'CCTV 끄기');
check('선생님 화면: 학생 1명 접속', (await teacher.js(`document.querySelector('.df-hud').innerText`))?.includes('학생 1명 접속'));

// ---- 선생님이 방 코드로 다시 들어오기(새로고침) ----
const teacher2 = await openPage('teacher2', baseUrl);
await teacher2.enter({ teacher: true, nickname: '선생님2', code, pw: password });
check('선생님이 방 코드로 기존 방에 다시 들어감', (await teacher2.js(`window.__df?.role()`)) === 'teacher' && (await teacher2.js(`__df.code()`)) === code);

check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
console.log(results.join('\n'));
console.log(`캡처: ${outDir}`);
browser.close();
chrome.kill();
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
