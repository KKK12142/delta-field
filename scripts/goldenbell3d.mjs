// 3D 골든벨 확인(design/gdd/goldenbell-3d.md Acceptance Criteria 1~7).
// 선생님 1명(3D, 주소에 view 없음 = 기본 화면), 학생 A(3D), 학생 B(2D, ?view=2d), 봇(Node)으로 확인용 골든벨(scripts/playtest-goldenbell/quick.yaml) 한 판을 한다.
// - 선생님은 3D 학교 맵에서 전체 공지·강당으로 모으기를 하고, 3D 경기장 전체 보기에서 선생님 창으로 문제를 넘기고 끝낸다.
// - A(3D)와 B(2D)는 문제마다 같은 답을 고른다(OX·객관식은 구역에 서고, 단답형은 칸에 써서 낸다). 서버 채점(목숨·점수·탈락·부활)이 같은지 본다.
// - A 화면: 문제 중 다른 학생이 gbFadeMs 안에 사라지고 정답 공개 때 다시 보이는지, 정답 구역이 빛나는지, 맞히면 jump하는지, 머리 위 목숨이 서버와 맞는지.
// - 모든 문제를 마친 결과 화면에서(35명이 모두 경기장에 서 있음) A(3D)와 B(2D)의 fps를 잰다(헤드리스, 참고값).
// 캡처는 .run/goldenbell3d/에 남기고, 기준 확인용 캡처는 production/qa/evidence/에 복사한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell로 켠다.
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest:gb3d [화면 주소] [게임 서버 주소] [학생 수]
//   기본값: http://localhost:5173/  http://localhost:2567  35
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Bot, runBots } from './lib/bots.mjs';
import { launchChrome, wait } from './lib/chrome.mjs';

const [baseUrl = 'http://localhost:5173/', gameUrl = 'http://localhost:2567', countArg = '35'] = process.argv.slice(2);
const students = Number(countArg);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
const outDir = '.run/goldenbell3d';
const evidenceDir = 'production/qa/evidence';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const measure = (name, detail) => results.push(`측정  ${name}: ${detail}`);
const withQuery = (q) => {
  const u = new URL(baseUrl);
  for (const [k, v] of new URLSearchParams(q)) u.searchParams.set(k, v);
  return u.href;
};
/** 첫 화면에 들어간다. 개발 서버가 처음 three·phaser를 읽으면 화면을 한 번 새로 고쳐 입력이 지워질 수 있어 다시 해 본다. */
const enter = async (page, entry) => {
  await page.enter(entry);
  for (let i = 0; i < 3 && (await page.js(`typeof window.__df`)) !== 'object'; i++) {
    await wait(3000);
    if ((await page.js(`typeof window.__df`)) === 'object') break;
    await page.enter(entry);
  }
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
/** 캡처를 남기고, name이 있으면 production/qa/evidence/에도 복사한다. */
const shot = async (page, label, name = null) => {
  const file = await page.shot(label);
  if (name && file) {
    const to = `${evidenceDir}/goldenbell-3d-${name}-${today}.png`;
    copyFileSync(file, to);
    evidence.push(to);
  }
};
/** 서버 목숨으로 머리 위에 보여야 할 글(src/game/goldenbell.ts livesTag와 같은 규칙) */
const livesOf = (p) => (p.gbOut ? '💀'.repeat(Math.max(0, 2 - p.gbRevive)) : '♥'.repeat(p.gbLives) + '♡'.repeat(Math.max(0, 3 - p.gbLives)));

const chrome = await launchChrome(outDir);
// page.shot이 저장한 파일 경로를 돌려주게 감싼다.
const open = async (name, url, opts) => {
  const page = await chrome.openPage(name, url, opts);
  let n = 0;
  const raw = page.shot;
  page.shot = async (label) => {
    await raw(label);
    n++;
    return `${outDir}/${name}-${String(n).padStart(2, '0')}-${label}.png`;
  };
  return page;
};

// ---- 선생님(3D 기본 화면): 방 만들기, 학교 맵 단추 ----
const teacher = await open('teacher', baseUrl);
await enter(teacher, { teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님: 주소에 view 없이 3D 화면으로 방을 만듦', /^\d{4}$/.test(code ?? '') && (await teacher.js(`__df.view()`)) === '3d', code);
const shownButtons = await teacher.js(`[...document.querySelectorAll('.df-hud button')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.textContent)`);
check('선생님 3D 학교 맵: 강당으로 모으기·전체 공지 단추가 보이고 CCTV·미니게임은 감춤',
  shownButtons.includes('강당으로 모으기') && shownButtons.includes('전체 공지') && !shownButtons.includes('CCTV 보기') && !shownButtons.includes('미니게임 시작'), shownButtons.join(', '));

// ---- 학생 A(3D), B(2D) ----
const a = await open('a3d', baseUrl);
await enter(a, { nickname: '삼디', code, character: 'char-01' });
const b = await open('b2d', withQuery('view=2d'));
await enter(b, { nickname: '이디', code, character: 'char-02' });
await wait(1500);
await closeDialogs(a);
await closeDialogs(b);
check('학생 A: 3D, 학생 B: 2D(?view=2d)', (await a.js(`__df.view()`)) === '3d' && (await b.js(`typeof __df.view === 'function' ? __df.view() : '2d'`)) !== '3d');

// 봇: 학생 수를 채운다(A·B 빼고).
const bots = Array.from({ length: Math.max(0, students - 2) }, (_, i) => new Bot(i, gameUrl));
const joined = await Promise.allSettled(bots.map((bot) => bot.join(code)));
const live = bots.filter((bot) => bot.room);
check(`봇 ${bots.length}명이 들어옴`, joined.every((r) => r.status === 'fulfilled'), joined.filter((r) => r.status === 'rejected').map((r) => r.reason?.message ?? r.reason).join(', '));
const stopBots = runBots(live);

// ---- 선생님 전체 공지(3D) ----
await clickText(teacher, '.df-hud button', '전체 공지');
await wait(400);
const SHOUT = '3D 골든벨을 시작합니다';
await teacher.js(`(() => { const i = document.querySelector('.df-dialog .df-input'); i.value = ${JSON.stringify(SHOUT)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await clickText(teacher, '.df-dialog .df-button', '보내기');
await wait(700);
const shoutOf = (pg) => pg.js(`document.querySelector('.df-announce:not([hidden]) .df-banner-text')?.textContent ?? null`);
check('선생님 3D: 전체 공지를 보내면 학생 A(3D)·B(2D) 화면에 뜸', (await shoutOf(a)) === SHOUT && (await shoutOf(b)) === SHOUT);
await shot(a, 'announce');
for (const pg of [a, b, teacher]) await pg.js(`document.querySelector('.df-announce:not([hidden])')?.click()`);

// ---- 강당으로 모으기(3D 선생님) ----
await clickText(teacher, '.df-hud button', '강당으로 모으기');
await wait(1000);
await clickText(teacher, '.df-dialog .df-choice', '확인용 골든벨');
await wait(400);
await clickText(teacher, '.df-dialog .df-choice', '지금 바로 옮기기');
const allIn = await until(async () => (await a.js(`__df.map()`)) === 'goldenbell' && (await b.js(`__df.map()`)) === 'goldenbell' && (await teacher.js(`__df.map()`)) === 'goldenbell', 8000);
check('강당으로 모으기(3D 선생님): 선생님·학생 A(3D)·B(2D)가 골든벨 맵', allIn);
await wait(1500);
const inBell = await teacher.js(`__df.others().filter((o) => o.role === 'student' && o.map === 'goldenbell').length`);
check(`골든벨 맵에 학생 ${students}명`, inBell === students, `${inBell}명`);
const cam = await teacher.js(`__df.camera()`);
const panelLeft = await teacher.js(`document.querySelector('.df-gb-panel').getBoundingClientRect().left`);
const cardBottom = await teacher.js(`document.querySelector('.df-gb-card').getBoundingClientRect().bottom`);
check('선생님 카메라: 경기장 전체 보기, 네 귀퉁이가 문제 카드 아래·선생님 창 왼쪽에 들어감',
  cam.overview && cam.corners.every((c) => c.x >= -2 && c.x <= panelLeft + 2 && c.y >= cardBottom - 2 && c.y <= 802),
  `귀퉁이 ${cam.corners.map((c) => `(${c.x},${c.y})`).join(' ')}, 창 왼쪽 ${Math.round(panelLeft)}, 카드 아래 ${Math.round(cardBottom)}`);
const aCam = await a.js(`__df.camera()`);
check('학생 A 카메라: 나를 따라감(전체 보기 아님)', aCam.overview === false);
await shot(teacher, 'arena-ready', 'teacher-ready');
await shot(a, 'arena-ready', 'student-ready');
const readyZones = await a.js(`__df.zones()`);
check('대기: 객관식 4구역이 흐린 판(이름 그림 없음)', Object.keys(readyZones).length === 4 && Object.values(readyZones).every((z) => z.opacity < 0.2 && !z.label), JSON.stringify(readyZones));

// ---- 문제마다: A(3D)와 B(2D)가 같은 답 ----
// quick.yaml: 1 ox O, 2 choice 3(가·나·다·라), 3 ox X, 4 ox O, 5 choice 2(가·나·다), 6 ox X, 7 ox O, 8 short 10 m/s, 9 short '가, 나', 10 ox O, 11 short 넌센스 관성, 12 ox 넌센스 X
// 고르는 답: 1 맞힘, 2·3·4 틀림(목숨 0 → 탈락), 5·6 맞힘(부활), 7·8·9 맞힘, 10 틀림(다시 탈락), 11 맞힘(부활에 셈), 12 맞힘
// 운동장 맵(44×28, design/quick-specs/goldenbell-playground.md). O·X는 구역 이름 그림(pad-O·pad-X 가운데) 위에 선다(글자가 캐릭터 아래에 보이는지 캡처).
const ZONE_AT = { O: [11, 14], X: [33, 14], 1: [11, 10.5], 2: [33, 10.5], 3: [11, 21.5], 4: [33, 21.5] };
const PLAN = ['O', '1', 'O', 'X', '2', 'X', 'O', 'text:10 m/s', 'text:가, 나', 'X', 'text:관성', 'X'];
const next = () => teacher.js(`document.querySelector('.df-gb-panel .df-gb-next')?.click()`);
const phaseOf = (pg) => pg.js(`__df.gb().phase`);
const answer = async (pg, plan) => {
  if (plan.startsWith('text:')) {
    const text = plan.slice(5);
    await pg.js(`(() => { const i = document.querySelector('.df-gb-answer-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.df-gb-answer-form').requestSubmit(); })()`);
  } else {
    const [col, row] = ZONE_AT[plan];
    await pg.js(`__df.teleport(${col}, ${row})`);
  }
};
const total = await teacher.js(`__df.gb().total`);
check('확인용 골든벨 12문제', total === PLAN.length, String(total));
const same = [];
const types = new Set();
let fadeOk = 0;
let fadeChecked = 0;
let backOk = 0;
let glowOk = 0;
let glowChecked = 0;
let jumpOk = 0;
let jumpChecked = 0;
let livesOk = 0;
const fadeDetail = [];
/**
 * A 화면 안에서 시간을 잰다(헤드리스 화면이 느려 Node에서 물으면 늦다): 문제 i가 시작된 프레임부터 1초, 2초 뒤 새 프레임에서 다른 사람의 투명도를 보고,
 * 정답 공개가 되면 0.2초 뒤 모습·구역·내 상태를 본다.
 */
const sampler = (i) => `new Promise((done) => {
  const out = { fading: false, goneAt: null, mid: null };
  const t0 = performance.now();
  const poll = () => {
    const g = __df.gb();
    const now = performance.now();
    if (!out.start && g.phase === 'question' && g.index === ${i}) {
      out.start = now;
      out.type = g.type;
      setTimeout(() => { window.__fadeStage = 'mid'; }, 1000);
      setTimeout(() => { window.__fadeStage = 'late'; }, 2100);
    }
    // 문제를 푸는 동안 프레임마다: 다른 사람이 흐려지는 중(0과 1 사이)인 프레임이 있었는지, 모두 0이 된 첫 프레임은 언제인지
    if (out.start && g.phase === 'question') {
      const a = Object.values(__df.looks().others).map((o) => o.alpha);
      if (a.length && a.some((x) => x > 0 && x < 1)) { out.fading = true; out.mid ??= a.slice(0, 3); }
      if (a.length && a.every((x) => x === 0) && out.goneAt === null) out.goneAt = now - out.start;
    }
    if (out.start && g.phase === 'reveal' && !out.revealAt) {
      out.revealAt = now - out.start;
      setTimeout(() => { out.looks = __df.looks(); out.zones = __df.zones(); out.gb = __df.gb(); out.mine = __df.mine(); done(out); }, 200);
      return;
    }
    if (now - t0 > 25000) return done(out);
    requestAnimationFrame(poll);
  };
  poll();
})`;
const alphasOf = (l) => Object.values(l?.others ?? {}).map((o) => o.alpha);
for (let i = 0; i < PLAN.length; i++) {
  const watching = a.js(sampler(i));
  await next();
  await until(async () => (await phaseOf(a)) === 'question', 5000, 50);
  await answer(a, PLAN[i]);
  await answer(b, PLAN[i]);
  if (i === 1) {
    // 마감: 남은 시간이 3초 이하라 테두리가 닫혀 들어온다.
    const z = await a.js(`__df.zones()`);
    check('마감: 남은 시간 3초 이하면 이번 구역 테두리가 보임', Object.values(z).some((v) => v.frame), JSON.stringify(z));
    await shot(a, 'closing', 'closing');
  }
  if (i === 4) {
    // 탈락한 A(4번에서 목숨 0): 내 머리 위 해골, 나는 반투명. 가까이 찍는다.
    await a.js(`__df.zoom(4)`);
    await wait(200);
    await shot(a, 'out-skull', 'skull');
    await a.js(`__df.zoom(null)`);
  }
  const r = await watching;
  const gb = r.gb ?? {};
  const mine = r.mine ?? {};
  types.add(r.type);
  fadeChecked++;
  // 흐려지는 중인 프레임이 있었고, gbFadeMs(2초)에 프레임 한 번(느린 화면, 0.6초까지) 안에 모두 사라짐
  if (r.fading && r.goneAt !== null && r.goneAt <= 2600) fadeOk++;
  else fadeDetail.push(`${i + 1}번 흐려지는 중 ${r.fading} ${r.mid?.map((x) => x.toFixed(2))}, 모두 사라진 때 ${r.goneAt === null ? '없음' : Math.round(r.goneAt) + 'ms'}, 공개 ${Math.round(r.revealAt)}ms`);
  // 정답 공개: 다른 사람이 다시 보임(탈락은 반투명)
  const back = alphasOf(r.looks);
  if (back.length && back.every((x) => x > 0.3)) backOk++;
  // 정답 구역 빛남(OX·객관식): 정답 구역 투명도가 가장 높고 다른 구역은 어두움
  if (r.type !== 'short') {
    glowChecked++;
    const key = `${r.type}:${gb.answer}`;
    const zones = r.zones ?? {};
    const others = Object.entries(zones).filter(([k]) => k !== key).map(([, v]) => v.opacity);
    if (zones[key] && zones[key].opacity >= 0.6 && others.every((x) => x < 0.15)) glowOk++;
  }
  // 맞힌 학생은 jump, 틀리면 그대로(jump 아님)
  if (['correct', 'revived', 'heart'].includes(mine.gbResult)) {
    jumpChecked++;
    if (r.looks?.me.action === 'jump') jumpOk++;
    else fadeDetail.push(`${i + 1}번 맞혔는데 ${r.looks?.me.action}`);
  } else if (r.looks?.me.action === 'jump') fadeDetail.push(`${i + 1}번 틀렸는데 jump`);
  if (i === 0) {
    // 레이어: O 글자 그림 위에 선 내 캐릭터가 글자에 가리지 않음(가까이)
    await a.js(`__df.zoom(5)`);
    await wait(250);
    await shot(a, 'layer-on-label', 'layer-on-label');
    await a.js(`__df.zoom(null)`);
    await shot(a, 'reveal-correct', 'reveal-jump');
    await shot(teacher, 'reveal-teacher', 'reveal-teacher');
  }
  if (i === 1) await shot(a, 'reveal-wrong', 'reveal-wrong');
  await wait(400);
  // 서버 채점이 A(3D)와 B(2D)에 같은지(선생님 화면이 받은 상태로 본다)
  const list = await teacher.js(`__df.others()`);
  const pa = list.find((o) => o.nickname === '삼디');
  const pb = list.find((o) => o.nickname === '이디');
  const fields = ['gbLives', 'gbScore', 'gbOut', 'gbRevive', 'gbResult'];
  const eq = pa && pb && fields.every((f) => pa[f] === pb[f]);
  same.push(`${i + 1}${(r.type ?? '?')[0]}:${eq ? '같음' : '다름'}(목숨 ${pa?.gbLives}/${pb?.gbLives} 점수 ${pa?.gbScore}/${pb?.gbScore} 탈락 ${pa?.gbOut}/${pb?.gbOut} ${pa?.gbResult}/${pb?.gbResult})`);
  // 머리 위 목숨: A 화면의 내 목숨 줄, A 화면에 보이는 B의 목숨 줄이 서버와 같은지
  const lk = await a.js(`__df.looks()`);
  const meTag = lk.me.tag;
  const bTag = lk.others['이디']?.tag;
  if (meTag === livesOf(pa) && bTag === livesOf(pb)) livesOk++;
  else fadeDetail.push(`${i + 1}번 목숨 ${meTag}/${livesOf(pa)} ${bTag}/${livesOf(pb)}`);
}
check('AC1: 3D 학생이 OX·객관식·단답형을 모두 풂', ['ox', 'choice', 'short'].every((t) => types.has(t)), [...types].join(', '));
check('AC2: 서버 채점(목숨·점수·탈락·부활·결과)이 3D 학생과 2D 학생에 같음', same.every((s) => s.includes('같음')), same.join(' | '));
check('AC3: 정답 공개 때 정답 구역이 빛나고 나머지는 어두움', glowChecked > 0 && glowOk === glowChecked, `${glowOk}/${glowChecked}`);
check('AC3: 맞힌 3D 학생 캐릭터가 jump', jumpChecked > 0 && jumpOk === jumpChecked, `${jumpOk}/${jumpChecked}`);
check('AC4: 문제 중 다른 학생이 흐려지다 gbFadeMs(2초) 뒤 첫 프레임까지 모두 사라짐', fadeOk === fadeChecked, `${fadeOk}/${fadeChecked}`);
if (fadeDetail.length) measure('자세히', fadeDetail.join(' | '));
check('AC4: 정답 공개 때 다른 학생이 다시 보임', backOk === PLAN.length, `${backOk}/${PLAN.length}`);
check('AC5: 머리 위 하트·해골이 서버 목숨과 같음(내 것, 2D 학생 것)', livesOk === PLAN.length, `${livesOk}/${PLAN.length}`);

// ---- 결과(모든 문제 끝): 1~3등 jump, fps ----
await next();
await until(async () => (await phaseOf(a)) === 'end', 5000);
await wait(400);
const endLooks = await a.js(`__df.looks()`);
const topJump = Object.values(endLooks.others).filter((o) => o.action === 'jump').length;
check('결과: 1~3등 캐릭터가 jump', topJump > 0, `jump ${topJump}명`);
await shot(a, 'end', 'end');
await shot(teacher, 'end-teacher', 'end-teacher');

const SIZES = [
  { name: '휴대폰', width: 390, height: 844, dpr: 3 },
  { name: '태블릿', width: 1180, height: 820, dpr: 2 },
];
const onScreen = await a.js(`__df.three().onScreen`);
for (const [page, label] of [[a, '3D'], [b, '2D']]) {
  for (const size of SIZES) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.dpr, mobile: true });
    await wait(1500);
    for (const rate of [1, 4]) {
      await page.send('Emulation.setCPUThrottlingRate', { rate });
      await wait(1200);
      const fps = await page.fps(4000);
      const extra = label === '3D' ? await a.js(`(() => { const t = __df.three(); return \` (그리기 \${t.calls}번, 화면 안 \${t.onScreen}명, 계산 평균 \${t.frameMs.avg.toFixed(1)}ms)\`; })()`) : '';
      measure(`골든벨 결과(${students}명 경기장) ${label} ${size.name} ${size.width}×${size.height} CPU ${rate === 1 ? '보통' : `${rate}배 느리게`}`, `${fps.toFixed(1)}fps${extra}`);
    }
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    if (label === '3D') await shot(page, `end-${size.width}x${size.height}`, size.width < 600 ? 'phone' : null);
  }
  await page.send('Emulation.clearDeviceMetricsOverride');
}
measure('결과 화면 3D 학생 화면 안 사람 수(1280×800)', String(onScreen));

// ---- 골든벨 끝내기 → 학교 맵 ----
const endGame = async () => {
  await teacher.js(`[...document.querySelectorAll('.df-gb-panel button')].find((x) => x.textContent === '골든벨 끝내기')?.click()`);
  await wait(400);
  await clickText(teacher, '.df-dialog .df-button', '끝내기');
  return until(async () => (await a.js(`__df.map()`)) === 'school' && (await teacher.js(`__df.map()`)) === 'school' && (await b.js(`__df.map()`)) === 'school', 6000);
};
check('골든벨 끝내기(3D 선생님): 모두 학교 맵으로', await endGame());
await wait(800);
check('학교 맵으로 돌아오면 머리 위 목숨을 감추고 3D 학교 안내로 돌아옴',
  (await a.js(`__df.looks().me.tag`)) === null && (await a.js(`!!document.querySelector('.df-hud-place')`)) === true);

// ---- 2판(제한 시간 60초): 흐려짐 캡처, 선생님 마감 단추 ----
await clickText(teacher, '.df-hud button', '강당으로 모으기');
await wait(1000);
await clickText(teacher, '.df-dialog .df-choice', '확인용 2판');
await wait(400);
await clickText(teacher, '.df-dialog .df-choice', '지금 바로 옮기기');
check('2판: 다시 강당으로 모음', await until(async () => (await a.js(`__df.map()`)) === 'goldenbell', 8000));
await wait(1500);
await a.js(`window.__fadeStage = ''`);
const second = a.js(sampler(0));
await next();
await until(async () => (await a.js(`window.__fadeStage`)) === 'mid', 8000, 50);
await shot(a, 'fade-mid', 'fade-1s');
await until(async () => (await a.js(`window.__fadeStage`)) === 'late', 8000, 50);
await wait(300);
const gone = alphasOf(await a.js(`__df.looks()`));
check('2판: 문제 3초쯤 다른 학생이 모두 사라짐(캡처)', gone.length > 0 && gone.every((x) => x === 0), gone.slice(0, 5).map((x) => x.toFixed(2)).join(','));
await shot(a, 'fade-gone', 'fade-gone');
await teacher.js(`document.querySelector('.df-gb-panel .df-gb-close')?.click()`);
const r2 = await second;
check('2판: 선생님 마감 단추로 바로 정답 공개, 다른 학생이 다시 보임', !!r2.revealAt && alphasOf(r2.looks).every((x) => x > 0.3), `${Math.round(r2.revealAt ?? -1)}ms`);
check('2판 끝내기', await endGame());

stopBots();
await Promise.allSettled(live.map((bot) => bot.room.leave()));
check('화면 오류 없음', chrome.consoleErrors.length === 0, chrome.consoleErrors.slice(0, 3).join(' | '));
chrome.close();

const text = results.join('\n');
console.log(text);
console.log(`캡처: ${outDir}`);
console.log(`기준 캡처: ${evidence.join(', ')}`);
writeFileSync(`${outDir}/result.txt`, `${text}\n기준 캡처:\n${evidence.join('\n')}\n`);
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
