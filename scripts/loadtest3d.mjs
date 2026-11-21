// 3D 화면(?view=3d, 시제품)을 확인하고, 학생 35명이 들어와 움직일 때 3D 화면의 빠르기(fps)를 잰다.
// 선생님 1명(2D 크롬 화면)이 방을 만들고, 가짜 학생(봇)이 Node에서 붙어 학교 맵을 쉬지 않고 돌아다닌다.
// 학생 1명은 헤드리스 크롬의 3D 화면으로 들어와 맵·내 캐릭터·닉네임을 캡처하고, 방향키와 조이스틱으로 걸어 본다.
// 그다음 휴대폰(390×844, DPR 3)·태블릿(1180×820, DPR 2) 크기에서 보통 속도와 CPU 4배 느리게(CDP Emulation.setCPUThrottlingRate)로 fps를 잰다.
// 같은 조건의 2D 화면 fps도 함께 잰다(견주기용). 3D는 동물 모델(기본)과 Kenney 모델(?chars=kenney)을 같은 모임에서 견준다.
// 동물 모델은 가까이(__df.zoom) 걸어 가며 걷기 동작·보는 쪽·발바닥 높이를 보고 캡처하고, ?act=1의 J·H 키로 jump·wave도 틀어 본다.
// 헤드리스 크롬은 GPU 없이 소프트웨어로 그릴 수 있어(결과에 WebGL 렌더러를 적는다) 실제 기기와 숫자가 다르다. 실제 모양과 빠르기는 기기에서 본다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버는 DF_ESCAPE_DIR=scripts/playtest-escape로 켠다.
// 사용: DF_TEACHER_PASSWORD=... pnpm loadtest:3d [화면 주소] [게임 서버 주소] [학생 수]
//   기본값: http://localhost:5173/  http://localhost:2567  35
// 결과와 캡처는 .run/loadtest3d/에 남긴다.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Bot, runBots } from './lib/bots.mjs';
import { launchChrome, wait, withView } from './lib/chrome.mjs';

const [baseUrl = 'http://localhost:5173/', gameUrl = 'http://localhost:2567', countArg = '35'] = process.argv.slice(2);
const students = Number(countArg);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
const outDir = '.run/loadtest3d';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const measure = (name, detail) => results.push(`측정  ${name}: ${detail}`);
/** 첫 화면에 들어간다. 개발 서버가 처음 three를 읽으면 화면을 한 번 새로 고쳐(Vite 의존성 정리) 입력이 지워질 수 있어 한 번 더 해 본다. */
const enter = async (page, entry) => {
  await page.enter(entry);
  for (let i = 0; i < 2 && (await page.js(`typeof window.__df`)) !== 'object'; i++) {
    await wait(3000);
    if ((await page.js(`typeof window.__df`)) === 'object') break;
    await page.enter(entry);
  }
};
const withQuery = (q) => {
  const u = new URL(baseUrl);
  for (const [k, v] of new URLSearchParams(q)) u.searchParams.set(k, v);
  return u.href;
};

/** 키를 누른 채로 둔다(release로 뗀다). 누르는 동안 상태를 읽을 때 쓴다. */
const KEYS = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, KeyJ: 74, KeyH: 72 };
const keyName = (code) => (code.startsWith('Key') ? code.slice(3).toLowerCase() : code);
const hold = (page, code) => page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName(code), code, windowsVirtualKeyCode: KEYS[code] });
const release = (page, code) => page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName(code), code, windowsVirtualKeyCode: KEYS[code] });

const SIZES = [
  { name: '휴대폰', width: 390, height: 844, dpr: 3 },
  { name: '태블릿', width: 1180, height: 820, dpr: 2 },
];
const THROTTLES = [1, 4];

const chrome = await launchChrome(outDir);
const teacher = await chrome.openPage('teacher', withQuery('view=2d'));
await enter(teacher, { teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님 화면이 방을 만듦', /^\d{4}$/.test(code ?? ''), code);
await wait(800);
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('예시 방탈출'))?.click()`);
await wait(500);

// ---- 3D 화면에 혼자 들어가 걸어 보기 ----
// 주소에 view를 붙이지 않는다(기본이 3D인지 함께 본다).
const s3 = await chrome.openPage('student3d', withQuery('act=1'));
await enter(s3, { nickname: '삼디학생', code, character: 'char-03' });
await wait(2500);
const gl = await s3.js(`(() => {
  const c = document.querySelector('#game canvas');
  const g = c?.getContext('webgl2');
  const ext = g?.getExtension('WEBGL_debug_renderer_info');
  return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (g ? g.getParameter(g.RENDERER) : null);
})()`);
measure('WebGL 렌더러(헤드리스 크롬)', String(gl));
check('3D 화면으로 들어감(주소에 view 없음 = 기본 3D)', (await s3.js(`__df.view()`)) === '3d' && (await s3.js(`__df.map()`)) === 'school');
const info0 = await s3.js(`__df.three()`);
check('3D: 캐릭터를 동물 모델로 그림', info0?.set === 'animal', info0?.set);
check('3D: 맵과 캐릭터를 그림', info0?.calls > 3, `그리기 ${info0?.calls}번, 삼각형 ${info0?.triangles}개`);
const me0 = info0?.me;
check('3D: 내 캐릭터가 화면 가운데쯤', me0 && Math.abs(me0.x - 640) < 80 && Math.abs(me0.y - 400) < 120, JSON.stringify(me0));
const tag = await s3.js(`document.querySelector('.df-hud-place')?.textContent`);
check('3D: 위쪽 안내에 장소', !!tag && tag.length > 0, tag);
await s3.shot('enter');
// 흩어 선 자리에 따라 책상에 막힐 수 있어, 오른쪽·아래가 트인 시작 위치(학교 맵 start)에서 걷는다.
await s3.js(`__df.teleport(11.5, 9.5)`);
const p0 = await s3.js(`__df.pos()`);
await s3.press('ArrowRight', 900);
await s3.press('ArrowDown', 500);
const p1 = await s3.js(`__df.pos()`);
check('3D: 방향키로 걸으면 위치가 바뀜', p1.col > p0.col + 1.5 && p1.row > p0.row + 0.5, `(${p0.col.toFixed(2)}, ${p0.row.toFixed(2)}) → (${p1.col.toFixed(2)}, ${p1.row.toFixed(2)})`);
await wait(500);
const seen = await teacher.js(`__df.others().find((o) => o.nickname === '삼디학생')`);
check('3D: 선생님 화면(서버)도 새 위치를 앎', seen && Math.hypot(seen.col - p1.col, seen.row - p1.row) < 0.01, seen ? `(${seen.col.toFixed(2)}, ${seen.row.toFixed(2)})` : '없음');
await s3.shot('walked');

// ---- 고양이 가까이: 걷기 동작, 앞을 보고 걷는지, 발이 바닥에 붙는지 ----
await s3.js(`__df.teleport(11.5, 9.5)`);
await s3.js(`__df.zoom(3.2)`);
await wait(800);
const still = await s3.js(`__df.three()`);
check('고양이: 서 있을 때 idle', still.action === 'idle', still.action);
check('고양이: 서 있을 때 발바닥이 바닥(y = 0)', Math.abs(still.feetY) < 0.02, `y = ${still.feetY.toFixed(3)}`);
await s3.shot('cat-idle');
const walkFeet = [];
// 오른쪽(+X, 보는 쪽 90°), 아래(+Z 카메라 쪽, 0°), 위(-Z, 180°), 왼쪽(-X, -90°)
// 그 방향으로 1.5칸이 트인 자리를 찾아 서서 걷는다(책상·벽에 막혀 멈추면 idle이 된다).
const DIRS = [['ArrowRight', 90, 'right', 1, 0], ['ArrowDown', 0, 'down', 0, 1], ['ArrowLeft', -90, 'left', -1, 0], ['ArrowUp', 180, 'up', 0, -1]];
for (const [code, want, label, dx, dy] of DIRS) {
  const spot = await s3.js(`(() => {
    for (let r = 2; r < 30; r++) for (let c = 2; c < 40; c++) {
      const col = c + 0.5, row = r + 0.5;
      let ok = true;
      for (let k = 0; k <= 6 && ok; k++) ok = __df.free(col + ${dx} * k * 0.25, row + ${dy} * k * 0.25);
      if (ok) return { col, row };
    }
    return null;
  })()`);
  if (spot) await s3.js(`__df.teleport(${spot.col}, ${spot.row})`);
  await wait(300);
  await hold(s3, code);
  await wait(200);
  const t = await s3.js(`__df.three()`);
  for (let i = 0; i < 4; i++) {
    walkFeet.push((await s3.js(`__df.three()`)).feetY);
    await wait(25);
  }
  await s3.shot(`cat-walk-${label}`);
  await release(s3, code);
  const off = Math.abs(((t.facing - want + 540) % 360) - 180);
  check(`고양이: ${label}로 걸을 때 walk, 그쪽을 봄`, !!spot && t.action === 'walk' && off < 10, `${spot ? `(${spot.col}, ${spot.row})에서 ` : '트인 자리 없음, '}${t.action}, 보는 쪽 ${t.facing.toFixed(0)}° (바랄 쪽 ${want}°)`);
  await wait(500);
}
measure('고양이: 걷는 동안 몸의 가장 낮은 점 높이', `${Math.min(...walkFeet).toFixed(3)} ~ ${Math.max(...walkFeet).toFixed(3)}칸 (${walkFeet.length}번 잼)`);
const stop = await s3.js(`__df.three()`);
check('고양이: 멈추면 idle로 돌아옴', stop.action === 'idle', stop.action);
// 한 번 하는 동작: ?act=1에서 J = jump, H = wave
for (const [code, name] of [['KeyJ', 'jump'], ['KeyH', 'wave']]) {
  await hold(s3, code);
  await release(s3, code);
  await wait(350);
  const t = await s3.js(`__df.three()`);
  await s3.shot(`cat-${name}`);
  check(`고양이: ${code.slice(3)} 키로 ${name}`, t.action === name, t.action);
  await wait(1800);
  const back = await s3.js(`__df.three()`);
  check(`고양이: ${name}가 끝나면 idle`, back.action === 'idle' && Math.abs(back.feetY) < 0.02, `${back.action}, 발 y = ${back.feetY.toFixed(3)}`);
}
await s3.js(`__df.zoom(null)`);
await wait(500);

// 조이스틱(터치 화면): 화면 전체 어디든 누르고 끌면 걷는다.
const t3 = await chrome.openPage('touch3d', withQuery('touch=1'), { touch: true, size: { width: 390, height: 844 } });
await enter(t3, { nickname: '터치삼디', code, character: 'char-05' });
await wait(2500);
const q0 = await t3.js(`__df.pos()`);
await t3.touch('touchStart', [{ x: 200, y: 600 }]);
await wait(100);
await t3.touch('touchMove', [{ x: 260, y: 600 }]);
await wait(900);
await t3.touch('touchEnd', []);
await wait(300);
const q1 = await t3.js(`__df.pos()`);
check('3D: 조이스틱으로 걸으면 위치가 바뀜', q1.col > q0.col + 1, `(${q0.col.toFixed(2)}, ${q0.row.toFixed(2)}) → (${q1.col.toFixed(2)}, ${q1.row.toFixed(2)})`);
await t3.shot('joystick');
await t3.close();

// ---- 봇을 넣고 3D 화면이 다른 학생을 보는지 ----
const bots = Array.from({ length: students - 1 }, (_, i) => new Bot(i, gameUrl));
const joined = await Promise.allSettled(bots.map((b) => b.join(code)));
const failed = joined.filter((r) => r.status === 'rejected');
check(`봇 ${bots.length}명이 들어옴`, failed.length === 0, failed.map((r) => r.reason?.message ?? r.reason).join(', '));
const live = bots.filter((b) => b.room);
const stopBots = runBots(live);
for (const b of live) b.wander = true;
await wait(2500);
const info1 = await s3.js(`__df.three()`);
// 터치삼디는 창을 닫아도 서버에 잠시 남을 수 있어 봇 + 선생님 이상이면 된다.
check(`3D: 다른 사람 ${live.length + 1}명 이상을 그림(봇 + 선생님)`, info1.remotes >= live.length + 1, `${info1.remotes}명, 그리기 ${info1.calls}번`);
const a = await s3.js(`__df.others().find((o) => o.nickname === '봇01')`);
await wait(1000);
const b = await s3.js(`__df.others().find((o) => o.nickname === '봇01')`);
check('3D: 다른 학생(봇)이 움직여 보임', a && b && Math.hypot(a.col - b.col, a.row - b.row) > 0.5);
await s3.shot('crowd');

// ---- fps: 3D와 2D, 휴대폰·태블릿 크기, 보통·CPU 4배 느리게 ----
async function fpsMatrix(page, label, crowd = '퍼짐') {
  for (const size of SIZES) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.dpr, mobile: true });
    await wait(1500);
    for (const rate of THROTTLES) {
      await page.send('Emulation.setCPUThrottlingRate', { rate });
      await wait(1500);
      const fps = await page.fps(5000);
      const extra =
        label.startsWith('3D')
          ? await page.js(`(() => { const t = __df.three(); const f = t.frameMs;
              return \`프레임당 계산 평균 \${f.avg.toFixed(1)}ms·95% \${f.p95.toFixed(1)}ms, 그리기 \${t.calls}번, 픽셀 비율 \${t.pixelRatio}, 화면 안 \${t.onScreen}명\`; })()`)
          : '';
      measure(`${label} ${crowd} ${size.name} ${size.width}×${size.height}(DPR ${size.dpr}) CPU ${rate === 1 ? '보통' : `${rate}배 느리게`}`, `${fps.toFixed(1)}fps${extra ? ` (${extra})` : ''}`);
      if (rate === 1) await page.shot(`${label}-${crowd}-${size.width}x${size.height}`);
    }
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
}
// 퍼진 경우(봇이 학교 맵 전체를 돌아다님)와 모두 내 둘레에 모인 경우(골든벨처럼 한 곳에 모임)를 잰다.
await fpsMatrix(s3, '3D 고양이', '퍼짐');
const center = await s3.js(`__df.pos()`);
for (const bot of live) {
  bot.wander = false;
  bot.target = { col: center.col - 4 + Math.random() * 8, row: center.row - 2.5 + Math.random() * 5 };
}
await wait(4000);
// 모인 뒤에도 조금씩 움직이게(걷기 동작과 보간이 돌게) 자리를 바꾼다.
const shuffle = setInterval(() => {
  for (const bot of live) bot.target = { col: center.col - 4 + Math.random() * 8, row: center.row - 2.5 + Math.random() * 5 };
}, 1500);
await fpsMatrix(s3, '3D 고양이', '모임');
await s3.shot('crowd-cat');
await s3.close();
// 같은 모임을 Kenney 모델(앞 시제품)로 다시 잰다(견주기).
const sk = await chrome.openPage('student3d-kenney', withQuery('view=3d&chars=kenney'));
await enter(sk, { nickname: '케니학생', code, character: 'char-03' });
await wait(3000);
check('3D(?chars=kenney): Kenney 모델로 그림', (await sk.js(`__df.three().set`)) === 'kenney');
await sk.js(`__df.teleport(${center.col}, ${center.row})`);
await wait(1500);
await fpsMatrix(sk, '3D Kenney', '모임');
await sk.shot('crowd-kenney');
await sk.close();
const s2 = await chrome.openPage('student2d', withQuery('view=2d'));
await enter(s2, { nickname: '이디학생', code, character: 'char-03' });
await wait(2500);
// 2D 학생도 시작 위치 둘레에 서므로 모인 봇이 화면 안에 있다.
await fpsMatrix(s2, '2D', '모임');
await s2.close();
clearInterval(shuffle);

stopBots();
await Promise.allSettled(live.map((bot) => bot.room.leave()));
check('화면 오류 없음', chrome.consoleErrors.length === 0, chrome.consoleErrors.slice(0, 3).join(' | '));
chrome.close();

const text = results.join('\n');
console.log(text);
console.log(`캡처: ${outDir}`);
writeFileSync(`${outDir}/result.txt`, text + '\n');
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
