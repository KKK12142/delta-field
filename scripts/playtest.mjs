// 헤드리스 크롬으로 선생님 1명, 학생 2명이 들어와 교실 방탈출을 해 보고, 선생님은 CCTV 모드로 지켜본 뒤 골든벨을 한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버의 선생님 비밀번호를 DF_TEACHER_PASSWORD로 넘긴다.
// 게임 서버는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell로 켠다(제한 시간이 짧은 확인용 문제 파일).
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest [주소] [캡처 폴더]   기본값: http://localhost:5173/  .run/playtest
// 퀴즈 답 번호와 사물 위치는 src/data/classroom.json에 맞춰 두었다. 방 데이터를 바꾸면 함께 고친다.
import { mkdirSync, rmSync } from 'node:fs';
import { launchChrome, wait } from './lib/chrome.mjs';

const [baseUrl = 'http://localhost:5173/', outDir = '.run/playtest'] = process.argv.slice(2);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const chrome = await launchChrome(outDir);
const { openPage, consoleErrors } = chrome;

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

// ---- 골든벨 ----
// 학생 A는 교실에서 칠판을 본 뒤(진행 1/4) 골든벨에 갔다가 같은 자리, 같은 진행으로 돌아와야 한다.
await a.js(`__df.teleport(5, 1.5)`);
await a.press('Space');
await a.press('Space');
await wait(300);
const aBefore = await a.js(`__df.pos()`);

await clickText(teacher, '.df-hud button', '골든벨 시작');
await wait(800);
const pick = (await teacher.dialogText()) ?? '';
check('골든벨: 문제 파일 목록(틀린 파일은 까닭과 함께 막힘)',
  /확인용 골든벨 \(7문제\)/.test(pick) && /broken\.yaml/.test(pick) && /1번 문제: OX 문제의 answer는 O 또는 X로 씁니다/.test(pick) &&
  (await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('broken')).disabled`)) === true,
  fmt(pick));
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('확인용 골든벨')).click()`);
await wait(1200);
const maps = async () => [await teacher.js(`__df.map()`), await a.js(`__df.map()`), await b.js(`__df.map()`)].join(',');
check('골든벨: 모두 골든벨 맵으로 옮겨 감', (await maps()) === 'goldenbell,goldenbell,goldenbell', await maps());
const gbCard = (pg) => pg.js(`document.querySelector('.df-gb')?.innerText ?? null`);
const gbPanel = () => teacher.js(`document.querySelector('.df-gb-panel')?.innerText ?? null`);
check('골든벨: 시작 안내와 목숨 3개', /선생님이 첫 문제를 내면/.test((await gbCard(a)) ?? '') && /목숨 ♥♥♥/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
check('골든벨: 선생님 창에 학생 2명, 첫 문제 단추', /학생 2명/.test((await gbPanel()) ?? '') && /첫 문제/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
await teacher.shot('gb-ready');

const ZONE = { O: [4.5, 3.5], X: [14.5, 3.5], 1: [4.5, 3.5], 2: [14.5, 3.5], 3: [4.5, 9.5], 4: [14.5, 9.5], 밖: [9.5, 3.5] };
const nextButton = () => teacher.js(`document.querySelector('.df-gb-panel .df-row > .df-button:not(.df-button-small)').click()`);
/** 선생님이 문제를 내고 A, B를 구역에 세운다. during은 푸는 중에, 시간이 끝나면 정답 공개까지 기다린다. */
async function gbRound(aZone, bZone, during) {
  await nextButton();
  await wait(300);
  await a.js(`__df.teleport(${ZONE[aZone]})`);
  await b.js(`__df.teleport(${ZONE[bZone]})`);
  await wait(500);
  if (during) await during();
  await wait(3300);
}
const gbOf = async (nick) => teacher.js(`__df.others().find((o) => o.nickname === ${JSON.stringify(nick)})`);

await gbRound('O', '밖', async () => {
  check('골든벨 1번: 문제와 남은 시간', /1\/7번 문제 · OX · 남은 시간 \d초/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
  check('골든벨 1번: 내가 서 있는 곳', /서 있는 곳: O/.test((await gbCard(a)) ?? '') && /서 있는 곳: 구역 밖/.test((await gbCard(b)) ?? ''));
  check('골든벨 1번: 선생님 창에 구역별 인원', /O 1명 · X 0명 · 구역 밖 1명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
  await teacher.shot('gb-question');
});
check('골든벨 1번: 맞힌 학생 A', /정답: O/.test((await gbCard(a)) ?? '') && /맞았습니다. 점수가 1점 올랐습니다/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
check('골든벨 1번: 구역 밖이면 틀림, 목숨 2개', /구역 밖에 있어 틀린 것으로 셉니다. 틀렸습니다. 목숨이 2개 남았습니다/.test((await gbCard(b)) ?? ''), fmt(await gbCard(b)));
check('골든벨 1번: 선생님 창에 맞힌 수', /맞힌 학생 1명 · 틀린 학생 1명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
await b.shot('gb-wrong');

await gbRound(3, 1, async () => {
  check('골든벨 2번: 객관식 구역별 인원', /1 1명 · 2 0명 · 3 1명 · 4 0명 · 구역 밖 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
  await a.shot('gb-choice');
});
check('골든벨 2번: 객관식 정답은 번호와 보기', /정답: 3\. 다/.test((await gbCard(a)) ?? '') && /목숨이 1개 남았습니다/.test((await gbCard(b)) ?? ''), fmt(await gbCard(b)));

await gbRound('X', 'O');
check('골든벨 3번: 목숨을 다 잃으면 탈락', /탈락했습니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === true, fmt(await gbCard(b)));

await gbRound('O', 'O');
check('골든벨 4번: 탈락 중 맞히면 부활까지 남은 수, 점수는 그대로',
  /2문제를 더 맞히면 다시 살아납니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbScore === 0, fmt(await gbCard(b)));

await gbRound(2, 2, async () => {
  check('골든벨 5번: 보기가 3개면 구역도 3개', /1 0명 · 2 2명 · 3 0명 · 구역 밖 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
});
check('골든벨 5번: 부활까지 1문제', /1문제를 더 맞히면/.test((await gbCard(b)) ?? ''), fmt(await gbCard(b)));

await gbRound('X', 'X');
check('골든벨 6번: 3문제를 맞혀 목숨 1개로 다시 살아남',
  /목숨 1개로 다시 살아났습니다/.test((await gbCard(b)) ?? '') && /목숨 ♥♡♡/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === false,
  fmt(await gbCard(b)));

await gbRound('O', 'O');
check('골든벨 7번: 부활 뒤 맞힌 문제는 점수에 들어감', (await gbOf('나래')).gbScore === 1 && (await gbOf('가람')).gbScore === 7,
  `가람 ${(await gbOf('가람')).gbScore}점, 나래 ${(await gbOf('나래')).gbScore}점`);
check('골든벨 7번: 마지막 문제 뒤 단추는 결과 보기', /결과 보기/.test((await gbPanel()) ?? ''));
await nextButton();
await wait(500);
check('골든벨 결과: 선생님 창에 순위', /1위 가람 7점/.test((await gbPanel()) ?? '') && /2위 나래 1점/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
check('골든벨 결과: 학생 화면에 내 점수와 순위', /내 점수 7점/.test((await gbCard(a)) ?? '') && /1위 가람 7점/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
await teacher.shot('gb-end');

// 골든벨 중에 들어온 학생은 골든벨 맵에서 시작한다.
const c = await openPage('student-c', baseUrl);
await c.enter({ nickname: '다온', code });
await wait(500);
check('골든벨 중에 들어온 학생 C는 골든벨 맵에서 시작', (await c.js(`__df?.map()`)) === 'goldenbell' && /골든벨이 끝났습니다/.test((await gbCard(c)) ?? ''),
  `${await c.js(`__df?.map()`)}`);

await clickText(teacher, '.df-gb-panel button', '골든벨 끝내기');
await wait(1200);
check('골든벨 끝: 모두 교실로 돌아옴', (await maps()) === 'classroom,classroom,classroom' && (await c.js(`__df.map()`)) === 'classroom', await maps());
const aAfter = await a.js(`__df.pos()`);
check('골든벨 끝: 학생 A가 떠나기 전 자리로 돌아옴', Math.abs(aAfter.col - aBefore.col) < 0.01 && Math.abs(aAfter.row - aBefore.row) < 0.01,
  `${aBefore.col.toFixed(2)}, ${aBefore.row.toFixed(2)} → ${aAfter.col.toFixed(2)}, ${aAfter.row.toFixed(2)}`);
await wait(300);
check('골든벨 끝: 방탈출 진행이 그대로(칠판)', (await gbOf('가람')).done.includes('blackboard'), JSON.stringify((await gbOf('가람')).done));

// ---- 학생 B, C가 창을 닫으면 CCTV에 연결 끊김, 다시 붙기 시간(20초)이 지난 뒤 사라짐 ----
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(300);
await b.close();
await c.close();
await wait(1000);
check('창을 닫은 직후에는 다시 붙기를 기다림(남아 있음)', (await teacher.js(`__df.others().length`)) === 3);
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
chrome.close();
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
