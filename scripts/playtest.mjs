// 헤드리스 크롬으로 선생님 1명, 학생 2명이 들어와 학교 맵(교실-복도-과학실-운동장) 방탈출을 해 보고, 선생님은 CCTV 모드로 지켜본 뒤 골든벨을 한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버의 선생님 비밀번호를 DF_TEACHER_PASSWORD로 넘긴다.
// 게임 서버는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell(제한 시간이 짧은 확인용 문제 파일),
// DF_ESCAPE_DIR=scripts/playtest-escape(예시 방탈출 자료와 형식이 틀린 자료), DF_MINI_FAST=1(미니게임 한 판을 짧게)로 켠다.
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest [주소] [캡처 폴더]   기본값: http://localhost:5173/  .run/playtest
// 사물 위치는 src/data/school.json에, 미션 답 번호는 escape/example.yaml에 맞춰 두었다. 맵이나 예시 자료를 바꾸면 함께 고친다.
import { mkdirSync, rmSync } from 'node:fs';
import { size } from '../src/theme.ts';
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
// 터치 화면은 주소에 touch=1을 붙인다(baseUrl에 ?render= 같은 것이 있어도 된다).
const touchUrl = new URL(baseUrl).href.replace(/(\?|$)/, (m) => (m ? '?touch=1&' : '?touch=1'));
const teacher = await openPage('teacher', baseUrl);
await teacher.enter({ teacher: true, nickname: '선생님', pw: 'wrong-password' });
check('선생님 비밀번호가 틀리면 안내', /비밀번호가 맞지 않습니다/.test((await teacher.error()) ?? ''), await teacher.error());
await teacher.enter({ teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님이 방을 만들고 방 코드를 받음', /^\d{4}$/.test(code ?? ''), code);
check('첫 화면: 선생님에게는 반 고르기가 없음', (await teacher.js(`document.querySelector('.df-classes')`)) === null);
check('선생님 화면에 방 코드가 보임', (await teacher.js(`document.querySelector('.df-hud').innerText`))?.includes(`방 코드 ${code}`));
await teacher.shot('room-created');

// ---- 선생님: 방을 만들면 방탈출 자료를 고르는 창이 바로 뜬다 ----
await wait(800);
const escapePick = (await teacher.dialogText()) ?? '';
check('방탈출 자료: 방을 만들면 고르는 창이 뜸(틀린 파일은 까닭과 함께 막힘)',
  /방탈출 자료/.test(escapePick) && /예시 방탈출\(학교\) \(미션 16개, 힌트 카드 4장\)/.test(escapePick) && /broken\.yaml/.test(escapePick) &&
    /맵\(school\.json\)에 mission이 "no-such-object"인 사물이 없습니다/.test(escapePick) &&
    (await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('broken')).disabled`)) === true,
  fmt(escapePick));
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('예시 방탈출')).click()`);
await wait(500);
check('방탈출 자료: 고르면 방에 들어감', (await teacher.js(`__df.escapeFile()`)) === 'example.yaml' && (await teacher.dialogText()) === null);

// ---- 학생: 잘못된 입력 ----
const a = await openPage('student-a', baseUrl);
const picker = await a.js(`(() => {
  const bs = [...document.querySelectorAll('.df-char')];
  return { n: bs.length, pressed: bs.filter((b) => b.getAttribute('aria-pressed') === 'true').length,
    img: getComputedStyle(bs[0].querySelector('.df-char-face')).backgroundImage };
})()`);
check('첫 화면: 캐릭터 8가지 가운데 하나가 골라져 있음', picker.n === 8 && picker.pressed === 1 && /sprites\/characters\/char-01\.png/.test(picker.img),
  `${picker.n}개, 고름 ${picker.pressed}`);
await a.js(`document.querySelector('.df-char[data-id="char-03"]').click()`);
check('첫 화면: 누른 캐릭터가 골라짐', (await a.js(`document.querySelector('.df-char[aria-pressed="true"]').dataset.id`)) === 'char-03');
await a.shot('characters');
// 반은 고르지 않은 채로 시작한다(enter()는 학생이면 반을 누르므로 먼저 본다).
check('첫 화면: 학생은 반 2가지 가운데 고름, 처음에는 고르지 않음',
  (await a.js(`[...document.querySelectorAll('.df-class')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')).join(',')`)) ===
    '수과학반:false,AI.SW반:false');
await a.enter({ nickname: '가람', code, classGroup: null });
check('반을 고르지 않으면 안내', /반을 골라야/.test((await a.error()) ?? ''), await a.error());
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
await a.enter({ nickname: '가람', code, character: 'char-03', classGroup: 'aisw' });
check('학생 A가 방 코드로 들어감', (await a.js(`window.__df?.code()`)) === code);
for (let i = 0; i < 20 && !(await a.dialogText()); i++) await wait(150);
check('이야기 카드: 들어오면 자료의 intro가 한 번 뜸', /과학 탐구 대회 날/.test((await a.dialogText()) ?? '') && /시작하기/.test((await a.dialogText()) ?? ''),
  fmt(await a.dialogText()));
await a.shot('intro');
await a.js(`document.querySelector('.df-dialog .df-button').click()`);
await wait(300);

// ---- 학생 B(태블릿) ----
const b = await openPage('student-b', touchUrl, { touch: true });
await b.enter({ nickname: '나래', code, character: 'char-05', classGroup: 'science' });
// 이야기 카드가 뜨면 닫는다(부하가 크면 늦게 뜨므로 잠깐 기다린다).
for (let i = 0; i < 20 && !(await b.dialogText()); i++) await wait(150);
check('학생 B가 들어감', (await b.js(`window.__df?.code()`)) === code);
await b.js(`document.querySelector('.df-dialog .df-button')?.click()`);
await wait(300);
await wait(500);
check('선생님 화면: 학생 2명 접속', (await teacher.js(`document.querySelector('.df-hud').innerText`))?.includes('학생 2명 접속'));
const seenByTeacher = await teacher.js(`__df.others().map((o) => o.nickname).sort().join(',')`);
check('선생님이 두 학생을 봄', seenByTeacher === '가람,나래', seenByTeacher);
const chars = await teacher.js(`__df.others().map((o) => o.nickname + ':' + o.character).sort().join(',')`);
check('고른 캐릭터가 서버에 들어감', chars === '가람:char-03,나래:char-05', chars);
const drawnChars = await teacher.js(`__df.drawn().map((d) => d.character).sort().join(',')`);
check('선생님 화면에 학생이 고른 캐릭터로 그려짐', drawnChars === 'char-03,char-05', drawnChars);
check('학생 A가 선생님과 학생 B를 봄', (await a.js(`__df.others().map((o) => o.nickname).sort().join(',')`)) === '나래,선생님');

// ---- 학생 B(태블릿): 화면 왼쪽 절반 아무 데나 누르면 그 자리에 조이스틱이 나타나고, 끌면 움직인다 ----
const joy = () => b.js(`(() => {
  const z = document.querySelector('.df-joystick-zone');
  const j = document.querySelector('.df-joystick');
  const zr = z.getBoundingClientRect();
  const r = j.getBoundingClientRect();
  return {
    zone: !z.hidden && zr.left === 0 && zr.top === 0 && Math.abs(zr.width - innerWidth / 2) < 1 && Math.abs(zr.height - innerHeight) < 1,
    shown: !j.hidden, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2, left: r.left, bottom: r.bottom,
  };
})()`);
// 시작 자리 둘레에 화분 같은 꾸밈 사물이 있어 오른쪽이 트인 자리에 선다.
await b.js(`__df.teleport(11.5, 8.5)`);
await wait(200);
const [vw, vh] = await b.js(`[innerWidth, innerHeight]`);
let j = await joy();
check('조이스틱: 영역은 화면 왼쪽 절반(높이 전체), 손대지 않으면 보이지 않음', j.zone && !j.shown);
const at = { x: Math.round(vw * 0.3), y: Math.round(vh * 0.45) };
const bBefore = await b.js(`__df.pos()`);
await b.touch('touchStart', [{ x: at.x, y: at.y }]);
await wait(100);
j = await joy();
check('조이스틱: 왼쪽 절반을 누른 자리를 가운데로 나타남', j.shown && Math.abs(j.x - at.x) < 1 && Math.abs(j.y - at.y) < 1,
  `누른 곳 ${at.x}, ${at.y} / 가운데 ${j.x.toFixed(0)}, ${j.y.toFixed(0)}`);
await b.touch('touchMove', [{ x: at.x + j.r, y: at.y }]);
await wait(100);
await b.shot('joystick');
await wait(400);
await b.touch('touchEnd', []);
await wait(300);
check('조이스틱: 떼면 사라짐', !(await joy()).shown);
const bAfter = await b.js(`__df.pos()`);
check('학생 B가 조이스틱으로 오른쪽으로 감', bAfter.col - bBefore.col > 0.5 && Math.abs(bAfter.row - bBefore.row) < 0.05,
  `col ${bBefore.col.toFixed(2)} → ${bAfter.col.toFixed(2)}, row ${bBefore.row.toFixed(2)} → ${bAfter.row.toFixed(2)}`);
const bOnTeacher = await teacher.js(`__df.others().find((o) => o.nickname === '나래')`);
check('선생님 화면의 학생 B 위치가 따라옴', Math.abs(bOnTeacher.col - bAfter.col) < 0.05, `서버 ${bOnTeacher.col.toFixed(2)}, B ${bAfter.col.toFixed(2)}`);

await b.touch('touchStart', [{ x: 2, y: vh - 2 }]);
await wait(100);
j = await joy();
check('조이스틱: 화면 끝을 눌러도 바탕이 화면 안에 들어옴', j.shown && j.left >= 0 && j.bottom <= vh, `왼쪽 ${j.left.toFixed(0)}, 아래 ${j.bottom.toFixed(0)}`);
await b.touch('touchEnd', []);
await wait(200);

// 한 손가락으로 조이스틱을 쥔 채 다른 손가락으로 살펴보기 단추를 누른다(칠판 앞).
await b.js(`__df.teleport(9, 2.5)`);
await wait(300);
const act = await b.js(`(() => { const r = document.querySelector('.df-action').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const f1 = { x: at.x, y: at.y, id: 0 };
await b.touch('touchStart', [f1]);
await wait(100);
await b.touch('touchStart', [f1, { x: act.x, y: act.y, id: 1 }]);
await wait(100);
await b.touch('touchMove', [f1]);
await wait(300);
check('조이스틱을 쥔 채 다른 손가락으로 살펴보기 단추를 누름', /칠판에 글이/.test((await b.dialogText()) ?? ''), fmt(await b.dialogText()));
await b.touch('touchEnd', []);
await wait(200);
const okAt = await b.js(`(() => { const r = document.querySelector('.df-dialog .df-button').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await b.touch('touchStart', [{ x: okAt.x, y: okAt.y }]);
await b.touch('touchEnd', []);
await wait(300);
check('대화상자의 확인 단추를 터치로 눌러 닫음', (await b.dialogText()) === null);
const drawn = await teacher.js(`__df.drawn()`);
check('선생님 화면에 다른 사람 아바타 2개가 그려짐', drawn.length === 2);
await teacher.shot('sees-students');
await b.shot('touch');

// ---- 카메라: 내 아바타를 따라가고 맵 밖은 비추지 않는다 ----
const [aw, ah] = await a.js(`[innerWidth, innerHeight]`);
/** 안내의 장소 이름("과학실 · 미션 1/4"에서 장소 이름만) */
const placeOf = async (pg) => ((await pg.js(`document.querySelector('.df-hud .df-hud-box strong').textContent`)) ?? '').split(' · ')[0];
const placeLine = (pg) => pg.js(`document.querySelector('.df-hud .df-hud-box strong').textContent`);
// ---- 미니맵: 학생 화면 오른쪽 아래에 작게, 누르면 큰 지도(걷지 않음), 바깥을 누르면 닫힘 ----
check('미니맵: 학생 화면에 보이고 선생님 화면에는 없음',
  (await a.js(`__df.minimap().shown`)) === true && (await teacher.js(`!!document.querySelector('.df-minimap')`)) === false);
const mm = await a.js(`(() => { const m = document.querySelector('.df-minimap').getBoundingClientRect(); const b = document.querySelector('.df-action').getBoundingClientRect();
  const h = document.querySelector('.df-hud > .df-hud-box').getBoundingClientRect(); return { m: [m.left, m.top, m.right, m.bottom], b: [b.top], h: [h.bottom] }; })()`);
check('미니맵: 살펴보기 단추 위, 오른쪽 위 안내 아래(겹치지 않음)', mm.m[3] <= mm.b[0] && mm.m[1] >= mm.h[0], JSON.stringify(mm));
await a.js(`document.querySelector('.df-minimap').click()`);
await wait(400);
check('미니맵: 누르면 큰 지도가 열림', (await a.js(`__df.minimap().big`)) === true && /학교 지도/.test((await a.dialogText()) ?? ''), fmt(await a.dialogText()));
const mapPos = await a.js(`__df.pos()`);
await a.press('ArrowLeft', 400);
check('미니맵: 큰 지도를 보는 동안은 걷지 않음', Math.abs((await a.js(`__df.pos().col`)) - mapPos.col) < 0.01);
await a.shot('minimap-big');
await a.js(`document.querySelector('.df-dialog').click()`);
await wait(300);
check('미니맵: 바깥을 누르면 닫힘', (await a.dialogText()) === null && (await a.js(`__df.minimap().big`)) === false);
check('처음 장소는 교실, 안내에 장소의 미션 수(교실 · 미션 0/4)', (await a.js(`__df.place()`)) === '교실' && (await placeLine(a)) === '교실 · 미션 0/4',
  await placeLine(a));
const camAt = async (col, row) => {
  await a.js(`__df.teleport(${col}, ${row})`);
  await wait(2500); // 화면은 조금씩 따라가므로(followLerp) 다 따라갈 때까지 기다린다(부하가 크면 프레임이 줄어 더 걸린다)
  return a.js(`__df.camera()`);
};
// 학교 맵은 위쪽 안내를 지도 위에 겹쳐 띄우므로(빈 띠 없음) 내 아바타가 화면 가운데에 온다.
const centered = (c) => Math.abs(c.me.x - aw / 2) < 4 && Math.abs(c.me.y - ah / 2) < 4;
const c1 = await camAt(16, 14.5);
const c2 = await camAt(32, 14.5);
check('카메라: 내 아바타를 따라감(복도 두 곳 모두 가운데)', centered(c1) && centered(c2) && Math.abs(c2.view.col - c1.view.col - 16) < 0.1,
  `화면 ${c1.me.x.toFixed(0)},${c1.me.y.toFixed(0)} / ${c2.me.x.toFixed(0)},${c2.me.y.toFixed(0)}, 비추는 곳 ${c1.view.col.toFixed(1)} → ${c2.view.col.toFixed(1)}열`);
const shortSide = Math.min(c1.view.w, c1.view.h);
// 확대는 캔버스 픽셀 기준으로 짧은 쪽에 viewTiles칸이 보이는 배율에 가장 가까운 1/2 단위(0.5, 1, 1.5…)다(?render=free면 맞추지 않음).
const idealDevice = (Math.min(aw, ah) * c1.dpr) / (size.viewTiles * size.tile);
const freeRender = new URL(baseUrl).searchParams.get('render') === 'free';
const wantDevice = freeRender ? idealDevice : Math.max(1, Math.round(idealDevice * 2)) / 2;
check(`카메라: 확대는 짧은 쪽 ${size.viewTiles}칸 배율에${freeRender ? ' 맞춤' : ' 가장 가까운 캔버스 픽셀 1/2 단위'}`, Math.abs(c1.deviceZoom - wantDevice) < 1e-6,
  `짧은 쪽 ${shortSide.toFixed(1)}칸, 확대 ${c1.zoom.toFixed(3)}(캔버스 ${c1.deviceZoom}, 비율 ${c1.dpr.toFixed(2)}, ${size.viewTiles}칸이면 ${(idealDevice / c1.dpr).toFixed(2)})`);
await a.shot('camera-hall');
const c3 = await camAt(1.5, 2.5);
check('카메라: 맵 구석에서는 맵 밖을 비추지 않음(위쪽 빈 띠 없음)',
  Math.abs(c3.view.col) < 0.01 && Math.abs(c3.view.row) < 0.01, `비추는 곳 왼쪽 위 ${c3.view.col.toFixed(2)}, ${c3.view.row.toFixed(2)}`);
const c4 = await camAt(119.5, 35.5);
check('카메라: 반대쪽 구석도 맵 밖을 비추지 않음', Math.abs(c4.view.col + c4.view.w - 121) < 0.01 && Math.abs(c4.view.row + c4.view.h - 37) < 0.01,
  `비추는 곳 오른쪽 아래 ${(c4.view.col + c4.view.w).toFixed(2)}, ${(c4.view.row + c4.view.h).toFixed(2)}`);
await a.js(`__df.teleport(46.5, 35.5)`);
await wait(200);
check('장소: 운동장', (await placeOf(a)) === '운동장');
await a.js(`__df.teleport(11.5, 8.5)`);
await wait(300);

// ---- 선생님: CCTV 모드 켜기 ----
const cctvText = () => teacher.js(`document.querySelector('.df-cctv')?.innerText ?? null`);
const rowText = (nick) => teacher.js(`[...document.querySelectorAll('.df-cctv-row')]
  .find((r) => r.querySelector('.df-cctv-row-name').textContent === ${JSON.stringify(nick)})?.innerText ?? null`);
const clickText = (page, selector, text) => page.js(`[...document.querySelectorAll(${JSON.stringify(selector)})]
  .find((b) => b.textContent === ${JSON.stringify(text)})?.click()`);
const cctv = () => teacher.js(`__df.cctv()`);
check('학생 화면에는 CCTV 단추가 없음', (await a.js(`[...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === 'CCTV 보기').hidden`)) === true);
const cctvOffBefore = (await teacher.js(`(() => { const s = window.__df; return s && s.cctv() === null; })()`)) === true;
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(400);
check('CCTV: 창이 뜨고 학생 2명', cctvOffBefore && /학생 2명/.test((await cctvText()) ?? ''), fmt(await cctvText()));
check('CCTV: 목록과 머리글에 반이 보임',
  /AI\.SW반/.test((await rowText('가람')) ?? '') && /수과학반/.test((await rowText('나래')) ?? '') && /수과학반 1 · AI\.SW반 1/.test((await cctvText()) ?? ''),
  `${fmt(await rowText('가람'))} | ${fmt(await rowText('나래'))}`);
check('CCTV: 목록이 반 순서(수과학반 나래 → AI.SW반 가람)',
  (await teacher.js(`[...document.querySelectorAll('.df-cctv-row-name')].map((n) => n.textContent).join(',')`)) === '나래,가람');
check('CCTV: 처음에는 교실에서 돌아다니는 중, 힌트 0/4', /교실 · 돌아다니는 중/.test((await rowText('가람')) ?? '') && /힌트 0\/4/.test((await rowText('가람')) ?? ''),
  fmt(await rowText('가람')));
check('CCTV: 오른쪽 안내와 살펴보기 단추를 감춤',
  (await teacher.js(`document.querySelector('.df-action').hidden && !document.querySelector('.df-hud').innerText.includes('가진 물건')`)) === true);
const viewText = () => teacher.js(`[...document.querySelectorAll('.df-cctv-view')].map((b) => b.textContent + ':' + b.getAttribute('aria-pressed')).join(',')`);
check('CCTV 구역 보기: 처음에는 학생이 가장 많은 구역(1부 건물)을 비추고 구역마다 학생 수',
  (await viewText()) === '전체 2:false,1부 건물 2:true,2부 건물 0:false,운동장 0:false' && (await cctv()).view === 'building1', await viewText());
const overviewZoom = (await cctv()).zoom;
const panelLeft = await teacher.js(`document.querySelector('.df-cctv').getBoundingClientRect().left`);
const th = await teacher.js(`innerHeight`);
await teacher.shot('cctv-building1');
await clickText(teacher, '.df-cctv-view', '전체 2');
await wait(300);
const ov = (await teacher.js(`__df.camera()`)).map;
const allZoom = (await cctv()).zoom;
check('CCTV 전체 단추: 학교 맵 전체가 지도 자리(위쪽 안내 아래, CCTV 창 왼쪽)에 들어옴',
  ov.x >= 0 && ov.y >= 0 && ov.x + ov.w <= panelLeft && ov.y + ov.h <= th && ov.w > panelLeft * 0.6,
  `맵 화면 ${ov.x.toFixed(0)},${ov.y.toFixed(0)} ${ov.w.toFixed(0)}×${ov.h.toFixed(0)}, 창 왼쪽 ${panelLeft.toFixed(0)}`);
check('CCTV 구역 보기: 1부 건물은 전체보다 크게(1.5배 넘게) 보임', overviewZoom > allZoom * 1.5, `${allZoom.toFixed(3)} → ${overviewZoom.toFixed(3)}`);
await clickText(teacher, '.df-cctv-view', '1부 건물 2');
await wait(300);
const tPos = await teacher.js(`__df.pos()`);
await teacher.press('ArrowRight', 400);
const tPos2 = await teacher.js(`__df.pos()`);
check('CCTV 모드에서는 선생님이 움직이지 않음', Math.abs(tPos2.col - tPos.col) < 0.01);

// ---- 캐릭터 아바타: 걸으면 그 방향 걷기 애니메이션, 멈추면 그 방향 서기 ----
await a.js(`__df.teleport(11.5, 8.5)`);
await wait(300);
const walking = a.press('ArrowRight', 900);
await wait(450);
const w1 = await a.js(`__df.avatar()`);
const seenWalk = await teacher.js(`__df.drawn().find((d) => d.character === 'char-03')`);
await walking;
const w2 = await a.js(`__df.avatar()`);
const zoomA = (await a.js(`__df.camera()`)).zoom;
check('아바타: 오른쪽으로 걸으면 오른쪽 걷기', w1.anim === 'char-03-walk-right', JSON.stringify(w1));
check('아바타: 멈추면 오른쪽 서기 프레임(7)', w2.anim === null && w2.frame === 7, JSON.stringify(w2));
check('아바타: 다른 화면에서도 걷는 모습', seenWalk?.anim === 'char-03-walk-right', JSON.stringify(seenWalk));
check('아바타: 키는 120px × 화면 확대', Math.abs(w2.height - 120 * zoomA) < 0.5, `${w2.height.toFixed(1)}px, 확대 ${zoomA}`);
await a.press('ArrowUp', 300);
check('아바타: 위로 가면 뒷모습 서기(10)', (await a.js(`__df.avatar()`)).frame === 10);
await a.shot('characters-classroom');

// ---- 학생 A: 학교 방탈출 한 판(선생님은 CCTV로 봄). 미션은 서버가 채점하므로 누른 뒤 답을 조금 기다린다. ----
const dialogHas = async (re) => re.test((await a.dialogText()) ?? '');
/** 키를 누르고 서버의 답(대화상자)을 기다린다. */
const pressA = async (key) => {
  await a.press(key);
  await wait(350);
};
/** 단답형 미션 답을 써서 낸다. */
const typeA = async (text) => {
  await a.js(`(() => { const i = document.querySelector('.df-quiz-answer input'); i.value = ${JSON.stringify(text)}; i.form.requestSubmit(); })()`);
  await wait(400);
};
await a.js(`__df.teleport(1.5, 2.5)`);
await a.press('ArrowLeft', 600);
await a.press('ArrowUp', 600);
const p = await a.js(`__df.pos()`);
check('벽을 뚫고 나가지 않음', p.col >= 1.29 && p.row >= 2.29, `col ${p.col.toFixed(2)}, row ${p.row.toFixed(2)}`);
await a.js(`__df.teleport(3, 4.5)`);
await a.press('ArrowDown', 600);
check('책상을 지나가지 않음', (await a.js(`__df.pos().row`)) <= 4.71);

await a.js(`__df.teleport(22, 10.5)`);
await a.press('ArrowDown', 600);
check('잠긴 교실 문은 지나가지 못함', (await a.js(`__df.pos().row`)) <= 10.71, `row ${(await a.js(`__df.pos().row`)).toFixed(2)}`);
await pressA('Space');
check('열쇠 없이 교실 문: 잠김 안내', await dialogHas(/교실 문이 잠겨/));
await wait(300);
check('CCTV: 잠긴 교실 문을 보는 중(장소 이름과 함께)', /교실 · 교실 문 살펴보는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
await a.press('Enter');
await wait(400);
check('닫은 뒤 다시 열리지 않음', (await a.dialogText()) === null);
check('CCTV: 닫으면 돌아다니는 중', /돌아다니는 중/.test((await rowText('가람')) ?? ''));

// 맵 꾸미기(3단계): 미션 사물 위 "!", 가까이 가면 "이름 · 살펴보기" 판, 꾸밈 사물과 그림자, 지나가는 꾸밈(의자)
const lookOf = (id) => a.js(`__df.objectLook(${JSON.stringify(id)})`);
await a.js(`__df.teleport(5, 8.5)`);
await wait(300);
let bb = await lookOf('blackboard');
check('사물 표시: 멀리 있으면 미션 사물 위에 "!"만, 이름표 판은 없음', bb.badge === 'ui/mark' && bb.plate === null, JSON.stringify(bb));
// (10, 2.5)쯤은 칠판과 교탁이 같은 거리라 교탁이 골라질 수 있다. 칠판만 닿는 자리에서 살펴본다.
await a.js(`__df.teleport(9, 2.5)`);
await wait(300);
bb = await lookOf('blackboard');
check('사물 표시: 가까이 가면 "!" 대신 "칠판 · 살펴보기" 판', bb.badge === null && bb.plate === '칠판 · 살펴보기', JSON.stringify(bb));
const plant = await lookOf('class-plant');
check('꾸밈 사물: 화분이 그려지고 그림자가 있음, 벽시계는 그림자 없음', plant?.visible === true && plant.shadow === true && (await lookOf('class-clock'))?.shadow === false,
  `${JSON.stringify(plant)} ${JSON.stringify(await lookOf('class-clock'))}`);
await a.shot('decor-classroom');
await pressA('Space');
check('칠판 단서', await dialogHas(/칠판에 글이 적혀 있습니다/), fmt(await a.dialogText()));
await a.press('Space');
await wait(300);
check('칠판 단서를 읽으면 서버가 마친 미션에 넣음', (await teacher.js(`__df.others().find((o) => o.nickname === '가람').done.join(',')`)) === 'blackboard');
await a.js(`__df.teleport(5, 8.5)`);
await wait(300);
check('사물 표시: 마친 미션은 "!"가 체크로', (await lookOf('blackboard')).badge === 'ui/mark-done', JSON.stringify(await lookOf('blackboard')));
await a.js(`__df.teleport(49.5, 5.5)`);
await a.press('ArrowRight', 500);
check('꾸밈 사물: 컴퓨터실 의자(walk)는 지나갈 수 있음', (await a.js(`__df.pos().col`)) > 51.2, String(await a.js(`__df.pos().col`)));
await a.js(`__df.teleport(19, 13.5)`);
await a.press('ArrowLeft', 600);
check('꾸밈 사물: 복도 소화기는 막음', (await a.js(`__df.pos().col`)) > 16.9, JSON.stringify(await a.js(`__df.pos()`)));

await a.js(`__df.teleport(11, 4.5)`);
await pressA('Space');
check('교탁 퀴즈가 뜸(예시 문제 표시)', (await dialogHas(/가속도/)) && (await dialogHas(/예시 문제/)));
await wait(300);
check('CCTV: 교탁 퀴즈 푸는 중(목록)', /교탁 퀴즈 푸는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
check('CCTV: 지도의 아바타 위에 "교탁 퀴즈"', (await cctv()).tags.includes('교탁 퀴즈'), (await cctv()).tags.join(','));
await teacher.shot('cctv-overview');
await pressA('1');
check('틀린 답 안내(서버 채점)', await dialogHas(/틀렸습니다/));
await a.shot('quiz-wrong');
await pressA('2');
check('맞힘(서버 채점): 보상 카드 한 장에 맞음·이어지는 글(after)·힌트 카드', (await dialogHas(/맞았습니다/)) && (await dialogHas(/뒤 두 자리는 41/)) &&
  (await dialogHas(/힌트 카드[\s\S]*힘과 가속도/)) && (await dialogHas(/수첩에 넣기/)) && (await a.js(`!!document.querySelector('.df-dialog .df-reward .df-reward-hint')`)),
  fmt(await a.dialogText()));
await a.shot('hint-card');
await pressA('Enter');
check('보상 카드를 닫으면 끝(창이 더 뜨지 않음), 안내에 교실 · 미션 2/4', (await a.dialogText()) === null && (await placeLine(a)) === '교실 · 미션 2/4', await placeLine(a));
const hudA = async () => (await a.js(`document.querySelector('.df-hud').innerText`)) ?? '';
check('힌트 수첩 단추에 1/4', (await hudA()).includes('힌트 수첩 1/4'), fmt(await hudA()));
check('CCTV: 힌트 1/4', /힌트 1\/4/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

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
/** 따라가는 학생이 지도 자리(CCTV 창 왼쪽, 위쪽 안내 아래)의 가운데쯤에 보이는지 */
const nearMiddle = async (nick) => {
  const at = await teacher.js(`__df.screenOf(${JSON.stringify(nick)})`);
  const h = await teacher.js(`innerHeight`);
  return { ok: Math.abs(at.x - panelLeft / 2) < 60 && Math.abs(at.y - h / 2) < 60, at };
};
let mid = await nearMiddle('가람');
const follow = await cctv();
check('CCTV: 목록에서 누른 학생(가람)을 크게 보며 따라감',
  follow.following === '가람' && follow.zoom > overviewZoom * 1.3 && mid.ok,
  `zoom ${overviewZoom.toFixed(2)} → ${follow.zoom.toFixed(2)}, 화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
check('CCTV: 정보 창에 힌트 수와 가진 물건', /힌트 1\/4/.test((await cctvText()) ?? '') && /가진 물건\s*없음/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.shot('cctv-follow');

await a.js(`__df.teleport(21.5, 4.5)`);
await pressA('Space');
const codeText = () => a.js(`document.querySelector('.df-code-display')?.textContent ?? null`);
check('숫자 자물쇠: 사물함에 네 자리 번호 칸과 번호 단추', (await dialogHas(/번호 자물쇠/)) && (await codeText()) === '_ _ _ _' &&
  (await a.js(`document.querySelectorAll('.df-code-pad button').length`)) === 12, `${fmt(await a.dialogText())} | ${await codeText()}`);
await wait(900);
mid = await nearMiddle('가람');
check('CCTV: 학생이 옮겨 가도 따라감', mid.ok && /사물함 퀴즈 푸는 중/.test((await cctvText()) ?? ''), `화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
for (const k of ['1', '2', '3', '4']) await a.press(k);
check('숫자 자물쇠: 키보드 숫자로도 칸이 참', (await codeText()) === '1 2 3 4', await codeText());
await pressA('Enter');
check('숫자 자물쇠: 틀리면 칸을 비우고 다시(실마리는 아직 없음)', (await dialogHas(/번호가 맞지 않습니다/)) && (await codeText()) === '_ _ _ _' && !(await dialogHas(/실마리/)),
  `${fmt(await a.dialogText())} | ${await codeText()}`);
for (let i = 0; i < 2; i++) {
  for (const k of ['1', '2', '3', '4']) await a.press(k);
  await pressA('Enter');
}
check('자동 실마리: 같은 자물쇠를 3번 틀리면 실마리 한 줄', await dialogHas(/실마리: 앞 두 자리는 칠판에/), fmt(await a.dialogText()));
await a.shot('code-clue');
const stuckText = () => teacher.js(`document.querySelector('.df-cctv-summary')?.textContent ?? ''`);
check('CCTV 요약: 3번 틀림은 아직 막힌 학생이 아님', /막힌 학생 0명/.test(await stuckText()), await stuckText());
for (const k of ['1', '2', '3', '4']) await a.press(k);
await pressA('Enter');
await wait(300);
check('CCTV 요약: 한 자물쇠를 3번 넘게 틀리면 막힌 학생 목록에(사물함 4번 틀림)', /막힌 학생 1명/.test(await stuckText()) && /가람사물함 4번 틀림/.test(await stuckText()),
  await stuckText());
for (const k of ['3', '1', '4', '1']) await clickText(a, '.df-code-pad button', k);
await a.shot('code-lock');
await clickText(a, '.df-code-pad button', '열기');
await wait(400);
check('숫자 자물쇠: 단추로 번호를 눌러 열면 교실 문 열쇠를 얻음', await dialogHas(/번호가 맞았습니다[\s\S]*교실 문 열쇠를 얻었습니다/), fmt(await a.dialogText()));
await pressA('Enter');
await wait(300);
check('CCTV 요약: 자물쇠를 풀면 막힌 학생에서 빠짐', /막힌 학생 0명/.test(await stuckText()), await stuckText());

// 교실 문(퀴즈)을 열고 복도로
await a.js(`__df.teleport(22, 10.5)`);
await pressA('Space');
check('교실 문 퀴즈가 뜸', await dialogHas(/전류/));
await pressA('1');
check('교실 문이 열림', await dialogHas(/교실 문을 열었습니다/), fmt(await a.dialogText()));
await pressA('Enter');
check('쓴 열쇠는 가진 물건에서 빠짐(교실 문 열쇠)', !(await hudA()).includes('교실 문 열쇠'), fmt(await hudA()));
await a.press('ArrowDown', 900);
check('연 교실 문을 지나 복도로 나감, 안내에 복도', (await a.js(`__df.pos().row`)) > 13 && (await placeOf(a)) === '복도',
  `row ${(await a.js(`__df.pos().row`)).toFixed(2)}, ${await placeOf(a)}`);
await wait(300);
check('CCTV: 따라가는 학생의 장소가 복도', /복도 · 돌아다니는 중/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await a.shot('hallway');

// 복도: 잠긴 과학실 문, 게시판, 신발장
await a.js(`__df.teleport(37, 13.5)`);
await a.press('ArrowUp', 600);
check('잠긴 과학실 문은 지나가지 못함', (await a.js(`__df.pos().row`)) >= 13.29);
await pressA('Space');
check('열쇠 없이 과학실 문: 잠김 안내', await dialogHas(/과학실 문이 잠겨/));
await pressA('Enter');
await a.js(`__df.teleport(5.5, 13.5)`);
await pressA('Space');
check('게시판 단서', await dialogHas(/신발장/), fmt(await a.dialogText()));
await pressA('Space');
await a.js(`__df.teleport(18.5, 15.5)`);
await pressA('Space');
check('신발장 단답형 문제가 뜸(답 칸에 바로 씀)', (await dialogHas(/운동량/)) &&
  (await a.js(`document.activeElement === document.querySelector('.df-quiz-answer input')`)) === true);
await typeA('5');
check('단답형: 틀리면 다시 써서 냄', await dialogHas(/틀렸습니다\. 다시 써서 냅니다/), fmt(await a.dialogText()));
await a.shot('quiz-short');
await typeA('6이요');
check('단답형: 단위를 빼고 말끝을 붙여도 맞음, 과학실 열쇠와 힌트 카드(운동량)를 한 카드에', (await dialogHas(/과학실 열쇠를 얻었습니다/)) &&
  (await dialogHas(/힌트 카드[\s\S]*운동량/)), fmt(await a.dialogText()));
await pressA('Enter');

// 물건 가져다주기: 복도의 흙 습도 센서를 줍는다(물 펌프는 나중에).
await a.js(`__df.teleport(29.5, 14.6)`);
await pressA('Space');
check('줍기: 흙 습도 센서를 주움(맵 이름과 자료 이름이 같음)', (await dialogHas(/흙 습도 센서를 주웠습니다/)) && (await a.js(`__df.nameOf('part-a')`)) === '흙 습도 센서',
  fmt(await a.dialogText()));
await pressA('Enter');
check('줍기: 안내는 한 번만(얻었습니다 창이 따로 뜨지 않음)', (await a.dialogText()) === null, fmt(await a.dialogText()));
check('줍기: 주운 물건은 사라지고(살펴볼 수 없음) 가진 물건에 들어감', (await a.js(`__df.target()`)) === null &&
  (await hudA()).includes('흙 습도 센서'), `${await a.js(`__df.target()`)} | ${fmt(await hudA())}`);
await a.press('ArrowDown', 400);
check('줍기: 주운 물건 자리를 지나갈 수 있음', (await a.js(`__df.pos().row`)) > 15.2, `row ${(await a.js(`__df.pos().row`)).toFixed(2)}`);
check('줍기: 다른 학생 화면에는 물건이 그대로', (await b.js(`__df.picked()`)).length === 0 && (await a.js(`__df.picked()`)).join(',') === 'part-a');
await a.js(`__df.teleport(37, 13.5)`);
await pressA('Space');
check('과학실 문이 열림', await dialogHas(/과학실 문을 열었습니다/), `${fmt(await a.dialogText())} | ${await a.js(`__df.target()`)} ${JSON.stringify(await a.js(`__df.pos()`))}`);
await pressA('Enter');
await a.press('ArrowUp', 900);
check('연 과학실 문을 지나 과학실로 들어감', (await a.js(`__df.pos().row`)) < 11 && (await placeOf(a)) === '과학실', await placeOf(a));

// 과학실: 약품장, 실험대
await a.js(`__df.teleport(44, 3.4)`);
await pressA('Space');
check('약품장 단서', await dialogHas(/얼음 비커 → 물 비커 → 수증기 플라스크/), fmt(await a.dialogText()));
await pressA('Space');
// 반 자물쇠: 같은 실험대라도 AI.SW반 A는 2진수 문제, 수과학반 B는 파동 문제가 나온다.
await b.js(`__df.teleport(35, 3.5)`);
await wait(300);
await b.js(`document.querySelector('.df-action').click()`);
await wait(500);
check('반 자물쇠: 수과학반 B에게는 파동 문제', /파동/.test((await b.dialogText()) ?? '') && !/2진수/.test((await b.dialogText()) ?? ''), fmt(await b.dialogText()));
await b.js(`[...document.querySelectorAll('.df-dialog .df-button')].find((x) => x.textContent === '닫기').click()`);
await b.js(`__df.teleport(11.5, 8.5)`);
await a.js(`__df.teleport(35, 3.5)`);
await pressA('Space');
check('반 자물쇠: AI.SW반 A에게는 2진수 문제', (await dialogHas(/2진수/)) && !(await dialogHas(/파동/)), fmt(await a.dialogText()));
await pressA('3');
check('반 자물쇠를 풀면 힌트 카드(파동과 수)', (await dialogHas(/맞았습니다/)) && (await dialogHas(/힌트 카드[\s\S]*파동과 수/)), fmt(await a.dialogText()));
await pressA('Enter');

// 순서 맞추기: 얼음 비커 → 물 비커 → 수증기 플라스크. 살펴보면 글만 보이고 "누르기"를 눌러야 순서에 든다. 틀리면 처음부터.
const BENCH = { steam: [28.5, 9.4], ice: [35.5, 9.4], water: [42.5, 9.4] };
const lookBench = async (name) => {
  await a.js(`__df.teleport(${BENCH[name]})`);
  await pressA('Space');
};
/** 순서 맞추기 창의 "누르기" 단추를 누르고 결과 창을 기다린다. */
const pressButton = async () => {
  await clickText(a, '.df-dialog .df-button', '누르기');
  await wait(400);
};
const marks = () => a.js(`JSON.stringify(__df.marks())`);
check('순서 맞추기: 이름표는 자료 파일의 labels', (await a.js(`__df.nameOf('bench-4')`)) === '비커(얼음)' && (await a.js(`__df.nameOf('bench-3')`)) === '플라스크(수증기)');
await lookBench('steam');
check('순서 맞추기: 살펴보면 글과 지금 순서, 누르기 단추', (await dialogHas(/수증기/)) && (await dialogHas(/지금 순서 0\/3/)) &&
  (await a.js(`[...document.querySelectorAll('.df-dialog .df-button')].map((b) => b.textContent).join(',')`)) === '닫기,누르기', fmt(await a.dialogText()));
await clickText(a, '.df-dialog .df-button', '닫기');
await wait(300);
check('순서 맞추기: 살펴보고 닫기만 하면 순서에 들지 않음', (await marks()) === '{}', await marks());
await lookBench('steam');
await pressButton();
check('순서 맞추기: 처음부터 틀리게 누르면 다시', await dialogHas(/순서가 맞지 않습니다. 처음부터 다시 합니다/), fmt(await a.dialogText()));
await pressA('Enter');
await lookBench('ice');
await pressButton();
check('순서 맞추기: 첫째(1/3)와 사물 위 번호 1', (await dialogHas(/순서 1\/3/)) && (await marks()) === '{"bench-4":1}', `${fmt(await a.dialogText())} ${await marks()}`);
await pressA('Enter');
await lookBench('ice');
check('순서 맞추기: 이미 누른 사물은 몇째인지만 알림(누르기 단추 없음)', (await dialogHas(/1번째로 눌렀습니다/)) &&
  !(await a.js(`[...document.querySelectorAll('.df-dialog .df-button')].some((b) => b.textContent === '누르기')`)), fmt(await a.dialogText()));
await pressA('Enter');
await a.shot('order-mark');
await lookBench('steam');
await pressButton();
check('순서 맞추기: 중간에 틀리면 처음부터(번호가 사라짐)', (await dialogHas(/순서가 맞지 않습니다/)) && (await marks()) === '{}', `${fmt(await a.dialogText())} ${await marks()}`);
await pressA('Enter');
await lookBench('water');
await pressButton();
await pressA('Enter');
await lookBench('ice');
await pressButton();
check('순서 맞추기: 다시 처음부터 첫째(1/3)', (await dialogHas(/순서 1\/3/)) && (await marks()) === '{"bench-4":1}', `${fmt(await a.dialogText())} ${await marks()}`);
await pressA('Enter');
await lookBench('water');
await pressButton();
check('순서 맞추기: 둘째(2/3)', (await dialogHas(/순서 2\/3/)) && (await marks()) === '{"bench-4":1,"bench-5":2}', `${fmt(await a.dialogText())} ${await marks()}`);
await pressA('Enter');
await lookBench('steam');
await pressButton();
check('순서 맞추기: 모두 맞히면 마침, 현관 열쇠를 얻음', (await dialogHas(/순서를 모두 맞혔습니다/)) && (await dialogHas(/현관 열쇠를 얻었습니다/)),
  fmt(await a.dialogText()));
await pressA('Enter');
check('순서 맞추기: 마치면 번호는 사라지고 켜짐으로', (await marks()) === '{}' && (await a.js(`__df.lit()`)).includes('bench-3'), await marks());

// 가져다주기: 부품 하나만 들고 가면 모자람, 둘 다 들고 가면 내려놓음
await a.js(`__df.teleport(28.5, 3.4)`);
await pressA('Space');
check('가져다주기: 모자라면 가져온 수(1/2)', await dialogHas(/가져온 것 1\/2/), fmt(await a.dialogText()));
await pressA('Enter');
await a.js(`__df.teleport(43.5, 13.6)`);
await pressA('Space');
check('줍기: 물 펌프(자료에 글이 없으면 "주웠습니다")', await dialogHas(/물 펌프를 주웠습니다/), fmt(await a.dialogText()));
await pressA('Enter');
await a.js(`__df.teleport(28.5, 3.4)`);
await pressA('Space');
check('가져다주기: 부품을 모두 내려놓음, 힌트 카드(에너지)', (await dialogHas(/화분 장치에 불이 켜졌습니다/)) && (await dialogHas(/힌트 카드[\s\S]*에너지/)),
  fmt(await a.dialogText()));
await pressA('Enter');
check('가져다주기: 내려놓은 부품과 쓴 과학실 열쇠는 가진 물건에서 빠짐', !/흙 습도 센서|물 펌프|과학실 열쇠/.test(await hudA()) && (await hudA()).includes('현관 열쇠'),
  fmt(await hudA()));

// 현관문을 열고 운동장으로, 교문에서 1부 완료
await a.js(`__df.teleport(24, 16.5)`);
await a.press('ArrowDown', 500);
const beforeEntrance = await a.js(`__df.pos().row`);
await pressA('Space');
check('현관문이 열림(열기 전에는 막힘)', beforeEntrance <= 16.71 && (await dialogHas(/현관문을 열었습니다/)), `row ${beforeEntrance.toFixed(2)}`);
await pressA('Enter');
await a.press('ArrowDown', 900);
check('연 현관문을 지나 운동장으로 나감', (await a.js(`__df.pos().row`)) > 18.5 && (await placeOf(a)) === '운동장', await placeOf(a));
await a.shot('field');
await a.js(`__df.teleport(24, 35.5)`);
await pressA('Space');
check('교문 퀴즈가 뜸', await dialogHas(/운동 에너지/));
await pressA('3');
const fin = await a.dialogText();
check('교문: 1부 완료와 걸린 시간', /1부 완료/.test(fin ?? '') && /1부를 마쳤습니다/.test(fin ?? '') && /걸린 시간/.test(fin ?? ''), fmt(fin));
await a.shot('part1-done');
await pressA('Enter');
await wait(300);
check('CCTV: 1부 완료, 힌트 4/4', /1부 완료/.test((await cctvText()) ?? '') && /힌트 4\/4/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.shot('cctv-part1-done');
await clickText(teacher, '.df-cctv button', '전체 보기');
check('CCTV: 전체 보기 단추로 돌아감', (await cctv()).following === null && Math.abs((await cctv()).zoom - overviewZoom) < 0.01);
check('1부 완료 뒤에도 진행은 그대로(자리, 마친 미션, 힌트 카드)', (await a.js(`__df.finished()`)) === true && (await a.js(`__df.hints().length`)) === 4 &&
  (await a.js(`__df.pos().row`)) > 34);
await a.js(`__df.teleport(24, 35.5)`);
await pressA('Space');
check('교문을 다시 살펴보면 이미 마쳤다는 안내', await dialogHas(/이미 1부를 마쳤습니다/), fmt(await a.dialogText()));
await pressA('Enter');

// 보너스 미션: 힌트 카드를 모두(4장) 모아야 타임캡슐이 열린다. 마치면 다음 골든벨에서 하트 +1
await b.js(`__df.teleport(57, 30.6)`);
await wait(300);
await b.js(`document.querySelector('.df-action').click()`);
await wait(500);
check('보너스: 힌트 카드가 모자라면 잠김(모은 카드 0/4)', /모은 카드 0\/4/.test((await b.dialogText()) ?? ''), fmt(await b.dialogText()));
await b.js(`document.querySelector('.df-dialog .df-button').click()`);
await b.js(`__df.teleport(11.5, 8.5)`);
await a.js(`__df.teleport(57, 30.6)`);
await pressA('Space');
check('보너스: 힌트 카드를 모두 모으면 열리고 하트 +1 안내', (await dialogHas(/선배들이 남긴 쪽지/)) && (await dialogHas(/보너스 미션을 마쳤습니다/)), fmt(await a.dialogText()));
await pressA('Enter');
await wait(300);
check('CCTV: 보너스 표시와 요약(1부 완료 1명 · 보너스 1명)', /보너스/.test((await rowText('가람')) ?? '') && /1부 완료 1명 · 보너스 1명/.test(await stuckText()),
  `${fmt(await rowText('가람'))} | ${await stuckText()}`);
check('안내의 미션 수에는 보너스를 넣지 않음(과학 정원은 보너스 타임캡슐뿐이라 이름만)', (await placeLine(a)) === '과학 정원', await placeLine(a));
await clickText(teacher, '.df-cctv-sort', '진행 낮은 순으로');
await wait(300);
check('CCTV: 진행 낮은 순 정렬(나래 → 가람), 단추는 반 순서로',
  (await teacher.js(`[...document.querySelectorAll('.df-cctv-row-name')].map((n) => n.textContent).join(',')`)) === '나래,가람' &&
    (await teacher.js(`document.querySelector('.df-cctv-sort').textContent`)) === '반 순서로');

// ---- 힌트 수첩: 얻은 카드를 다시 본다 ----
await clickText(a, '.df-hud button', '힌트 수첩 4/4');
await wait(500);
const note = (await a.dialogText()) ?? '';
check('힌트 수첩: 얻은 카드 4장(파일 순서)', /힌트 수첩 \(4\/4\)/.test(note) && /힘과 가속도[\s\S]*운동량[\s\S]*파동과 수[\s\S]*에너지/.test(note), fmt(note));
await a.shot('notebook');
await pressA('Escape');
await b.js(`[...document.querySelectorAll('.df-hud button')].find((x) => x.textContent.startsWith('힌트 수첩')).click()`);
await wait(500);
check('힌트 수첩: 카드가 없는 학생 B', /힌트 수첩 \(0\/4\)/.test((await b.dialogText()) ?? '') && /아직 얻은 힌트 카드가 없습니다/.test((await b.dialogText()) ?? ''),
  fmt(await b.dialogText()));
await b.js(`[...document.querySelectorAll('.df-dialog .df-button')].find((x) => x.textContent === '닫기').click()`);

// ---- 선생님: CCTV 끄고 다시 돌아다니기 ----
await clickText(teacher, '.df-cctv button', 'CCTV 끄기');
check('CCTV 끄기: 창이 닫히고 살펴보기 단추가 돌아옴',
  (await teacher.js(`!document.querySelector('.df-cctv') && !document.querySelector('.df-action').hidden && __df.cctv() === null`)) === true);
await teacher.js(`__df.teleport(11.5, 8.5)`);
await wait(200);
const tPos3 = await teacher.js(`__df.pos()`);
await teacher.press('ArrowRight', 400);
check('CCTV를 끄면 선생님이 다시 움직임', (await teacher.js(`__df.pos().col`)) - tPos3.col > 0.5);

// ---- 골든벨 ----
// 학생 A는 교실에서 칠판을 본 뒤 골든벨에 갔다가 같은 자리, 같은 진행으로 돌아와야 한다.
await a.js(`__df.teleport(9, 2.5)`);
await pressA('Space');
await pressA('Space');
const aBefore = await a.js(`__df.pos()`);

// ---- 2부 열기: 복도의 2부 문이 모두에게 열리고, 2부 사물(실험 장치, 전구)이 보인다 ----
check('학생 화면에는 2부 열기 단추가 없음', (await a.js(`[...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === '2부 열기').hidden`)) === true);
await a.js(`__df.teleport(63.5, 14.5)`);
await a.press('ArrowRight', 700);
const hiddenA = async () => (await a.js(`__df.hidden()`)) ?? [];
check('2부 열기 전: 복도의 2부 문을 지나가지 못하고 2부 사물은 보이지 않음',
  (await a.js(`__df.pos().col`)) <= 64.71 && (await hiddenA()).includes('apparatus') && (await hiddenA()).includes('bulb-1'),
  `col ${(await a.js(`__df.pos().col`)).toFixed(2)}, 감춤 ${(await hiddenA()).join(',')}`);
await clickText(teacher, '.df-hud button', '2부 열기');
await wait(400);
check('2부 열기: 되돌릴 수 없다는 확인 창(취소하면 그대로)', /다시 닫을 수 없습니다/.test((await teacher.dialogText()) ?? ''), fmt(await teacher.dialogText()));
await clickText(teacher, '.df-dialog .df-button', '취소');
await wait(300);
check('2부 열기: 취소하면 1부 그대로', (await a.js(`__df.part()`)) === 1);
await clickText(teacher, '.df-hud button', '2부 열기');
await wait(400);
await clickText(teacher, '.df-dialog .df-button', '2부 열기');
await wait(500);
const banner = (pg) => pg.js(`(() => { const n = document.querySelector('.df-banner:not(.df-announce)'); return n && !n.hidden ? n.innerText : null; })()`);
check('2부 열기: 학생 화면 가운데 큰 알림과 미니맵의 2부 문 표시', /2부가 열렸습니다/.test((await banner(a)) ?? '') && (await a.js(`__df.mapMark()`)) === 'part2-door',
  `${fmt(await banner(a))} | ${await a.js(`__df.mapMark()`)}`);
await a.shot('part2-banner');
check('2부 열기: 서버 상태가 2부, 단추는 "2부 열림"으로 잠김',
  (await a.js(`__df.part()`)) === 2 &&
    (await teacher.js(`(() => { const b = [...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === '2부 열림'); return !!b && b.disabled; })()`)) === true);
await a.press('ArrowRight', 1000);
check('2부 열기 뒤: 2부 문을 지나 2부 복도로', (await a.js(`__df.pos().col`)) > 67 && (await placeOf(a)) === '복도(2부)',
  `col ${(await a.js(`__df.pos().col`)).toFixed(2)}, ${await placeOf(a)}`);
check('2부 열기 뒤: 2부 사물(실험 장치, 전구)이 보임', !(await hiddenA()).includes('apparatus') && !(await hiddenA()).includes('bulb-1'), (await hiddenA()).join(','));
await a.shot('part2');
await a.js(`__df.teleport(${aBefore.col}, ${aBefore.row})`);
await wait(300);

// ---- 미니게임(서버 DF_MINI_FAST=1: 보물찾기 20초, 공 피하기 20초, 줄다리기 10초) ----
const miniOf = (pg) => pg.js(`__df.mini()`);
/** 선생님이 미니게임 시작 → 고르기 → 확인 */
async function startMini(name) {
  await clickText(teacher, '.df-hud button', '미니게임 시작');
  await wait(600);
  const pick = (await teacher.dialogText()) ?? '';
  const icons = await teacher.js(`document.querySelectorAll('.df-dialog .df-choice-icon').length`);
  await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.startsWith(${JSON.stringify(name)})).click()`);
  await wait(500);
  const confirmText = (await teacher.dialogText()) ?? '';
  await clickText(teacher, '.df-dialog .df-button', '시작하기');
  await wait(500);
  return { pick, confirmText, icons };
}
/** 결과 단계가 될 때까지 기다린다(최대 sec초) */
async function untilPhase(pg, phase, sec) {
  for (let i = 0; i < sec * 4 && (await miniOf(pg)).phase !== phase; i++) await wait(250);
  return (await miniOf(pg)).phase === phase;
}
/** 선생님이 결과 창을 닫는다(미니게임 그만두기 → 확인) */
async function closeMini() {
  await clickText(teacher, '.df-dialog .df-button', '닫기');
  await wait(300);
  await clickText(teacher, '.df-hud button', '미니게임 그만두기');
  await wait(400);
  await clickText(teacher, '.df-dialog .df-button', '그만두기');
  await wait(800);
}
const aHome = await a.js(`__df.pos()`);
await b.js(`__df.teleport(11.5, 8.5)`);
await wait(300);

// 보물찾기
const tr = await startMini('보물찾기');
check('미니게임: 선생님 고르기 창(보물찾기·공 피하기·줄다리기, 그림)과 확인 창',
  /보물찾기[\s\S]*공 피하기[\s\S]*줄다리기/.test(tr.pick) && tr.icons === 3 && /3초 뒤/.test(tr.confirmText),
  `${fmt(tr.pick)} | ${fmt(tr.confirmText)}`);
check('미니게임: 시작 전 3초 세기(큰 숫자)', (await miniOf(a)).phase === 'count' && /^[123]$/.test((await a.js(`document.querySelector('.df-mini-count')?.textContent`)) ?? ''),
  JSON.stringify(await miniOf(a)));
check('미니게임: 선생님 단추는 "미니게임 그만두기"', (await teacher.js(`[...document.querySelectorAll('.df-hud button')].some((b) => b.textContent === '미니게임 그만두기')`)) === true);
await untilPhase(a, 'play', 6);
const spots = await a.js(`__df.treasures()`);
check('보물찾기: 보물 30개(금 5개)가 모두에게 같은 자리', spots.length === 30 && spots.filter((t) => t[3]).length === 5 && JSON.stringify(await b.js(`__df.treasures()`)) === JSON.stringify(spots),
  `${spots.length}개`);
check('보물찾기: 안내 칸에 "미니게임 중", 사물은 살펴볼 수 없음', /미니게임 중/.test(await placeLine(a)), await placeLine(a));
await a.shot('mini-treasure');
const gold = spots.find((t) => t[3]);
await a.js(`__df.teleport(${gold[1]}, ${gold[2]})`);
await wait(800);
check('보물찾기: 금 보물에 닿으면 3점, 모두의 화면에서 사라짐', (await miniOf(a)).score === 3 && !(await b.js(`__df.treasures()`)).some((t) => t[0] === gold[0]),
  JSON.stringify(await miniOf(a)));
const plain = spots.find((t) => !t[3]);
await b.js(`__df.teleport(${plain[1]}, ${plain[2]})`);
await wait(800);
check('보물찾기: 보통 보물은 1점', (await miniOf(b)).score === 1, JSON.stringify(await miniOf(b)));
check('보물찾기: 끝나면 결과 창(1위 가람)', (await untilPhase(a, 'result', 25)) && /보물찾기 결과/.test((await a.dialogText()) ?? '') && /1위\s*가람/.test((await a.dialogText()) ?? '') &&
  /내 등수 1위/.test((await a.dialogText()) ?? ''), fmt(await a.dialogText()));
await a.shot('mini-treasure-result');
await teacher.shot('mini-treasure-result');
await wait(300);
check('보물찾기: 끝나면 시작 전 자리로 돌아감', Math.abs((await a.js(`__df.pos().col`)) - aHome.col) < 0.05 && Math.abs((await a.js(`__df.pos().row`)) - aHome.row) < 0.05,
  JSON.stringify(await a.js(`__df.pos()`)));
await closeMini();
check('미니게임: 그만두기로 결과 창을 닫으면 처음으로', (await miniOf(a)).phase === '' && (await a.dialogText()) === null && /교실/.test(await placeLine(a)), JSON.stringify(await miniOf(a)));

// 공 피하기
await startMini('공 피하기');
await untilPhase(a, 'play', 6);
const inArena = async (pg) => { const p = await pg.js(`__df.pos()`); return p.col >= 2 && p.col <= 46 && p.row >= 20 && p.row <= 35; };
check('공 피하기: 모두 운동장 안으로 옮김', (await inArena(a)) && (await inArena(b)), `${JSON.stringify(await a.js(`__df.pos()`))} ${JSON.stringify(await b.js(`__df.pos()`))}`);
const ap = await a.js(`__df.pos()`);
await a.js(`__df.teleport(${ap.col}, 20.4)`);
await a.press('ArrowUp', 500);
check('공 피하기: 운동장 밖으로 나가지 못함(보이지 않는 울타리)', (await a.js(`__df.pos().row`)) >= 19.95, String(await a.js(`__df.pos().row`)));
await wait(2500);
await a.shot('mini-dodge');
check('공 피하기: 공에 맞으면 탈락해 구경하거나 끝까지 남음', (await untilPhase(a, 'result', 30)) && /공 피하기 결과/.test((await a.dialogText()) ?? '') && /초/.test((await a.dialogText()) ?? ''),
  fmt(await a.dialogText()));
check('공 피하기: 결과의 점수는 버틴 시간', (await teacher.js(`__df.others().filter((o) => o.role === 'student').every((o) => o.miniScore > 0)`)) === true);
await teacher.shot('mini-dodge-result');
await closeMini();
check('공 피하기: 끝나면 시작 전 자리로', Math.abs((await a.js(`__df.pos().col`)) - aHome.col) < 0.05, JSON.stringify(await a.js(`__df.pos()`)));

// 줄다리기: A(AI.SW반)가 많이 누르고 B(수과학반)는 조금 누른다. 이긴 반은 다음 골든벨에서 하트 +1
const tg = await startMini('줄다리기');
await untilPhase(a, 'play', 6);
check('줄다리기: 화면 전체 창(두 반 상징, 당기기 단추)', (await a.js(`!!document.querySelector('.df-tug .df-tug-pull') && document.querySelectorAll('.df-tug-emblem').length === 2`)) === true);
const pullA = async (n, gap) => { for (let i = 0; i < n; i++) { await a.js(`document.querySelector('.df-tug-pull').click()`); await wait(gap); } };
const pullsB = (async () => { for (let i = 0; i < 4; i++) { await b.js(`document.querySelector('.df-tug-pull').click()`); await wait(150); } })();
await pullA(20, 100);
await pullsB;
await a.shot('mini-tug');
const tugNow = await a.js(`(() => { const r = document.querySelector('.df-tug-rope'); return Number(r.style.getPropertyValue('--df-tug')); })()`);
check('줄다리기: 줄 리본이 AI.SW반 쪽(음수)으로', tugNow < 0, String(tugNow));
await a.press('Space');
const spam = async () => { for (let i = 0; i < 30; i++) await a.js(`document.querySelector('.df-tug-pull').click()`); };
const scoreBefore = (await miniOf(a)).score;
await spam();
await wait(500);
check('줄다리기: 1초에 12번 넘게 누른 것은 세지 않음', (await miniOf(a)).score - scoreBefore <= 13, `${scoreBefore} → ${(await miniOf(a)).score}`);
check('줄다리기: 끝나면 이긴 반과 반별 평균, 이긴 반 학생에게 하트', (await untilPhase(a, 'result', 20)) && /AI\.SW반이 이겼습니다/.test((await a.dialogText()) ?? '') &&
  /수과학반 평균/.test((await a.dialogText()) ?? '') && (await miniOf(a)).heart === true && (await miniOf(b)).heart === false, fmt(await a.dialogText()));
await a.shot('mini-tug-result');
await closeMini();
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(500);
check('CCTV 목록에 "미니게임 하트"', /미니게임 하트/.test((await rowText('가람')) ?? '') && !/미니게임 하트/.test((await rowText('나래')) ?? ''), fmt(await rowText('가람')));
await clickText(teacher, '.df-cctv button', 'CCTV 끄기');
await wait(300);
await a.js(`__df.teleport(${aBefore.col}, ${aBefore.row})`);
await wait(300);

// ---- 선생님 전체 공지: 모두의 화면 가운데에 "선생님 공지"로 뜨고, 누르면 닫힌다 ----
const shout = (pg) => pg.js(`__df.announcement()`);
const closeShout = (pg) => pg.js(`document.querySelector('.df-announce:not([hidden])')?.click()`);
/** 열린 전체 공지 창에 글을 쓴다(input 이벤트까지). */
const writeShout = (pg, text) => pg.js(`(() => { const i = document.querySelector('.df-dialog .df-input'); i.value = ${JSON.stringify(text)};
  i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const shoutSendDisabled = (pg) => pg.js(`[...document.querySelectorAll('.df-dialog .df-button')].find((b) => b.textContent === '보내기')?.disabled ?? null`);
check('전체 공지: 학생 화면에는 단추가 없음', (await a.js(`[...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === '전체 공지').hidden`)) === true);
await clickText(teacher, '.df-hud button', '전체 공지');
await wait(400);
check('전체 공지: 선생님이 누르면 글 칸(100자)이 있는 창, 빈 글이면 보내기가 잠김',
  /전체 공지/.test((await teacher.dialogText()) ?? '') && (await teacher.js(`document.querySelector('.df-dialog .df-input')?.maxLength`)) === 100 &&
    (await shoutSendDisabled(teacher)) === true, fmt(await teacher.dialogText()));
await writeShout(teacher, '   ');
await teacher.js(`document.querySelector('.df-dialog form').requestSubmit()`);
await wait(500);
check('전체 공지: 빈칸만 쓴 글은 보내지 않음(창은 그대로, 아무에게도 뜨지 않음)',
  (await shoutSendDisabled(teacher)) === true && (await teacher.dialogText()) !== null && (await shout(a)) === null && (await shout(teacher)) === null);
const SHOUT = '모두 강당 앞으로 모입니다';
await writeShout(teacher, `  ${SHOUT}  `);
await clickText(teacher, '.df-dialog .df-button', '보내기');
await wait(600);
const shouts = [await shout(a), await shout(b), await shout(teacher)];
check('전체 공지: 학생 A·B와 보낸 선생님 화면 가운데에 "선생님 공지"와 같은 글(앞뒤 빈칸 자름), 창은 닫힘',
  shouts.every((s) => s?.title === '선생님 공지' && s?.text === SHOUT) && (await teacher.dialogText()) === null, JSON.stringify(shouts));
await a.shot('announce');
await closeShout(a);
await wait(200);
check('전체 공지: 누르면 바로 닫힘(다른 사람 화면은 그대로)', (await shout(a)) === null && (await shout(b))?.text === SHOUT);
check('전체 공지: 2초 안에 다시 보내면 막힘', /방금 공지를 보냈습니다/.test((await teacher.js(`__df.announce('한 번 더')`)) ?? ''));
await closeShout(b);
await closeShout(teacher);
const studentShout = await a.js(`__df.announce('학생이 보낸 공지')`);
await wait(600);
check('전체 공지: 학생이 보내면 거절되고 아무에게도 가지 않음', /선생님만/.test(studentShout ?? '') &&
  (await shout(a)) === null && (await shout(b)) === null && (await shout(teacher)) === null, studentShout);
await wait(1600);
check('전체 공지: 빈칸만 보내면 서버도 막음', /보낼 글/.test((await teacher.js(`__df.announce('  \\n ')`)) ?? ''));
const HTML_SHOUT = '<b>굵게</b> <img src=x onerror="window.__xss=1">';
check('전체 공지: 태그가 든 글도 보냄', (await teacher.js(`__df.announce(${JSON.stringify(HTML_SHOUT)})`)) === null);
await wait(600);
const htmlShout = await shout(b);
check('전체 공지: 태그가 든 글은 글자 그대로 보임(HTML로 읽지 않음)', htmlShout?.text === HTML_SHOUT && !/<img/.test(htmlShout?.html ?? '') &&
  (await b.js(`window.__xss ?? null`)) === null, htmlShout?.html);
await wait(2100);
check('전체 공지: 100자가 넘으면 100자로 자름', (await teacher.js(`__df.announce('가'.repeat(150))`)) === null);
await wait(600);
check('전체 공지: 100자로 잘린 글이 뜸', (await shout(a))?.text === '가'.repeat(100), String((await shout(a))?.text.length));
for (const pg of [a, b, teacher]) await closeShout(pg);
await wait(200);

// ---- 강당으로 모으기: 문제 파일과 시간을 고르면 남은 시간이 모두에게 보이고, 0이 되면 골든벨 맵으로 ----
/** 선생님이 강당으로 모으기를 누르고 확인용 골든벨 파일을 고른 뒤 시간(단추 글)을 고른다. */
async function gather(when, file = '확인용 골든벨') {
  await clickText(teacher, '.df-hud button', '강당으로 모으기');
  await wait(800);
  const files = (await teacher.dialogText()) ?? '';
  await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes(${JSON.stringify(file)})).click()`);
  await wait(300);
  const times = (await teacher.dialogText()) ?? '';
  await clickText(teacher, '.df-dialog .df-choice span', when);
  await wait(800);
  return { files, times };
}
const notice = (pg) => pg.js(`(() => { const n = document.querySelector('.df-hud-notice'); return n && !n.hidden ? n.innerText : null; })()`);
const { files: pick, times } = await gather('1분 뒤');
check('강당으로 모으기: 문제 파일 목록(틀린 파일은 까닭과 함께 막힘)',
  /확인용 골든벨 \(12문제\)/.test(pick) && /broken\.yaml/.test(pick) && /1번 문제: OX 문제의 answer는 O 또는 X로 씁니다/.test(pick) &&
    /3번 문제: nonsense\(넌센스 문제\)는 true 또는 false로 씁니다/.test(pick),
  fmt(pick));
check('강당으로 모으기: 시간 고르기(바로, 1·3·5분)', /지금 바로 옮기기/.test(times) && /1분 뒤/.test(times) && /3분 뒤/.test(times) && /5분 뒤/.test(times), fmt(times));
check('강당으로 모으기: 큰 알림과 미니맵의 강당 표시', /강당으로 모입니다/.test((await banner(b)) ?? '') && (await b.js(`__df.mapMark()`)) === 'auditorium',
  `${fmt(await banner(b))} | ${await b.js(`__df.mapMark()`)}`);
check('강당으로 모으기: 학생 화면에 남은 시간과 안내', /강당으로 모입니다 · 남은 시간 (1분 0초|5\d초)/.test((await notice(a)) ?? '') && /확인용 골든벨/.test((await notice(b)) ?? ''),
  fmt(await notice(a)));
check('강당으로 모으기: 선생님 화면에도 안내, 단추는 "모으기 그만두기"',
  (await notice(teacher)) !== null && (await teacher.js(`[...document.querySelectorAll('.df-hud button')].some((b) => b.textContent === '모으기 그만두기')`)) === true);
await a.shot('gather');
const left0 = (await a.js(`__df.gather()`)).left;
await wait(2100);
const left1 = (await a.js(`__df.gather()`)).left;
check('강당으로 모으기: 남은 시간이 줄어듦', left1 < left0 && left1 > 0, `${left0} → ${left1}`);
await clickText(teacher, '.df-hud button', '모으기 그만두기');
await wait(500);
check('모으기 그만두기: 안내가 사라지고 학교 맵에 그대로', (await notice(a)) === null && (await a.js(`__df.map()`)) === 'school' &&
  (await teacher.js(`[...document.querySelectorAll('.df-hud button')].some((b) => b.textContent === '강당으로 모으기')`)) === true);
await gather('1분 뒤');
// 남은 시간이 0이 될 때까지 기다린다(1분).
for (let i = 0; i < 70 && (await a.js(`__df.map()`)) !== 'goldenbell'; i++) await wait(1000);
await wait(1200);
const maps = async () => [await teacher.js(`__df.map()`), await a.js(`__df.map()`), await b.js(`__df.map()`)].join(',');
check('강당으로 모으기: 0이 되면 모두 골든벨 맵으로 옮겨 감', (await maps()) === 'goldenbell,goldenbell,goldenbell', await maps());
const gbCard = (pg) => pg.js(`document.querySelector('.df-gb')?.innerText ?? null`);
const gbPanel = () => teacher.js(`document.querySelector('.df-gb-panel')?.innerText ?? null`);
check('골든벨: 시작 안내와 목숨 3개', /선생님이 첫 문제를 내면/.test((await gbCard(a)) ?? '') && /목숨 ♥♥♥/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
check('골든벨: 선생님 창에 학생 2명, 첫 문제 단추', /학생 2명/.test((await gbPanel()) ?? '') && /첫 문제/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
// 골든벨 맵에서도 전체 공지(선생님 창의 단추)
await teacher.js(`[...document.querySelectorAll('.df-gb-panel button')].find((x) => x.textContent === '전체 공지').click()`);
await wait(400);
await writeShout(teacher, '골든벨 곧 시작합니다');
await clickText(teacher, '.df-dialog .df-button', '보내기');
await wait(600);
check('전체 공지: 골든벨 맵에서도 선생님 창 단추로 보내고 모두에게 뜸',
  [await shout(a), await shout(b), await shout(teacher)].every((s) => s?.text === '골든벨 곧 시작합니다'), JSON.stringify(await shout(b)));
await wait(10000);
check('전체 공지: 10초 뒤 사라짐', (await shout(a)) === null && (await shout(b)) === null);
await a.js(`[...document.querySelectorAll('.df-gb button')].find((x) => x.textContent.startsWith('힌트 수첩')).click()`);
await wait(500);
check('골든벨 중에도 힌트 수첩을 봄(4/4)', /힌트 수첩 \(4\/4\)/.test((await a.dialogText()) ?? '') && /운동량/.test((await a.dialogText()) ?? ''), fmt(await a.dialogText()));
await a.press('Escape');
await wait(300);
const looks = (pg) => pg.js(`__df.looks()`);
let la = await looks(a);
check('골든벨: 머리 위에 목숨(보너스와 줄다리기를 이긴 A는 하트 5개, B는 3개)', la.me.tag === '♥♥♥♥♥' && la.others['나래']?.tag === '♥♥♥' && la.others['선생님']?.tag === null,
  JSON.stringify(la));
await teacher.shot('gb-ready');
const gm = (await a.js(`__df.camera()`)).map;
check('골든벨 맵은 화면에 전체가 맞춰짐(따라가지 않음)', gm.x >= 0 && gm.y >= 0 && gm.x + gm.w <= aw && gm.y + gm.h <= ah,
  `맵 화면 ${gm.x.toFixed(0)},${gm.y.toFixed(0)} ${gm.w.toFixed(0)}×${gm.h.toFixed(0)}`);

// 골든벨 맵의 답 구역 가운데쯤(구역은 4행부터, 가운데 9열은 통로)
const ZONE = { O: [4.5, 6.5], X: [14.5, 6.5], 1: [4.5, 6.5], 2: [14.5, 6.5], 3: [4.5, 12.5], 4: [14.5, 12.5], 밖: [9.5, 6.5] };
const nextButton = () => teacher.js(`document.querySelector('.df-gb-panel .df-row > .df-button:not(.df-button-small):not(.df-gb-close)').click()`);
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
  check('골든벨 1번: 문제와 남은 시간', /1\/12번 문제 · OX · 남은 시간 \d초/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
  check('골든벨 1번: 내가 서 있는 곳', /서 있는 곳: O/.test((await gbCard(a)) ?? '') && /서 있는 곳: 구역 밖/.test((await gbCard(b)) ?? ''));
  check('골든벨 1번: 선생님 창에 구역별 인원', /O 1명 · X 0명 · 구역 밖 1명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
  await teacher.shot('gb-question');
  la = await looks(a);
  const lt = await looks(teacher);
  check('골든벨 1번: 문제가 시작되면 학생 화면의 다른 학생이 흐려짐', la.others['나래'].alpha > 0 && la.others['나래'].alpha < 1, JSON.stringify(la.others['나래']));
  check('골든벨 1번: 선생님 화면은 모두 보임', lt.others['가람'].alpha === 1 && lt.others['나래'].alpha === 1, JSON.stringify(lt.others));
  await wait(1600);
  la = await looks(a);
  check('골든벨 1번: 2초 뒤 다른 학생은 사라지고 나만 보임', la.others['나래'].alpha === 0 && la.others['선생님'].alpha === 0 && la.me.alpha === 1,
    JSON.stringify(la));
  await a.shot('gb-alone');
});
check('골든벨 1번: 맞힌 학생 A', /정답: O/.test((await gbCard(a)) ?? '') && /맞았습니다. 점수가 1점 올랐습니다/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
check('골든벨 1번: 구역 밖이면 틀림, 목숨 2개', /구역 밖에 있어 틀린 것으로 셉니다. 틀렸습니다. 목숨이 2개 남았습니다/.test((await gbCard(b)) ?? ''), fmt(await gbCard(b)));
check('골든벨 1번: 선생님 창에 맞힌 수', /맞힌 학생 1명 · 틀린 학생 1명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
la = await looks(a);
check('골든벨 1번: 정답 공개 때 다시 모두 보이고 목숨이 줄어 보임', la.others['나래'].alpha === 1 && la.others['나래'].tag === '♥♥♡' && (await looks(b)).me.tag === '♥♥♡',
  JSON.stringify(la.others['나래']));
await b.shot('gb-wrong');

await gbRound(3, 1, async () => {
  check('골든벨 2번: 객관식 구역별 인원', /1 1명 · 2 0명 · 3 1명 · 4 0명 · 구역 밖 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
  await a.shot('gb-choice');
});
check('골든벨 2번: 객관식 정답은 번호와 보기', /정답: 3\. 다/.test((await gbCard(a)) ?? '') && /목숨이 1개 남았습니다/.test((await gbCard(b)) ?? ''), fmt(await gbCard(b)));

await gbRound('X', 'O');
check('골든벨 3번: 목숨을 다 잃으면 탈락', /탈락했습니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === true, fmt(await gbCard(b)));
la = await looks(a);
check('골든벨 3번: 탈락한 학생은 머리 위에 해골 2개, 흐리게 보임', la.others['나래'].tag === '💀💀' && la.others['나래'].alpha < 1, JSON.stringify(la.others['나래']));

await gbRound('O', 'O');
check('골든벨 4번: 탈락 중 맞히면 부활까지 남은 수, 점수는 그대로',
  /1문제를 더 맞히면 다시 살아납니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbScore === 0, fmt(await gbCard(b)));
check('골든벨 4번: 맞히면 해골이 하나 없어짐', (await looks(b)).me.tag === '💀' && (await looks(a)).others['나래'].tag === '💀', JSON.stringify((await looks(b)).me));

await gbRound(2, 2, async () => {
  check('골든벨 5번: 보기가 3개면 구역도 3개', /1 0명 · 2 2명 · 3 0명 · 구역 밖 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
});
check('골든벨 5번: 2문제를 맞혀 목숨 1개로 다시 살아남',
  /목숨 1개로 다시 살아났습니다/.test((await gbCard(b)) ?? '') && /목숨 ♥♡♡/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === false &&
    (await looks(b)).me.tag === '♥♡♡',
  fmt(await gbCard(b)));

await gbRound('X', 'X');
check('골든벨 6번: 부활 뒤 맞힌 문제는 점수에 들어감', (await gbOf('나래')).gbScore === 1, JSON.stringify(await gbOf('나래')));
await gbRound('O', 'O');
check('골든벨 7번: 살아 있는 동안 맞힌 문제는 계속 점수에 들어감', (await gbOf('나래')).gbScore === 2 && (await gbOf('가람')).gbScore === 7,
  `가람 ${(await gbOf('가람')).gbScore}점, 나래 ${(await gbOf('나래')).gbScore}점`);
// ---- 골든벨 단답형(8·9번) ----
const answerBox = (pg) => pg.js(`(() => { const i = document.querySelector('.df-gb-answer-input'); return i && !i.closest('form').hidden; })()`);
const submitShort = (pg, text) => pg.js(`(() => { const i = document.querySelector('.df-gb-answer-input'); i.value = ${JSON.stringify(text)}; i.form.requestSubmit(); })()`);
const gbPhase = () => teacher.js(`__df.gb().phase`);
async function waitReveal() {
  for (let i = 0; i < 40 && (await gbPhase()) !== 'reveal'; i++) await wait(250);
  await wait(300);
}
const answersPanel = () => teacher.js(`document.querySelector('.df-gb-answers')?.innerText ?? null`);
const clickPanel = async (label) => {
  await clickText(teacher, '.df-gb-answers button', label);
  await wait(500);
};

await nextButton();
await wait(500);
check('골든벨 8번: 단답형은 학생에게 답 칸, 선생님에게는 없음',
  (await answerBox(a)) === true && (await answerBox(b)) === true && (await answerBox(teacher)) === false && /단답형/.test((await gbCard(a)) ?? ''),
  fmt(await gbCard(a)));
check('골든벨 8번: 키보드 기기는 답 칸에 바로 쓸 수 있고, 터치 기기는 아님',
  (await a.js(`document.activeElement?.classList.contains('df-gb-answer-input')`)) === true &&
    (await b.js(`document.activeElement?.classList.contains('df-gb-answer-input')`)) === false);
await submitShort(a, '10');
await wait(400);
check('골든벨 8번: 낸 답이 보이고 선생님 창에 낸 학생 수', /낸 답: 10/.test((await gbCard(a)) ?? '') && /답을 낸 학생 1명 · 내지 않은 학생 1명/.test((await gbPanel()) ?? ''),
  `${fmt(await gbCard(a))} | ${fmt(await gbPanel())}`);
check('골든벨 8번: 정답 공개 전에는 낸 답이 다른 사람에게 가지 않음',
  (await gbOf('가람')).gbAnswer === '' && (await b.js(`__df.others().find((o) => o.nickname === '가람').gbAnswer`)) === '' && (await teacher.js(`__df.gb().answer`)) === '');
const aWalk0 = await a.js(`__df.pos().col`);
await a.press('ArrowRight', 300);
check('골든벨 8번: 답을 낸 뒤에도 걸을 수 있음', (await a.js(`__df.pos().col`)) > aWalk0 + 0.1);
await submitShort(a, '10 m/s');
await submitShort(b, '십');
await wait(400);
check('골든벨 8번: 고쳐 내도 낸 학생 수는 그대로(2명)', /답을 낸 학생 2명/.test((await gbPanel()) ?? '') && /낸 답: 10 m\/s/.test((await gbCard(a)) ?? ''), fmt(await gbPanel()));
await a.shot('gb-short');
await waitReveal();
check('골든벨 8번: 마지막에 낸 답으로 채점, 해설이 보임',
  /정답: 10 m\/s/.test((await gbCard(a)) ?? '') && /내 답: 10 m\/s · 맞았습니다/.test((await gbCard(a)) ?? '') && /해설: 해설 8/.test((await gbCard(b)) ?? ''),
  fmt(await gbCard(a)));
check('골든벨 8번: 다른 답은 틀림(목숨을 잃어 탈락)', /내 답: 십 · 틀렸습니다\. 목숨을 모두 잃어 탈락/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === true,
  fmt(await gbCard(b)));
check('골든벨 8번: 선생님 창에 낸 답 묶음과 인정 단추',
  /10 m\/s\s*1명 · 정답/.test((await answersPanel()) ?? '') && /십\s*1명 · 오답\s*나래\s*정답으로 인정/.test((await answersPanel()) ?? ''), fmt(await answersPanel()));
await teacher.shot('gb-short-answers');
await clickPanel('정답으로 인정');
check('골든벨 8번: 선생님이 인정하면 다시 채점(살아남, 점수 3점)',
  /선생님이 정답으로 인정했습니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === false && (await gbOf('나래')).gbScore === 3 &&
    (await gbOf('나래')).gbLives === 1 && /인정 거두기/.test((await answersPanel()) ?? ''),
  `${fmt(await gbCard(b))} | ${JSON.stringify(await gbOf('나래'))}`);
check('골든벨 8번: 인정하면 맞힌 학생 수도 바뀜', /맞힌 학생 2명 · 틀린 학생 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
await clickPanel('인정 거두기');
check('골든벨 8번: 인정을 거두면 처음 채점으로(탈락, 2점)', (await gbOf('나래')).gbOut === true && (await gbOf('나래')).gbScore === 2 && /틀렸습니다/.test((await gbCard(b)) ?? ''),
  JSON.stringify(await gbOf('나래')));
await clickPanel('정답으로 인정');

await nextButton();
await wait(500);
check('골든벨 9번: 새 문제가 되면 답 칸이 비어 있음', (await a.js(`document.querySelector('.df-gb-answer-input').value`)) === '' && !/낸 답: /.test((await gbCard(a)) ?? ''));
await submitShort(a, '나,가');
await waitReveal();
check('골든벨 9번: 쉼표 답은 순서를 바꿔도 맞음', /정답: 가, 나/.test((await gbCard(a)) ?? '') && /내 답: 나,가 · 맞았습니다/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
check('골든벨 9번: 답을 내지 않으면 틀림', /답을 내지 않아 틀린 것으로 셉니다/.test((await gbCard(b)) ?? '') && /\(답을 내지 않음\)/.test((await answersPanel()) ?? ''),
  fmt(await gbCard(b)));
check('골든벨 9번: 목숨을 다 잃은 B는 탈락', (await gbOf('나래')).gbOut === true, JSON.stringify(await gbOf('나래')));

// ---- 넌센스(11·12번) ----
await gbRound('X', 'X');
check('골든벨 10번: A는 틀려 목숨 4개(보너스·미니게임 하트), 탈락한 B는 틀려 해골 2개 그대로', (await gbOf('가람')).gbLives === 4 && (await looks(b)).me.tag === '💀💀',
  `${JSON.stringify(await gbOf('가람'))} | ${(await looks(b)).me.tag}`);
await nextButton();
await wait(500);
check('골든벨 11번: 넌센스 문제 안내', /11\/12번 문제 · 단답형 · 넌센스 · 맞히면 하트 \+1/.test((await gbCard(a)) ?? '') && /넌센스/.test((await gbPanel()) ?? ''),
  fmt(await gbCard(a)));
await submitShort(a, '관성이요');
await submitShort(b, '관성이에요');
await a.shot('gb-nonsense');
await waitReveal();
check('골든벨 11번: 말끝을 붙인 답도 맞음, 살아 있는 A는 하트 +1(점수 그대로)',
  /내 답: 관성이요 · 맞았습니다\. 하트 \+1 · 목숨 4개/.test((await gbCard(a)) ?? '') && (await gbOf('가람')).gbLives === 4 && (await gbOf('가람')).gbScore === 9,
  `${fmt(await gbCard(a))} | ${JSON.stringify(await gbOf('가람'))}`);
check('골든벨 11번: 탈락한 B는 부활 1개로 셈(해골 1개, 점수 그대로)',
  (await looks(b)).me.tag === '💀' && (await gbOf('나래')).gbScore === 3 && /1문제를 더 맞히면/.test((await gbCard(b)) ?? ''),
  `${fmt(await gbCard(b))} | ${JSON.stringify(await gbOf('나래'))}`);
await gbRound('O', '밖');
check('골든벨 12번: 넌센스는 틀려도 목숨을 잃지 않음',
  /넌센스 문제라 목숨을 잃지 않습니다/.test((await gbCard(a)) ?? '') && (await gbOf('가람')).gbLives === 4 && (await looks(b)).me.tag === '💀',
  fmt(await gbCard(a)));
check('골든벨 12번: 마지막 문제 뒤 단추는 결과 보기', /결과 보기/.test((await gbPanel()) ?? ''));
await nextButton();
await wait(500);
check('골든벨 결과: 선생님 창에 순위', /1위 가람 9점/.test((await gbPanel()) ?? '') && /2위 나래 3점/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
check('골든벨 결과: 학생 화면에 내 점수와 순위', /내 점수 9점/.test((await gbCard(a)) ?? '') && /1위 가람 9점/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
await teacher.shot('gb-end');

// 골든벨 중에 들어온 학생은 골든벨 맵에서 시작한다.
const c = await openPage('student-c', baseUrl);
await c.enter({ nickname: '다온', code });
await wait(500);
check('골든벨 중에 들어온 학생 C는 골든벨 맵에서 시작', (await c.js(`__df?.map()`)) === 'goldenbell' && /골든벨이 끝났습니다/.test((await gbCard(c)) ?? ''),
  `${await c.js(`__df?.map()`)}`);

await clickText(teacher, '.df-gb-panel button', '골든벨 끝내기');
await wait(400);
check('골든벨 끝내기: 확인 창이 뜨고 취소하면 그대로', /골든벨을 끝내고 모두 학교로/.test((await teacher.dialogText()) ?? ''), fmt(await teacher.dialogText()));
await clickText(teacher, '.df-dialog .df-button', '취소');
await wait(300);
check('골든벨 끝내기: 취소하면 골든벨 맵에 그대로', (await maps()) === 'goldenbell,goldenbell,goldenbell', await maps());
await clickText(teacher, '.df-gb-panel button', '골든벨 끝내기');
await wait(400);
await clickText(teacher, '.df-dialog .df-button', '끝내기');
await wait(1200);
check('골든벨 끝: 모두 학교 맵으로 돌아옴', (await maps()) === 'school,school,school' && (await c.js(`__df.map()`)) === 'school', await maps());
const aAfter = await a.js(`__df.pos()`);
check('골든벨 끝: 학생 A가 떠나기 전 자리로 돌아옴', Math.abs(aAfter.col - aBefore.col) < 0.01 && Math.abs(aAfter.row - aBefore.row) < 0.01,
  `${aBefore.col.toFixed(2)}, ${aBefore.row.toFixed(2)} → ${aAfter.col.toFixed(2)}, ${aAfter.row.toFixed(2)}`);
await wait(300);
check('골든벨 끝: 방탈출 진행이 그대로(칠판)', (await gbOf('가람')).done.includes('blackboard'), JSON.stringify((await gbOf('가람')).done));

// ---- 골든벨 두 번째 판: 마감 단추(모두 답을 내면 강조), 합산 순위(1부+2부 합계)와 반 대항, 합계 처음으로 ----
const aScore1 = (await gbOf('가람')).gbScore;
await gather('지금 바로 옮기기', '확인용 2판');
await wait(1200);
check('두 번째 판: 모두 골든벨 맵으로', (await maps()) === 'goldenbell,goldenbell,goldenbell', await maps());
check('두 번째 판: 보너스·미니게임 하트는 한 번만(A도 하트 3개)', (await gbOf('가람')).gbLives === 3, String((await gbOf('가람')).gbLives));
const closeButton = () => teacher.js(`(() => { const b = document.querySelector('.df-gb-close'); return b && !b.hidden ? { text: b.textContent, ready: b.classList.contains('is-ready') } : null; })()`);
await nextButton();
await wait(400);
await a.js(`__df.teleport(${ZONE.O})`);
await b.js(`__df.teleport(${ZONE.X})`);
await c.js(`__df.teleport(${ZONE.밖})`);
await wait(600);
check('마감: 푸는 중에 보이고, 구역 밖 학생이 있으면 강조하지 않음', (await closeButton())?.ready === false, JSON.stringify(await closeButton()));
await c.js(`__df.teleport(${ZONE.O})`);
await wait(600);
check('마감: 모두 구역에 서면 강조(마감(모두 냄))', (await closeButton())?.ready === true && (await closeButton())?.text === '마감(모두 냄)', JSON.stringify(await closeButton()));
await teacher.shot('gb-close-ready');
await clickText(teacher, '.df-gb-close', '마감(모두 냄)');
await wait(800);
check('마감: 남은 시간이 많아도 바로 정답 공개', (await teacher.js(`__df.gb().phase`)) === 'reveal' && /정답: O/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
await nextButton();
await wait(400);
await teacher.js(`document.querySelector('.df-gb-close').click()`);
await wait(800);
await nextButton();
await wait(800);
const panel2 = (await gbPanel()) ?? '';
check('두 번째 판 결과: 이번 판 순위와 1부+2부 합계 순위, 반 대항(평균)', /1부\+2부 합계/.test(panel2) && new RegExp(`가람 ${aScore1 + 1}점`).test(panel2) &&
  /수과학반 평균 [\d.]+점\(\d명\)/.test(panel2) && /AI\.SW반 평균/.test(panel2), fmt(panel2));
check('두 번째 판 결과: 학생 화면에도 합계와 반 대항', /1부\+2부 합계/.test((await gbCard(a)) ?? '') && /반 평균|평균/.test((await gbCard(a)) ?? ''), fmt(await gbCard(a)));
await teacher.shot('gb-totals');
await clickText(teacher, '.df-gb-reset', '합계 처음으로');
await wait(400);
check('합계 처음으로: 확인 창', /합계 점수를 지웁니다/.test((await teacher.dialogText()) ?? ''), fmt(await teacher.dialogText()));
await clickText(teacher, '.df-dialog .df-button', '처음으로');
await wait(600);
check('합계 처음으로: 합계 순위가 사라지고 이번 판만', !/합계/.test((await gbPanel()) ?? '') && (await gbOf('가람')).gbTotal === 0, fmt(await gbPanel()));
await clickText(teacher, '.df-gb-panel button', '골든벨 끝내기');
await wait(400);
await clickText(teacher, '.df-dialog .df-button', '끝내기');
await wait(1200);
check('두 번째 판 끝: 모두 학교 맵으로', (await maps()) === 'school,school,school', await maps());

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
const teacher2 = await openPage('teacher2', touchUrl, { touch: true });
await teacher2.enter({ teacher: true, nickname: '선생님2', code, pw: password });
// 글꼴을 읽은 뒤 장면이 시작되므로 부하가 크면 늦다. 장면(__df)이 뜰 때까지 기다린다.
for (let i = 0; i < 40 && (await teacher2.js(`typeof window.__df?.role === 'function'`)) !== true; i++) await wait(250);
check('선생님이 방 코드로 기존 방에 다시 들어감', (await teacher2.js(`window.__df?.role()`)) === 'teacher' && (await teacher2.js(`__df.code()`)) === code);

// ---- 태블릿 선생님: CCTV 모드에서는 조이스틱 영역이 감춰져 지도 위 학생을 누를 수 있다 ----
await clickText(teacher2, '.df-hud button', 'CCTV 보기');
await wait(400);
// 가람이 지도에 보이게 전체 보기로 둔다(처음에는 학생이 가장 많은 구역을 비춘다).
await teacher2.js(`[...document.querySelectorAll('.df-cctv-view')].find((b) => b.textContent.startsWith('전체'))?.click()`);
await wait(600);
let aAt = null;
for (let i = 0; i < 20 && !aAt; i++) {
  aAt = (await teacher2.js(`window.__df?.screenOf('가람') ?? null`)) ?? null;
  if (!aAt) await wait(250);
}
check('태블릿 선생님: CCTV 지도에 가람이 보임', aAt !== null, JSON.stringify(aAt));
aAt ??= { x: 0, y: 0 };
check('태블릿 선생님: CCTV 모드에서는 조이스틱 영역이 감춰짐',
  (await teacher2.js(`document.querySelector('.df-joystick-zone').hidden && document.elementFromPoint(${vw * 0.25}, ${vh / 2})?.tagName === 'CANVAS'`)) === true);
await teacher2.touch('touchStart', [{ x: aAt.x, y: aAt.y }]);
await teacher2.touch('touchEnd', []);
await wait(500);
check('태블릿 선생님: 지도에서 누른 학생(가람)을 따라감', (await teacher2.js(`__df.cctv()`))?.following === '가람', `누른 곳 ${aAt.x.toFixed(0)}, ${aAt.y.toFixed(0)}`);
await clickText(teacher2, '.df-cctv button', 'CCTV 끄기');
check('태블릿 선생님: CCTV를 끄면 조이스틱 영역이 돌아옴', (await teacher2.js(`!document.querySelector('.df-joystick-zone').hidden`)) === true);

// ---- 모르는 캐릭터 id로 들어오면 서버가 char-01로 받는다 ----
const { Client } = await import('@colyseus/sdk');
const odd = await new Client(new URL('colyseus', baseUrl).href).joinById(code, { nickname: '모름', character: 'char-99' });
await wait(500);
const oddChar = await teacher2.js(`__df.others().find((o) => o.nickname === '모름')?.character ?? null`);
check('모르는 캐릭터 id는 char-01로 받음', oddChar === 'char-01', oddChar);
const oddClass = await teacher2.js(`__df.others().find((o) => o.nickname === '모름')?.classGroup ?? null`);
check('반을 넣지 않고 들어오면 반 없음(\'\')으로 받음', oddClass === '', JSON.stringify(oddClass));
await odd.leave();

// ---- 선생님이 지금 자료를 다시 고르면 아무 일도 없고, 다른 자료로 바꾸면(확인 창) 모두의 진행이 처음으로 ----
await clickText(teacher2, '.df-hud button', '방탈출 자료');
await wait(800);
check('방탈출 자료 다시 고르기: 지금 자료와 처음으로 돌아간다는 안내', /지금 자료: 예시 방탈출\(학교\)/.test((await teacher2.dialogText()) ?? '') &&
  /지금 쓰는 자료/.test((await teacher2.dialogText()) ?? ''), fmt(await teacher2.dialogText()));
await teacher2.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('예시 방탈출')).click()`);
await wait(600);
check('방탈출 자료: 지금 자료를 다시 고르면 아무 일도 없음(진행 그대로)', (await teacher2.dialogText()) === null &&
  (await teacher2.js(`__df.others().find((o) => o.nickname === '가람')`)).done.length > 0 && (await a.js(`__df.hints().length`)) === 4);
await clickText(teacher2, '.df-hud button', '방탈출 자료');
await wait(800);
await teacher2.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('확인용 두 번째')).click()`);
await wait(400);
check('방탈출 자료 바꾸기: 진행이 지워진다는 확인 창', /모든 학생의 방탈출 진행/.test((await teacher2.dialogText()) ?? '') && /바꾸기/.test((await teacher2.dialogText()) ?? ''),
  fmt(await teacher2.dialogText()));
await clickText(teacher2, '.df-dialog .df-button', '바꾸기');
await wait(600);
const aReset = await teacher2.js(`__df.others().find((o) => o.nickname === '가람')`);
check('방탈출 자료를 바꾸면 학생 진행(마친 미션, 힌트 카드, 1부 완료)이 처음으로', aReset.done.length === 0 && !aReset.finished && (await a.js(`__df.hints().length`)) === 0 &&
  /힌트 수첩 0\/0/.test((await a.js(`document.querySelector('.df-hud').innerText`)) ?? ''), JSON.stringify(aReset.done));

check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
console.log(results.join('\n'));
console.log(`캡처: ${outDir}`);
chrome.close();
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
