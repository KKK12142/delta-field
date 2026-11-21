// 이모트·효과음·바로 문제 내기 확인(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md의 Acceptance Criteria).
// 선생님 1명(3D), 학생 A·B(3D), 학생 C(2D, ?view=2d), 봇 몇 명으로 한다.
// - 이모트: A가 키 2(꾸벅)를 누르면 B·선생님 화면의 A 머리 위에 말풍선, 재사용 대기 안의 두 번째는 막힘, 1.5초 뒤 사라짐, 휴대폰 접기.
// - 효과음: 소리 단추 끄기·켜기(localStorage), 이모트·문제 시작·째깍·맞음·틀림·팡파르를 울리려 했는지(헤드리스라 실제 소리는 듣지 않는다).
// - 바로 내기: 강당으로 모으기 → 바로 내기 창에서 틀린 붙여넣기(줄 번호 오류) → 맞는 붙여넣기·한 문제 쓰기 → 골든벨 → 채점,
//   정답 공개 뒤 즉석 문제, 문제 중 학생 이모트가 다른 학생에게 가지 않음, 학생은 문제를 보낼 수 없음.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 한다.
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest:fx3d [화면 주소] [게임 서버 주소]
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Bot, runBots } from './lib/bots.mjs';
import { launchChrome, wait } from './lib/chrome.mjs';

const [baseUrl = 'http://localhost:5173/', gameUrl = 'http://localhost:2567'] = process.argv.slice(2);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
const outDir = '.run/feature3d';
const evidenceDir = 'production/qa/evidence';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const note = (name, detail) => results.push(`참고  ${name}: ${detail}`);
const withQuery = (q) => {
  const u = new URL(baseUrl);
  for (const [k, v] of new URLSearchParams(q)) u.searchParams.set(k, v);
  return u.href;
};
const until = async (fn, ms = 10000, step = 150) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await wait(step);
  }
  return false;
};
const chrome = await launchChrome(outDir);
const evidence = [];
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
/** 캡처를 남기고 production/qa/evidence/<name>-<날짜>.png로도 복사한다. */
const shot = async (page, name) => {
  const file = await page.shot(name);
  const to = `${evidenceDir}/${name}-${today}.png`;
  copyFileSync(file, to);
  evidence.push(to);
};
const enter = async (page, entry) => {
  await page.enter(entry);
  for (let i = 0; i < 3 && (await page.js(`typeof window.__df`)) !== 'object'; i++) {
    await wait(3000);
    if ((await page.js(`typeof window.__df`)) === 'object') break;
    await page.enter(entry);
  }
};
const clickText = (page, selector, text) =>
  page.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent.includes(${JSON.stringify(text)}) && !x.hidden && !x.disabled); b?.click(); return !!b; })()`);
const closeDialogs = async (page) => {
  for (let i = 0; i < 5 && (await page.dialogText()) !== null; i++) {
    await page.js(`document.querySelector('.df-dialog .df-button')?.click()`);
    await wait(300);
  }
};
/** 그 화면에서 보이는 말풍선: 닉네임 → 이모트 id */
const bubbles = (page) => page.js(`Object.fromEntries(__df.emotes().filter((e) => e.visible).map((e) => [e.nickname, e.emote]))`);
/** 그 화면 안에서 매 프레임 보다가 nick의 말풍선(id)이 보이면 true(ms 안에 보이지 않으면 false). CDP로 묻는 늦음에 흔들리지 않게 화면 안에서 잰다. */
const seenIn = (page, nick, id, ms = 6000) =>
  page.js(`new Promise((done) => {
    const t0 = performance.now();
    const poll = () => {
      if (__df.emotes().some((e) => e.visible && e.nickname === ${JSON.stringify(nick)} && e.emote === ${JSON.stringify(id)})) return done(true);
      if (performance.now() - t0 > ${ms}) return done(false);
      requestAnimationFrame(poll);
    };
    poll();
  })`);
const received = async (page, id) => (await page.js(`__df.emoteLog()`)).filter((e) => e.id === id);
const setValue = (page, selector, value) =>
  page.js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false; i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

// ---- 들어가기 ----
const teacher = await open('teacher', baseUrl);
await enter(teacher, { teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님 3D로 방을 만듦', /^\d{4}$/.test(code ?? ''), code);
const a = await open('a3d', baseUrl);
await enter(a, { nickname: '삼디', code, character: 'char-01' });
const b = await open('b3d', baseUrl);
await enter(b, { nickname: '비디', code, character: 'char-03' });
const c = await open('c2d', withQuery('view=2d'));
await enter(c, { nickname: '이디', code, character: 'char-02' });
await wait(1500);
for (const pg of [a, b, c]) await closeDialogs(pg);
const bots = Array.from({ length: 3 }, (_, i) => new Bot(i, gameUrl));
await Promise.allSettled(bots.map((bot) => bot.join(code)));
const live = bots.filter((bot) => bot.room);
const stopBots = runBots(live);

// ---- 이모트 단추 줄 ----
const bar = await a.js(`(() => { const bar = document.querySelector('.df-fx-bar'); return bar ? { emotes: bar.querySelectorAll('.df-fx-emote').length, sound: bar.querySelector('.df-fx-sound')?.textContent, fold: !bar.querySelector('.df-fx-fold').hidden } : null; })()`);
check('학생 3D: 아래 왼쪽에 소리 단추와 이모트 8개(PC는 접지 않음)', bar?.emotes === 8 && bar.sound === '소리 켬' && bar.fold === false, JSON.stringify(bar));
check('2D(?view=2d)에는 이모트 줄이 없음', (await c.js(`document.querySelector('.df-fx-bar') === null`)) === true);

// ---- 공지 소리 ----
await clickText(teacher, '.df-hud button', '전체 공지');
await wait(400);
await setValue(teacher, '.df-dialog .df-input', '이모트 확인');
await clickText(teacher, '.df-dialog .df-button', '보내기');
await wait(700);
check('전체 공지가 오면 공지 소리를 울리려 함', (await a.js(`__df.sounds().requested`)).includes('notice'));
for (const pg of [a, b, teacher]) await pg.js(`document.querySelector('.df-announce:not([hidden])')?.click()`);

// A를 B 옆에 세우고 B 화면을 가까이 본다.
const bPos = await b.js(`__df.pos()`);
await a.js(`__df.teleport(${bPos.col + 1.2}, ${bPos.row})`);
await wait(800);

// ---- 이모트 보내기: 키 2(꾸벅) ----
await b.js(`__df.zoom(5)`);
const bSees = seenIn(b, '삼디', 'bow');
const tSees = seenIn(teacher, '삼디', 'bow');
// 키 2(꾸벅)를 누르고, 화면 안에서 곧바로(재사용 대기 1.5초 안) 키 3(박수)을 한 번 더 누른다.
// (CDP로 누르면 바쁜 컴퓨터에서 두 누름 사이가 1.5초를 넘을 수 있어, 화면 안에서 같은 순간에 두 키를 보낸다. 실제 키 누름은 아래 골든벨에서 키 5로 본다.)
await a.js(`(() => { for (const n of [2, 3]) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit' + n, key: String(n) })); })()`);
const seen = (await bSees) && (await tSees);
check('A가 키 2(꾸벅)를 누르면 B·선생님 화면의 A 머리 위에 말풍선', seen, JSON.stringify(await b.js(`__df.emoteLog()`)));
await wait(1000);
check('재사용 대기(1.5초) 안에 누른 3(박수)은 보내지 않음(서버의 대기·1분 상한은 pnpm test:unit)', (await received(b, 'clap')).length === 0, JSON.stringify(await received(b, 'clap')));
check('말풍선은 1.5초 뒤 사라짐', await until(async () => (await bubbles(b))['삼디'] === undefined, 3000, 100), JSON.stringify(await bubbles(b)));
await wait(600);
// 캡처: 바쁜 컴퓨터에서는 캡처가 1.5초보다 늦을 수 있어 B 화면의 말풍선을 잠깐 붙잡아 둔다.
await b.js(`__df.emoteHold(8000)`);
const heartSeen = seenIn(b, '삼디', 'heart');
await a.js(`[...document.querySelectorAll('.df-fx-emote')][6].click()`);
check('단추(하트)를 눌러도 보냄', await heartSeen);
await shot(b, 'emote-heart');
await wait(1600);
await a.js(`__df.emote('dance')`);
await wait(1200);
await shot(b, 'emote-dance');
await b.js(`__df.emoteHold(0)`);
await shot(a, 'emote-bar');
await b.js(`__df.zoom(null)`);
const aSounds = await a.js(`__df.sounds()`);
check('이모트가 뜰 때 톡(pop) 소리를 울리려 함', aSounds.requested.includes('pop'), aSounds.requested.join(','));
note('효과음 오디오 시작(첫 키 입력 뒤)', `A started=${aSounds.started}, 실제 울린 것 ${aSounds.played.join(',') || '없음'}`);

// ---- 소리 켜기/끄기 ----
await a.js(`document.querySelector('.df-fx-sound').click()`);
const off = await a.js(`({ text: document.querySelector('.df-fx-sound').textContent, stored: localStorage.getItem('df-sound'), enabled: __df.sounds().enabled })`);
check('소리 끄기: 단추 글·localStorage(df-sound=off)·꺼짐', off.text === '소리 끔' && off.stored === 'off' && off.enabled === false, JSON.stringify(off));
await shot(a, 'sound-off');
await a.js(`document.querySelector('.df-fx-sound').click()`);
check('소리 다시 켜기', (await a.js(`localStorage.getItem('df-sound')`)) === 'on');

// ---- 휴대폰: 이모트 접기 ----
await b.resize({ width: 844, height: 390 });
const folded = await b.js(`({ fold: !document.querySelector('.df-fx-fold').hidden, list: !document.querySelector('.df-fx-emotes').hidden })`);
await shot(b, 'emote-phone-folded');
await b.js(`document.querySelector('.df-fx-fold').click()`);
await wait(200);
const unfolded = await b.js(`!document.querySelector('.df-fx-emotes').hidden`);
await shot(b, 'emote-phone-open');
check('휴대폰: 이모트는 접혀 있고 "이모트" 단추로 폄', folded.fold && !folded.list && unfolded, JSON.stringify({ folded, unfolded }));
await b.resize(null);

// ---- 바로 내기 ----
await clickText(teacher, '.df-hud button', '강당으로 모으기');
await wait(800);
const firstChoice = await teacher.js(`document.querySelector('.df-dialog .df-choice')?.textContent ?? ''`);
check('강당으로 모으기: 맨 위에 "바로 내기"', firstChoice.includes('바로 내기'), firstChoice);
await clickText(teacher, '.df-dialog .df-choice', '바로 내기');
await wait(500);
check('바로 내기 창이 뜸', (await teacher.js(`!!document.querySelector('.df-fx-quick')`)) === true);
const BAD = ['맞는 줄 | O', '정답 칸 없음', '보기 | 가 / 나 | 5'].join('\n');
await setValue(teacher, '.df-fx-quick .df-fx-paste', BAD);
await clickText(teacher, '.df-fx-quick .df-fx-section:nth-of-type(2) .df-button', '목록에 더하기');
await wait(200);
const badErrors = await teacher.js(`[...document.querySelectorAll('.df-fx-quick .df-fx-errors li')].map((l) => l.textContent)`);
const listAfterBad = await teacher.js(`document.querySelectorAll('.df-fx-quick .df-fx-list li').length`);
check('틀린 붙여넣기: 줄 번호와 까닭을 보이고 하나도 더하지 않음',
  badErrors.some((e) => e.startsWith('2번째 줄')) && badErrors.some((e) => e.startsWith('3번째 줄')) && listAfterBad === 0, badErrors.join(' / '));
await shot(teacher, 'quick-paste-error');
const GOOD = ['물체는 힘을 받지 않으면 운동 상태를 유지한다 | O | 관성 법칙 | 15초', '힘의 단위는? | J / N / W / Pa | 2 | 뉴턴 | 12초', '운동 상태를 유지하려는 성질은? | =관성 | 12초'].join('\n');
await setValue(teacher, '.df-fx-quick .df-fx-paste', GOOD);
await clickText(teacher, '.df-fx-quick .df-fx-section:nth-of-type(2) .df-button', '목록에 더하기');
await wait(200);
// 한 문제 쓰기: OX, X, 제한 시간 5초
await setValue(teacher, '.df-fx-quick .df-fx-section textarea.df-input', '지구는 평평하다');
await teacher.js(`[...document.querySelectorAll('.df-fx-quick .df-fx-types .df-button')].find((x) => x.textContent === 'X').click()`);
await setValue(teacher, '.df-fx-quick input[type=number]', '12');
await clickText(teacher, '.df-fx-quick .df-fx-section:nth-of-type(1) .df-button', '목록에 더하기');
await wait(200);
const listed = await teacher.js(`[...document.querySelectorAll('.df-fx-quick .df-fx-list li')].map((l) => l.textContent)`);
check('맞는 붙여넣기 3문제 + 한 문제 쓰기 = 목록 4문제', listed.length >= 4 && listed[3].includes('지구는 평평하다'), listed.length + '문제');
await setValue(teacher, '.df-fx-quick input[placeholder="바로 낸 문제"]', '확인용 바로 내기');
await shot(teacher, 'quick-editor');
await clickText(teacher, '.df-fx-quick .df-button', '이 문제로 골든벨');
await wait(800);
const saved = await teacher.js(`JSON.parse(localStorage.getItem('df-quick-sets') ?? '[]').map((s) => s.title + ':' + s.questions.length)`);
check('보내면 "내 문제"(localStorage)에 남음', saved.includes('확인용 바로 내기:4'), saved.join(','));
await clickText(teacher, '.df-dialog .df-choice', '지금 바로 옮기기');
const allIn = await until(async () => (await a.js(`__df.map()`)) === 'goldenbell' && (await b.js(`__df.map()`)) === 'goldenbell' && (await teacher.js(`__df.map()`)) === 'goldenbell', 8000);
await wait(500);
const g0 = { total: await teacher.js(`__df.gb().total`), title: await teacher.js(`document.querySelector('.df-gb-panel')?.textContent ?? ''`) };
check('바로 낸 문제로 골든벨 시작(4문제, 제목)', allIn && g0.total === 4 && g0.title.includes('확인용 바로 내기'), JSON.stringify({ total: g0.total, title: g0.title.slice(0, 40) }));

// 학생은 문제를 보낼 수 없다(봇 연결로 직접 요청).
const studentReply = await live[0].room.request('gbQuickSet', { title: 'x', questions: [{ type: 'ox', question: 'q', answer: 'O', seconds: 5 }] });
const studentAdd = await live[0].room.request('gbQuickAdd', { question: { type: 'ox', question: 'q', answer: 'O', seconds: 5 } });
check('학생은 바로 내기·즉석 문제를 보낼 수 없음', !!studentReply.error && !!studentAdd.error, `${studentReply.error} / ${studentAdd.error}`);

const ZONE_AT = { O: [3, 12], X: [16, 12], 1: [3, 6.5], 2: [16, 6.5], 3: [3, 12.5], 4: [16, 12.5] };
const next = () => teacher.js(`document.querySelector('.df-gb-panel .df-gb-next')?.click()`);
const phase = (pg) => pg.js(`__df.gb().phase`);
const stand = (pg, z) => pg.js(`__df.teleport(${ZONE_AT[z][0]}, ${ZONE_AT[z][1]})`);
const type = (pg, text) =>
  pg.js(`(() => { const i = document.querySelector('.df-gb-answer-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.df-gb-answer-form').requestSubmit(); })()`);
await wait(1500);

// 1번(OX, 정답 O): A는 O, B는 X. 문제 중 A의 이모트는 B에게 가지 않고 선생님은 받는다.
await next();
await until(async () => (await phase(a)) === 'question', 5000, 50);
await stand(a, 'O');
await stand(b, 'X');
await wait(300);
const sentAt = await a.js(`__df.gb()`);
await a.press('8');
await wait(1000);
const tSeen = (await received(teacher, 'laugh')).some((e) => e.phase === 'question');
const aSelf = (await received(a, 'laugh')).length > 0 ? 'laugh' : undefined;
const bSeen = (await bubbles(b))['삼디'];
const bLog = await b.js(`__df.emoteLog()`);
note('B가 받은 이모트(받을 때 단계)', JSON.stringify(bLog.slice(-3)));
check('골든벨 문제 중: A의 이모트가 선생님·A 자신에게만 보이고 B에게는 가지 않음',
  sentAt.phase === 'question' && sentAt.timeLeft >= 2 && tSeen && aSelf === 'laugh' && bSeen === undefined && !bLog.some((e) => e.id === 'laugh'),
  JSON.stringify({ sentAt: sentAt.timeLeft, tSeen, aSelf, bSeen }));
await until(async () => (await phase(a)) === 'reveal' && (await b.js(`__df.gb().phase`)) === 'reveal', 30000, 150);
await wait(500);
const mineA = await a.js(`__df.mine()`);
const mineB = await b.js(`__df.mine()`);
check('1번 채점: A 맞음, B 틀림(목숨 2)', mineA.gbResult === 'correct' && mineB.gbResult === 'wrong' && mineB.gbLives === 2, `${mineA.gbResult}/${mineB.gbResult}/${mineB.gbLives}`);

// 정답 공개 뒤 즉석 문제(단답형): 바로 시작해 total이 5가 된다.
await shot(teacher, 'quick-panel-button');
await clickText(teacher, '.df-gb-panel .df-gb-quick', '즉석 문제');
await wait(400);
await teacher.js(`[...document.querySelectorAll('.df-fx-quick .df-fx-types .df-button')].find((x) => x.textContent === '단답형').click()`);
await setValue(teacher, '.df-fx-quick textarea.df-input', '즉석 문제: 1 N은 몇 kg·m/s²?');
await setValue(teacher, '.df-fx-quick input[placeholder^="정답"]', '1, 하나');
await setValue(teacher, '.df-fx-quick input[type=number]', '15');
await shot(teacher, 'quick-one');
await clickText(teacher, '.df-fx-quick .df-button', '지금 내기');
const startedQuick = await until(async () => (await phase(a)) === 'question' && (await a.js(`__df.gb().index`)) === 1, 4000, 100);
const g1 = { ...(await a.js(`__df.gb()`)), question: (await a.js(`document.querySelector('.df-gb-question')?.textContent ?? ''`)) ?? '' };
check('정답 공개 뒤 즉석 문제: 바로 2번으로 시작, 모두 5문제', startedQuick && g1.total === 5 && g1.question.includes('즉석 문제'), JSON.stringify({ index: g1.index, total: g1.total, q: g1.question }));
check('즉석 문제 창이 닫힘', (await teacher.js(`document.querySelector('.df-fx-quick') === null`)) === true);
await type(a, '하나');
await until(async () => (await phase(a)) === 'reveal' && (await b.js(`__df.gb().phase`)) === 'reveal', 30000, 150);
await wait(500);
check('즉석 문제 채점: A "하나" 맞음, B 내지 않아 틀림', (await a.js(`__df.mine().gbResult`)) === 'correct' && (await b.js(`__df.mine().gbResult`)) === 'wrong');

// 나머지(3: 객관식 2, 4: 단답형 관성, 5: OX X)
for (const [plan, other] of [
  ['2', '1'],
  ['text:관성이요', 'text:모름'],
  ['X', 'O'],
]) {
  const before = await a.js(`__df.gb().index`);
  await next();
  await until(async () => (await phase(a)) === 'question' && (await a.js(`__df.gb().index`)) === before + 1, 20000, 100);
  if (plan.startsWith('text:')) {
    await type(a, plan.slice(5));
    await type(b, other.slice(5));
  } else {
    await stand(a, plan);
    await stand(b, other);
  }
  await until(async () => (await phase(a)) === 'reveal' && (await b.js(`__df.gb().phase`)) === 'reveal', 30000, 150);
  await wait(500);
}
const finalA = await a.js(`__df.mine()`);
const finalB = await b.js(`__df.mine()`);
check('바로 낸 문제 끝까지: A 5문제 모두 맞음(5점), B 탈락', finalA.gbScore === 5 && finalB.gbOut === true, `A ${finalA.gbScore}점, B 목숨 ${finalB.gbLives} 탈락 ${finalB.gbOut}`);
await next();
await until(async () => (await phase(a)) === 'end' && (await teacher.js(`__df.gb().phase`)) === 'end', 20000, 150);
await wait(1500);
const sA = (await a.js(`__df.sounds()`)).requested;
const sB = (await b.js(`__df.sounds()`)).requested;
const sT = (await teacher.js(`__df.sounds()`)).requested;
check('효과음(A): 문제 시작·째깍·맞음·팡파르', ['question', 'tick', 'correct', 'fanfare'].every((s) => sA.includes(s)), sA.join(','));
check('효과음(B): 틀림·탈락', sB.includes('wrong') && sB.includes('out'), sB.join(','));
check('효과음(선생님): 정답 공개·팡파르', sT.includes('reveal') && sT.includes('fanfare'), sT.join(','));
await shot(a, 'quick-end');

// 끝내기
await teacher.js(`(() => { const b = [...document.querySelectorAll('.df-gb-panel .df-button')].find((x) => x.textContent.includes('골든벨 끝내기')); b?.click(); })()`);
await wait(400);
await clickText(teacher, '.df-dialog .df-button', '끝내기');
check('골든벨 끝내기', await until(async () => (await a.js(`__df.map()`)) === 'school', 6000));

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
