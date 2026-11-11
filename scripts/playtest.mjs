// 헤드리스 크롬으로 교실 방탈출 한 판을 자동으로 해 본다(개발 서버가 켜져 있어야 한다).
// 사용: pnpm playtest [주소] [캡처 폴더]  기본값: http://localhost:5173/  .run/playtest
// 개발 모드에서만 있는 window.__df로 위치를 옮기고 상태를 읽는다.
// 퀴즈 답 번호와 사물 위치는 src/data/classroom.json에 맞춰 두었다. 방 데이터를 바꾸면 함께 고친다.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [baseUrl = 'http://localhost:5173/', outDir = '.run/playtest'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9334;
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`,
  '--window-size=1280,800', `--user-data-dir=${outDir}/profile`, 'about:blank',
], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await wait(250); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
let shotN = 0;
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${String(++shotN).padStart(2, '0')}-${name}.png`, Buffer.from(r.data, 'base64'));
};
const KEYS = {
  Space: [' ', 'Space', 32], Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39],
  ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  1: ['1', 'Digit1', 49], 2: ['2', 'Digit2', 50], 3: ['3', 'Digit3', 51], 4: ['4', 'Digit4', 52],
};
async function press(name, holdMs = 80) {
  const [key, code, vk] = KEYS[name];
  const text = key.length === 1 ? key : key === 'Enter' ? '\r' : undefined;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
  await wait(holdMs);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await wait(300);
}
const dialogText = () => js(`document.querySelector('.df-dialog')?.innerText ?? null`);
const results = [];
function check(name, ok, detail = '') { results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: baseUrl });
await wait(2000);
await shot('nickname');

// 빈 닉네임
await js(`document.querySelector('.df-start button').click()`);
await wait(200);
check('빈 닉네임이면 오류 문구', (await js(`document.querySelector('.df-error')?.hidden === false`)) === true);
await js(`(() => { const i = document.getElementById('df-nickname'); i.value = '테스트'; i.form.requestSubmit(); })()`);
await wait(1500);
check('닉네임 입력 뒤 방에 들어감', (await js(`!!window.__df`)) === true);
await shot('room');

// 벽 충돌: 왼쪽 위 구석에서 왼쪽, 위로 민다
await js(`__df.teleport(1.5, 1.5)`);
await press('ArrowLeft', 600);
await press('ArrowUp', 600);
const p = await js(`__df.pos()`);
check('벽을 뚫고 나가지 않음', p.col >= 1.29 && p.row >= 1.29, `col ${p.col.toFixed(2)}, row ${p.row.toFixed(2)}`);

// 책상 충돌: 책상(2~4, 4) 위에서 아래로
await js(`__df.teleport(3, 3.5)`);
await press('ArrowDown', 600);
const pd = await js(`__df.pos()`);
check('책상을 지나가지 않음', pd.row <= 3.71, `row ${pd.row.toFixed(2)}`);

// 잠긴 문
await js(`__df.teleport(11, 8.6)`);
await wait(100);
check('문 앞에서 문이 살펴볼 대상', (await js(`__df.target()`)) === 'door');
check('살펴보기 단추가 켜짐', (await js(`document.querySelector('.df-action').disabled`)) === false);
await press('Space');
const locked = await dialogText();
check('열쇠 없이 문: 잠김 안내', /잠겨/.test(locked ?? ''), locked?.replace(/\n/g, ' / '));
await shot('door-locked');
await press('Enter');
check('Enter로 닫힘', (await dialogText()) === null);
await wait(400);
check('닫은 뒤 다시 열리지 않음', (await dialogText()) === null);

// 칠판 단서
await js(`__df.teleport(6.5, 1.5)`);
await press('Space');
check('칠판 단서', /교탁/.test((await dialogText()) ?? ''));
await shot('blackboard');
await press('Space');

// 교탁 퀴즈: 틀린 답 뒤 맞는 답
await js(`__df.teleport(7, 3.5)`);
await press('Space');
check('교탁 퀴즈가 뜸', /가속도/.test((await dialogText()) ?? ''));
await press('1');
check('틀린 답 안내', /틀렸습니다/.test((await dialogText()) ?? ''));
await shot('quiz-wrong');
await press('2');
const got = await dialogText();
check('맞힌 뒤 사물함 열쇠를 얻음', /사물함 열쇠를 얻었습니다/.test(got ?? ''), got?.replace(/\n/g, ' / '));
await press('Enter');
check('가진 물건에 사물함 열쇠', (await js(`document.querySelector('.df-hud').innerText`)).includes('사물함 열쇠'));
await shot('got-locker-key');

// 사물함 퀴즈
await js(`__df.teleport(11.5, 3.5)`);
await press('Space');
check('사물함 퀴즈가 뜸', /중력 가속도/.test((await dialogText()) ?? ''));
await press('3');
check('교실 문 열쇠를 얻음', /교실 문 열쇠를 얻었습니다/.test((await dialogText()) ?? ''));
await press('Enter');
await press('Space');
check('다시 살펴보면 doneText', /비어 있습니다/.test((await dialogText()) ?? ''));
await press('Escape');

// 문 퀴즈와 탈출
await js(`__df.teleport(11, 8.6)`);
await press('Space');
check('문 퀴즈가 뜸', /전류/.test((await dialogText()) ?? ''));
await press('1');
const fin = await dialogText();
check('탈출 화면', /탈출했습니다/.test(fin ?? '') && /걸린 시간/.test(fin ?? ''), fin?.replace(/\n/g, ' / '));
check('escaped 상태', (await js(`__df.escaped()`)) === true);
await shot('escaped');
await js(`document.querySelector('.df-dialog button').click()`);
await wait(800);
check('다시 하기: 물건이 비워짐', (await js(`__df.items().length`)) === 0);
await shot('restart');

// 터치: 조이스틱
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: baseUrl + '?touch=1' });
await wait(2000);
await js(`(() => { const i = document.getElementById('df-nickname'); i.value = '터치'; i.form.requestSubmit(); })()`);
await wait(1500);
const box = await js(`(() => { const r = document.querySelector('.df-joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; })()`);
check('조이스틱이 보임', !!box);
await shot('touch');
const before = await js(`__df.pos()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.r, y: box.y }] });
await wait(500);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await wait(200);
const after = await js(`__df.pos()`);
check('조이스틱을 오른쪽으로 밀면 오른쪽으로 감', after.col - before.col > 1 && Math.abs(after.row - before.row) < 0.1,
  `col ${before.col.toFixed(2)} → ${after.col.toFixed(2)}, row ${before.row.toFixed(2)} → ${after.row.toFixed(2)}`);
await wait(300);
const still = await js(`__df.pos()`);
check('손을 떼면 멈춤', Math.abs(still.col - after.col) < 0.01);

check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
console.log(results.join('\n'));
console.log(`캡처: ${outDir}`);
ws.close();
chrome.kill();
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
