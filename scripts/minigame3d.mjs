// 3D 미니게임 확인(design/quick-specs/minigame-3d.md 완료 기준).
// 선생님 1명(3D 기본 화면), 학생 A(3D, 수과학반)·B(3D, AI.SW반), 봇(Node)으로 보물찾기·공 피하기·줄다리기를 한 판씩 한다.
// 서버 상태는 Node로 붙은 도우미 선생님(같은 방)이 바로 읽는다(서버 점수와 3D 화면이 맞는지 견준다). 도우미는 방탈출 자료(example.yaml)도 골라
// 잠긴 교실 문이 보물찾기 중에만 열리는지 본다.
// 캡처는 .run/minigame3d/에 남기고, 기준 캡처는 production/qa/evidence/minigame-3d-*.png로 복사한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버는 DF_MINI_FAST=1 DF_ESCAPE_DIR=scripts/playtest-escape로 켠다.
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest:mini3d [화면 주소] [게임 서버 주소] [봇 수]
//   기본값: http://localhost:5173/  http://localhost:2567  4
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Bot, runBots } from './lib/bots.mjs';
import { launchChrome, wait } from './lib/chrome.mjs';

const { Client } = await import('@colyseus/sdk');
const [baseUrl = 'http://localhost:5173/', gameUrl = 'http://localhost:2567', countArg = '4'] = process.argv.slice(2);
const botCount = Number(countArg);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
const outDir = '.run/minigame3d';
const evidenceDir = 'production/qa/evidence';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const fmt = (s) => (s ?? 'null').replace(/\s+/g, ' ').slice(0, 160);
const enter = async (page, entry) => {
  await page.enter(entry);
  for (let i = 0; i < 3 && (await page.js(`typeof window.__df`)) !== 'object'; i++) {
    await wait(3000);
    if ((await page.js(`typeof window.__df`)) === 'object') break;
    await page.enter(entry);
  }
  for (let i = 0; i < 40 && (await page.js(`typeof window.__df?.mini`)) !== 'function'; i++) await wait(250);
};
const clickText = (page, selector, text) =>
  page.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.includes(${JSON.stringify(text)}) && !x.hidden); b?.click(); return !!b; })()`);
const closeDialogs = async (page) => {
  for (let i = 0; i < 5 && (await page.dialogText()) !== null; i++) {
    await page.js(`document.querySelector('.df-dialog .df-button')?.click()`);
    await wait(300);
  }
};
const until = async (fn, ms = 10000, step = 150) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await wait(step);
  }
  return false;
};
const evidence = [];
const chrome = await launchChrome(outDir);
const open = async (name, url) => {
  const page = await chrome.openPage(name, url);
  let n = 0;
  const raw = page.shot;
  page.shot = async (label, evidenceName = null) => {
    await raw(label);
    n++;
    const file = `${outDir}/${name}-${String(n).padStart(2, '0')}-${label}.png`;
    if (evidenceName) {
      const to = `${evidenceDir}/minigame-3d-${evidenceName}-${today}.png`;
      copyFileSync(file, to);
      evidence.push(to);
    }
    return file;
  };
  return page;
};

// ---- 방, 학생 A·B(3D), 도우미 선생님(Node), 봇 ----
const teacher = await open('teacher', baseUrl);
await enter(teacher, { teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님: 3D 화면으로 방을 만듦', /^\d{4}$/.test(code ?? '') && (await teacher.js(`__df.view()`)) === '3d', code);
const a = await open('a3d', baseUrl);
await enter(a, { nickname: '삼디가', code, character: 'char-01', classGroup: 'science' });
const b = await open('b3d', baseUrl);
await enter(b, { nickname: '삼디나', code, character: 'char-02', classGroup: 'aisw' });
await wait(1200);
const helper = await new Client(gameUrl).joinById(code, { nickname: '도우미', password, character: 'char-03' });
const loaded = await helper.request('escapeLoad', { file: 'example.yaml' });
await wait(1200);
for (const pg of [a, b, teacher]) await closeDialogs(pg);
check('학생 A·B 3D, 방탈출 자료(example.yaml)', (await a.js(`__df.view()`)) === '3d' && (await b.js(`__df.view()`)) === '3d' && !loaded?.error, loaded?.error ?? '');
const bots = Array.from({ length: botCount }, (_, i) => new Bot(i, gameUrl));
await Promise.allSettled(bots.map((bot) => bot.join(code)));
const live = bots.filter((bot) => bot.room);
check(`봇 ${botCount}명이 들어옴`, live.length === botCount, `${live.length}명`);
const stopBots = runBots(live);

/** 서버 상태(도우미가 받은 것)의 학생 */
const server = (nickname) => [...helper.state.players.values()].find((p) => p.nickname === nickname);
const miniOf = (pg) => pg.js(`__df.mini()`);
const d3 = (pg) => pg.js(`__df.mini3d()`);
const placeLine = (pg) => pg.js(`document.querySelector('.df-hud-place')?.textContent ?? ''`);
const buttons = () => teacher.js(`[...document.querySelectorAll('.df-hud button')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.textContent)`);
check('선생님 3D 학교 맵: "미니게임 시작" 단추가 보임', (await buttons()).includes('미니게임 시작'), (await buttons()).join(', '));

/** 선생님이 미니게임 시작 → 고르기 → 확인(2D와 같은 창) */
async function startMini(name) {
  await clickText(teacher, '.df-hud button', '미니게임 시작');
  await wait(600);
  const pick = (await teacher.dialogText()) ?? '';
  const icons = await teacher.js(`document.querySelectorAll('.df-dialog .df-choice-icon').length`);
  await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.startsWith(${JSON.stringify(name)})).click()`);
  await wait(500);
  const confirmText = (await teacher.dialogText()) ?? '';
  await clickText(teacher, '.df-dialog .df-button', '시작하기');
  await wait(300);
  return { pick, confirmText, icons };
}
const untilPhase = (pg, phase, sec) => until(async () => (await miniOf(pg)).phase === phase, sec * 1000, 200);
/** 선생님이 결과 창을 닫는다(미니게임 그만두기 → 확인) */
async function closeMini() {
  // 선생님 결과 창을 닫는다(창이 열려 있으면 단추가 듣지 않는다).
  await until(async () => /결과/.test((await teacher.dialogText()) ?? ''), 3000);
  await clickText(teacher, '.df-dialog .df-button', '닫기');
  await until(async () => (await teacher.dialogText()) === null, 2000);
  await clickText(teacher, '.df-hud button', '미니게임 그만두기');
  await until(async () => /미니게임 그만두기/.test((await teacher.dialogText()) ?? ''), 2000);
  const text = (await teacher.dialogText()) ?? '';
  // 대화상자는 뜬 뒤 0.2초 동안 코드로 누른 click을 받지 않는다(src/ui/dialog.ts OPEN_GUARD_MS).
  await wait(300);
  await clickText(teacher, '.df-dialog .df-button', '그만두기');
  await until(async () => (await miniOf(a)).phase === '' && (await miniOf(teacher)).phase === '', 4000);
  await until(async () => (await buttons()).includes('미니게임 시작'), 2000);
  return text;
}
const near = (p, q, d = 0.1) => Math.abs(p.col - q.col) < d && Math.abs(p.row - q.row) < d;
/** 결과 창 "내 등수 N위 · 점수"에서 점수 글 */
const myLine = async (pg) => /내 등수 (\d+)위 · ([\d.]+)/.exec((await pg.dialogText()) ?? '');

/** 그 화면이 울리려 한 효과음 이름(src/audio/miniSounds.ts). 헤드리스라 소리는 듣지 않고 부른 것만 본다. */
const sounds = (pg) => pg.js(`__df.sounds().requested`);
const soundsReset = (pg) => pg.js(`__df.soundsReset()`);
const has = (list, ...names) => names.every((n) => list.includes(n));

// ---- 보물찾기 ----
for (const pg of [a, b]) await soundsReset(pg);
await a.js(`__df.teleport(11.5, 8.5)`);
await b.js(`__df.teleport(12.5, 8.5)`);
await wait(500);
const doorBefore = await a.js(`__df.free(22, 12)`);
const aHome = await a.js(`__df.pos()`);
const bHome = await b.js(`__df.pos()`);
const tr = await startMini('보물찾기');
check('선생님 3D: 고르기 창(보물찾기·공 피하기·줄다리기, 그림)과 확인 창',
  /보물찾기[\s\S]*공 피하기[\s\S]*줄다리기/.test(tr.pick) && tr.icons === 3 && /3초 뒤/.test(tr.confirmText), `${fmt(tr.pick)} | ${fmt(tr.confirmText)}`);
const counted = await until(async () =>
  (await miniOf(a)).phase === 'count' && /^[123]$/.test((await a.js(`document.querySelector('.df-mini-count:not([hidden])')?.textContent`)) ?? '') &&
  (await buttons()).includes('미니게임 그만두기'), 2500, 50);
check('3초 세기(큰 숫자), 선생님 단추는 "미니게임 그만두기"', counted, `${JSON.stringify(await miniOf(a))} ${(await buttons()).join(', ')}`);
// 세는 동안(아직 아무도 줍지 못함): 보물 30개(금 5개)를 모두 그린다.
const countDrawn = await d3(a);
check('보물찾기 3D: 세는 동안 보물 30개를 그림(보통 상자 25·금 보석 5)', countDrawn.boxes === 25 && countDrawn.gems === 5, `${countDrawn.boxes}+${countDrawn.gems}`);
await untilPhase(a, 'play', 6);
await wait(300);
const startSounds = await sounds(a);
check('효과음: 세기 3·2·1마다 삐(countBeep), 시작에 출발 소리(miniStart)',
  startSounds.filter((n) => n === 'countBeep').length >= 2 && startSounds.includes('miniStart') && startSounds.indexOf('countBeep') < startSounds.indexOf('miniStart'), startSounds.join(','));
/** 서버 보물 수(보통, 금). 봇도 보물을 주우므로 같은 때의 서버 상태와 견준다. */
const serverTreasures = () => {
  const list = [...helper.state.mini.treasures.values()];
  return { boxes: list.filter((t) => !t.gold).length, gems: list.filter((t) => t.gold).length };
};
let spots = [];
let da = null;
let db = null;
let st = null;
// 봇도 줍고 있어 서버 상태와 화면이 잠깐 어긋날 수 있으므로 한동안 맞춰 본다.
const sameStart = await until(async () => {
  spots = await a.js(`__df.treasures()`);
  const bIds = (await b.js(`__df.treasures()`)).map((t) => t[0]).sort();
  da = await d3(a);
  db = await d3(b);
  st = serverTreasures();
  return da.boxes === st.boxes && da.gems === st.gems && db.boxes === st.boxes && db.gems === st.gems && JSON.stringify(bIds) === JSON.stringify(spots.map((t) => t[0]).sort());
}, 2000, 50);
check('보물찾기 3D: 모두에게 같은 자리, 그린 보물 수(보통·금) = 서버 보물 수(A·B)',
  sameStart && helper.state.mini.treasures.size + 0 <= 30, `서버 ${st.boxes}+${st.gems}, A ${da.boxes}+${da.gems}, B ${db.boxes}+${db.gems}`);
check('보물찾기: 안내 칸 "· 미니게임 중"', /미니게임 중/.test(await placeLine(a)), await placeLine(a));
check('보물찾기: 잠긴 교실 문이 보물찾기 중에만 열림(3D 충돌)', doorBefore === false && (await a.js(`__df.free(22, 12)`)) === true, `전 ${doorBefore}`);
// 금 보물 가까이(닿지 않게) 서서 캡처
const gold = spots.find((t) => t[3]);
await a.js(`__df.teleport(${gold[1] - 1.5}, ${gold[2] + 1})`);
await wait(700);
await a.js(`__df.zoom(7)`);
await wait(300);
await a.shot('treasure', 'treasure');
await a.js(`__df.zoom(null)`);
await a.js(`__df.teleport(${gold[1]}, ${gold[2]})`);
await until(async () => server('삼디가')?.miniScore === 3, 3000);
const gone = async (pg, id) => !(await pg.js(`__df.treasures()`)).some((t) => t[0] === id);
let st2 = null;
let a2 = null;
const goldGone = await until(async () => {
  st2 = serverTreasures();
  a2 = await d3(a);
  return (await gone(a, gold[0])) && (await gone(b, gold[0])) && a2.gems === st2.gems && (await d3(b)).gems === st2.gems;
}, 2000, 50);
check('보물찾기: 금 보물에 닿으면 서버 3점, A·B 3D 화면에서 사라짐(그린 금 수 = 서버 금 수)',
  server('삼디가')?.miniScore === 3 && (await miniOf(a)).score === 3 && goldGone, `서버 ${server('삼디가')?.miniScore}점 금 ${st2.gems}, A 금 ${a2.gems}`);
const plain = (await b.js(`__df.treasures()`)).find((t) => !t[3]);
await b.js(`__df.teleport(${plain[1]}, ${plain[2]})`);
await until(async () => server('삼디나')?.miniScore === 1, 3000);
await wait(300);
// 봇도 줍고 있어 서버 상태가 화면보다 조금 앞설 수 있으므로 한동안 맞춰 본다.
let drawnA = null;
const sameAsServer = await until(async () => {
  drawnA = await d3(a);
  const st3 = serverTreasures();
  return drawnA.boxes === st3.boxes && drawnA.gems === st3.gems;
}, 2000, 50);
check('효과음: A가 금 보물을 주우면 금 줍기(pickGold), B가 보통 보물을 주우면 줍기(pick)',
  (await sounds(a)).includes('pickGold') && (await sounds(b)).includes('pick') && !(await sounds(b)).includes('pickGold'), `A ${(await sounds(a)).join(',')} | B ${(await sounds(b)).join(',')}`);
check('보물찾기: 보통 보물은 서버 1점, 그린 보물 수 = 남은 서버 보물 수',
  server('삼디나')?.miniScore === 1 && sameAsServer, `서버 남음 ${helper.state.mini.treasures.size}, A ${drawnA.boxes + drawnA.gems}`);
const trDone = await untilPhase(a, 'result', 30);
await wait(600);
const trLine = await myLine(a);
check('효과음: 결과 창이 뜨면 팡파르(fanfare)', (await sounds(a)).includes('fanfare'), (await sounds(a)).slice(-3).join(','));
check('보물찾기 결과 창: 내 점수가 서버 점수와 같음', trDone && /보물찾기 결과/.test((await a.dialogText()) ?? '') && Number(trLine?.[2]) === server('삼디가')?.miniScore,
  fmt(await a.dialogText()));
check('보물찾기: 끝나면 시작 전 자리로 돌아감(A·B), 문은 다시 잠김',
  near(await a.js(`__df.pos()`), aHome) && near(await b.js(`__df.pos()`), bHome) && (await until(async () => (await a.js(`__df.free(22, 12)`)) === false, 2000)),
  `${JSON.stringify(await a.js(`__df.pos()`))} / ${JSON.stringify(aHome)}`);
await a.shot('treasure-result', 'treasure-result');
const stopText = await closeMini();
check('그만두기 확인 창 → 결과 창이 닫히고 처음으로', /결과 창을 닫습니다/.test(stopText) && (await a.dialogText()) === null && (await miniOf(a)).phase === '' && (await buttons()).includes('미니게임 시작'),
  fmt(stopText));

// ---- 공 피하기 ----
const aHome2 = await a.js(`__df.pos()`);
await startMini('공 피하기');
const inArena = (p) => p.col >= 2 && p.col <= 46 && p.row >= 20 && p.row <= 35;
await until(async () => inArena(await a.js(`__df.pos()`)) && inArena(await b.js(`__df.pos()`)), 4000);
check('공 피하기: A·B가 서버가 세운 운동장 안 자리로 옮겨짐, 울타리가 보임',
  inArena(await a.js(`__df.pos()`)) && inArena(await b.js(`__df.pos()`)) && (await d3(a)).fence === true, `${JSON.stringify(await a.js(`__df.pos()`))}`);
await untilPhase(a, 'play', 6);
// 공이 몇 개 굴러 나온 뒤 운동장 가운데에서 넓게 본다(B 화면).
await b.js(`__df.teleport(24, 27.5)`);
await b.js(`__df.zoom(16)`);
await wait(2500);
await b.shot('dodge', 'dodge');
await b.js(`__df.zoom(null)`);
// 위쪽 울타리 쪽으로 걸어 본다(운동장 위 19행은 바닥이라 울타리가 막아야 한다).
await b.js(`__df.teleport(30, 20.4)`);
await wait(200);
await b.press('ArrowUp', 600);
const bRow = await b.js(`__df.pos().row`);
check('공 피하기: 운동장 울타리 밖으로 걸어 나가지 못함(3D 충돌)', bRow >= 19.99 && (await b.js(`__df.free(30, 19.5)`)) === true, `행 ${bRow.toFixed(2)}`);
await wait(1500);
// 화면의 공 수 = 같은 시각 공 일정(shared ballsAt)의 공 수
let ballsOk = 0;
const ballsDetail = [];
for (let i = 0; i < 6; i++) {
  const s = await a.js(`(() => { const d = __df.mini3d(); return { balls: d.balls, expected: d.expectedBalls, sched: __df.ballsAt(d.ballTime).length }; })()`);
  if (s.balls === s.expected && s.expected === s.sched) ballsOk++;
  ballsDetail.push(`${s.balls}/${s.sched}`);
  await wait(250);
}
check('공 피하기 3D: 그린 공 수 = 서버 seed 공 일정(shared ballsAt)의 공 수', ballsOk === 6, ballsDetail.join(' '));
// A를 운동장 안의 공 자리에 세운다(학생 화면이 자기 발로 맞음을 보고 알린다). 그 전에 벌써 맞았으면 그대로 본다.
const hitAlready = server('삼디가')?.miniOut === true;
const hitTry = hitAlready
  ? '이미 맞음'
  : await a.js(`(() => { const t = __df.dodgeTime() + 0.05; const b = __df.ballsAt(t).find(([x, y]) => x > 3 && x < 45 && y > 21 && y < 34); if (b) __df.teleport(b[0], b[1]); return b ?? null; })()`);
const out = await until(async () => server('삼디가')?.miniOut === true, 3000);
await wait(600);
const aSpot = await a.js(`__df.pos()`);
const look = await teacher.js(`__df.looks().others['삼디가']?.alpha`);
check('공 피하기: 공에 맞으면 서버 탈락, 구경 줄(19.5행)로 옮김, 흐리게(선생님·내 화면), 걷지 못함',
  out && Math.abs(aSpot.row - 19.5) < 0.1 && Math.abs(look - 0.4) < 0.01 && Math.abs((await a.js(`__df.looks().me.alpha`)) - 0.4) < 0.01 && (await d3(a)).frozen,
  `공 ${JSON.stringify(hitTry)}, 자리 ${aSpot.col.toFixed(1)},${aSpot.row.toFixed(2)}, 선생님 화면 투명도 ${look}`);
check('효과음: 공에 맞으면 맞음(hit)', (await sounds(a)).includes('hit'), (await sounds(a)).slice(-4).join(','));
await a.press('ArrowDown', 400);
check('공 피하기: 구경하는 학생은 움직이지 않음', near(await a.js(`__df.pos()`), aSpot, 0.01));
await wait(300);
await a.shot('dodge-out', 'dodge-out');
const dgDone = await untilPhase(a, 'result', 30);
await wait(600);
const dgLine = await myLine(a);
check('공 피하기 결과 창: 내 버틴 시간이 서버 점수와 같음', dgDone && /공 피하기 결과/.test((await a.dialogText()) ?? '') && dgLine?.[2] === server('삼디가')?.miniScore.toFixed(1),
  `${fmt(await a.dialogText())} | 서버 ${server('삼디가')?.miniScore}`);
check('공 피하기: 끝나면 시작 전 자리로, 흐림이 풀리고 울타리가 사라짐',
  near(await a.js(`__df.pos()`), aHome2) && (await a.js(`__df.looks().me.alpha`)) === 1 && (await d3(a)).fence === false, JSON.stringify(await a.js(`__df.pos()`)));
await teacher.shot('dodge-result-teacher', 'dodge-result-teacher');
await closeMini();

// ---- 줄다리기(HTML 창이 3D 위에 뜨는지) ----
const tg = await startMini('줄다리기');
await untilPhase(a, 'play', 6);
check('줄다리기: 3D 화면 위에 화면 전체 창(두 반 상징, 당기기 단추)',
  (await a.js(`!!document.querySelector('.df-tug .df-tug-pull') && document.querySelectorAll('.df-tug-emblem').length === 2`)) && (await d3(b)).tug,
  `${fmt(tg.confirmText)} | 선생님 창 ${fmt(await teacher.dialogText())} | ${JSON.stringify(await miniOf(a))}`);
await soundsReset(a);
const before = await a.js(`__df.pos()`);
await a.press('ArrowRight', 400);
check('줄다리기: 걷지 않음', near(await a.js(`__df.pos()`), before, 0.01));
for (let i = 0; i < 8; i++) {
  await a.js(`document.querySelector('.df-tug-pull').click()`);
  await wait(120);
}
await a.press('Space');
await wait(400);
{
  const st = await a.js(`__df.sounds()`);
  const asked = st.requested.filter((n) => n === 'tug').length;
  const played = st.played.filter((n) => n === 'tug').length;
  check('효과음: 줄다리기는 누를 때마다 당기기 소리(tug)를 부름(9번)', asked === 9 && played <= asked, `부름 ${asked}, 울림 ${played}, 오디오 ${st.started ? '켜짐' : '꺼짐'}`);
}
check('줄다리기: 단추·스페이스바로 당긴 수가 서버에 셈(9번)', server('삼디가')?.miniScore === 9 && (await miniOf(a)).score === 9, `서버 ${server('삼디가')?.miniScore}`);
// 너무 잦지 않게: 한순간에 세 번 당기면 소리는 부르지만 tug 간격(sfx.json 0.18초) 안이라 한 번만 울린다(오디오가 꺼져 있으면 0번).
await soundsReset(a);
await a.js(`(() => { for (let i = 0; i < 3; i++) document.querySelector('.df-tug-pull').click(); })()`);
{
  const st = await a.js(`__df.sounds()`);
  const asked = st.requested.filter((n) => n === 'tug').length;
  const played = st.played.filter((n) => n === 'tug').length;
  check('효과음: 한순간에 세 번 당기면 당기기 소리는 한 번만 울림', asked === 3 && played <= 1 && (!st.started || played === 1), `부름 ${asked}, 울림 ${played}, 오디오 ${st.started ? '켜짐' : '꺼짐'}`);
}
await a.shot('tug', 'tug');
const tgDone = await untilPhase(a, 'result', 20);
await wait(600);
const tgText = (await a.dialogText()) ?? '';
const winner = helper.state.mini.winner;
const winText = winner === 'science' ? /수과학반이 이겼습니다/ : winner === 'aisw' ? /AI\.SW반이 이겼습니다/ : /비겼습니다/;
check('줄다리기 결과: 이긴 반이 서버와 같고, 이긴 반 학생(A·B 중)에게 하트',
  tgDone && winText.test(tgText) && server('삼디가')?.miniHeart === (winner === 'science') && server('삼디나')?.miniHeart === (winner === 'aisw') && (await miniOf(a)).heart === (winner === 'science'),
  `${winner || '비김'} | ${fmt(tgText)}`);
await a.shot('tug-result', 'tug-result');
await closeMini();

stopBots();
await Promise.allSettled([...live.map((bot) => bot.room.leave()), helper.leave()]);
check('화면 오류 없음', chrome.consoleErrors.length === 0, chrome.consoleErrors.slice(0, 3).join(' | '));
chrome.close();

const text = results.join('\n');
console.log(text);
console.log(`캡처: ${outDir}`);
console.log(`기준 캡처: ${evidence.join(', ')}`);
writeFileSync(`${outDir}/result.txt`, `${text}\n기준 캡처:\n${evidence.join('\n')}\n`);
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
