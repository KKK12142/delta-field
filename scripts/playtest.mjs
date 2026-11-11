// 헤드리스 크롬으로 선생님 1명, 학생 2명이 들어와 학교 맵(교실-복도-실험실-운동장) 방탈출을 해 보고, 선생님은 CCTV 모드로 지켜본 뒤 골든벨을 한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버의 선생님 비밀번호를 DF_TEACHER_PASSWORD로 넘긴다.
// 게임 서버는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell로 켠다(제한 시간이 짧은 확인용 문제 파일).
// 사용: DF_TEACHER_PASSWORD=... pnpm playtest [주소] [캡처 폴더]   기본값: http://localhost:5173/  .run/playtest
// 퀴즈 답 번호와 사물 위치는 src/data/school.json에 맞춰 두었다. 맵 데이터를 바꾸면 함께 고친다.
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
await a.enter({ nickname: '가람', code, character: 'char-03' });
check('학생 A가 방 코드로 들어감', (await a.js(`window.__df?.code()`)) === code);

// ---- 학생 B(태블릿) ----
const b = await openPage('student-b', baseUrl + '?touch=1', { touch: true });
await b.enter({ nickname: '나래', code, character: 'char-05' });
check('학생 B가 들어감', (await b.js(`window.__df?.code()`)) === code);
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
check('학생 B가 조이스틱으로 오른쪽으로 감', bAfter.col - bBefore.col > 1 && Math.abs(bAfter.row - bBefore.row) < 0.05,
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
const placeOf = (pg) => pg.js(`document.querySelector('.df-hud .df-hud-box strong').textContent`);
check('처음 장소는 교실(안내에 보임)', (await a.js(`__df.place()`)) === '교실' && (await placeOf(a)) === '교실', await placeOf(a));
const camAt = async (col, row) => {
  await a.js(`__df.teleport(${col}, ${row})`);
  await wait(1600); // 화면은 조금씩 따라가므로(followLerp) 다 따라갈 때까지 기다린다
  return a.js(`__df.camera()`);
};
const centered = (c) => Math.abs(c.me.x - aw / 2) < 4 && Math.abs(c.me.y - (100 + ah) / 2) < 4;
const c1 = await camAt(16, 14.5);
const c2 = await camAt(32, 14.5);
check('카메라: 내 아바타를 따라감(복도 두 곳 모두 가운데)', centered(c1) && centered(c2) && Math.abs(c2.view.col - c1.view.col - 16) < 0.1,
  `화면 ${c1.me.x.toFixed(0)},${c1.me.y.toFixed(0)} / ${c2.me.x.toFixed(0)},${c2.me.y.toFixed(0)}, 비추는 곳 ${c1.view.col.toFixed(1)} → ${c2.view.col.toFixed(1)}열`);
const shortSide = Math.min(c1.view.w, c1.view.h);
// 확대는 짧은 쪽에 12칸이 보이는 배율에 가장 가까운 1/2 단위(1, 1.5, 2)다.
const idealZoom = Math.min(aw, ah) / (12 * 48);
check('카메라: 확대는 짧은 쪽 12칸 배율에 가장 가까운 1/2 단위', Math.abs(c1.zoom * 2 - Math.round(c1.zoom * 2)) < 1e-9 && Math.abs(c1.zoom - Math.max(1, idealZoom)) <= 0.25,
  `짧은 쪽 ${shortSide.toFixed(1)}칸, 확대 ${c1.zoom.toFixed(3)}(12칸이면 ${idealZoom.toFixed(2)})`);
await a.shot('camera-hall');
const c3 = await camAt(1.5, 2.5);
check('카메라: 맵 구석에서는 맵 밖을 비추지 않음(위쪽은 안내 자리만큼)',
  Math.abs(c3.view.col) < 0.01 && Math.abs(c3.view.row + 100 / c3.zoom / 48) < 0.01, `비추는 곳 왼쪽 위 ${c3.view.col.toFixed(2)}, ${c3.view.row.toFixed(2)}`);
const c4 = await camAt(46.5, 35.5);
check('카메라: 반대쪽 구석도 맵 밖을 비추지 않음', Math.abs(c4.view.col + c4.view.w - 48) < 0.01 && Math.abs(c4.view.row + c4.view.h - 37) < 0.01,
  `비추는 곳 오른쪽 아래 ${(c4.view.col + c4.view.w).toFixed(2)}, ${(c4.view.row + c4.view.h).toFixed(2)}`);
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
check('학생 화면에는 CCTV 단추가 없음', (await a.js(`document.querySelector('.df-hud .df-button-small').hidden`)) === true);
const cctvOffBefore = (await teacher.js(`(() => { const s = window.__df; return s && s.cctv() === null; })()`)) === true;
await clickText(teacher, '.df-hud button', 'CCTV 보기');
await wait(400);
check('CCTV: 창이 뜨고 학생 2명', cctvOffBefore && /학생 2명/.test((await cctvText()) ?? ''), fmt(await cctvText()));
check('CCTV: 목록이 닉네임 순',
  (await teacher.js(`[...document.querySelectorAll('.df-cctv-row-name')].map((n) => n.textContent).join(',')`)) === '가람,나래');
check('CCTV: 처음에는 교실에서 돌아다니는 중, 진행 0/11', /교실 · 돌아다니는 중/.test((await rowText('가람')) ?? '') && /진행 0\/11/.test((await rowText('가람')) ?? ''),
  fmt(await rowText('가람')));
check('CCTV: 오른쪽 안내와 살펴보기 단추를 감춤',
  (await teacher.js(`document.querySelector('.df-action').hidden && !document.querySelector('.df-hud').innerText.includes('가진 물건')`)) === true);
const overviewZoom = (await cctv()).zoom;
const panelLeft = await teacher.js(`document.querySelector('.df-cctv').getBoundingClientRect().left`);
const th = await teacher.js(`innerHeight`);
const ov = (await teacher.js(`__df.camera()`)).map;
check('CCTV 전체 보기: 학교 맵 전체가 지도 자리(위쪽 안내 아래, CCTV 창 왼쪽)에 들어옴',
  ov.x >= 0 && ov.y >= 99 && ov.x + ov.w <= panelLeft && ov.y + ov.h <= th && ov.w > panelLeft * 0.6,
  `맵 화면 ${ov.x.toFixed(0)},${ov.y.toFixed(0)} ${ov.w.toFixed(0)}×${ov.h.toFixed(0)}, 창 왼쪽 ${panelLeft.toFixed(0)}`);
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

// ---- 학생 A: 학교 방탈출 한 판(선생님은 CCTV로 봄) ----
const dialogHas = async (re) => re.test((await a.dialogText()) ?? '');
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
await a.press('Space');
check('열쇠 없이 교실 문: 잠김 안내', await dialogHas(/교실 문이 잠겨/));
await wait(300);
check('CCTV: 잠긴 교실 문을 보는 중(장소 이름과 함께)', /교실 · 교실 문 살펴보는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
await a.press('Enter');
await wait(400);
check('닫은 뒤 다시 열리지 않음', (await a.dialogText()) === null);
check('CCTV: 닫으면 돌아다니는 중', /돌아다니는 중/.test((await rowText('가람')) ?? ''));

// (10, 2.5)쯤은 칠판과 교탁이 같은 거리라 교탁이 골라질 수 있다. 칠판만 닿는 자리에서 살펴본다.
await a.js(`__df.teleport(9, 2.5)`);
await a.press('Space');
check('칠판 단서', await dialogHas(/칠판에 글이 적혀 있습니다/), fmt(await a.dialogText()));
await a.press('Space');
await wait(300);
check('CCTV: 칠판을 본 뒤 진행 1/11', /진행 1\/11/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

await a.js(`__df.teleport(11, 4.5)`);
await a.press('Space');
check('교탁 퀴즈가 뜸', await dialogHas(/가속도/));
await wait(300);
check('CCTV: 교탁 퀴즈 푸는 중(목록)', /교탁 퀴즈 푸는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
check('CCTV: 지도의 아바타 위에 "교탁 퀴즈"', (await cctv()).tags.includes('교탁 퀴즈'), (await cctv()).tags.join(','));
await teacher.shot('cctv-overview');
await a.press('1');
check('틀린 답 안내', await dialogHas(/틀렸습니다/));
await a.shot('quiz-wrong');
await a.press('2');
check('맞힌 뒤 사물함 열쇠를 얻음', await dialogHas(/사물함 열쇠를 얻었습니다/));
await a.press('Enter');
check('가진 물건에 사물함 열쇠', (await a.js(`document.querySelector('.df-hud').innerText`)).includes('사물함 열쇠'));
await wait(300);
check('CCTV: 진행 2/11', /진행 2\/11/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));

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
  return { ok: Math.abs(at.x - panelLeft / 2) < 60 && Math.abs(at.y - (100 + h) / 2) < 60, at };
};
let mid = await nearMiddle('가람');
const follow = await cctv();
check('CCTV: 목록에서 누른 학생(가람)을 크게 보며 따라감',
  follow.following === '가람' && follow.zoom > overviewZoom * 1.3 && mid.ok,
  `zoom ${overviewZoom.toFixed(2)} → ${follow.zoom.toFixed(2)}, 화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
check('CCTV: 정보 창에 진행과 가진 물건', /진행 2\/11/.test((await cctvText()) ?? '') && /사물함 열쇠/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await teacher.shot('cctv-follow');

await a.js(`__df.teleport(21.5, 4.5)`);
await a.press('Space');
check('사물함 퀴즈가 뜸', await dialogHas(/중력 가속도/));
await wait(900);
mid = await nearMiddle('가람');
check('CCTV: 학생이 옮겨 가도 따라감', mid.ok && /사물함 퀴즈 푸는 중/.test((await cctvText()) ?? ''), `화면 ${mid.at.x.toFixed(0)}, ${mid.at.y.toFixed(0)}`);
await a.press('3');
check('교실 문 열쇠를 얻음', await dialogHas(/교실 문 열쇠를 얻었습니다/));
await a.press('Enter');

// 교실 문(퀴즈)을 열고 복도로
await a.js(`__df.teleport(22, 10.5)`);
await a.press('Space');
check('교실 문 퀴즈가 뜸', await dialogHas(/전류/));
await a.press('1');
check('교실 문이 열림', await dialogHas(/교실 문을 열었습니다/), fmt(await a.dialogText()));
await a.press('Enter');
await a.press('ArrowDown', 900);
check('연 교실 문을 지나 복도로 나감, 안내에 복도', (await a.js(`__df.pos().row`)) > 13 && (await placeOf(a)) === '복도',
  `row ${(await a.js(`__df.pos().row`)).toFixed(2)}, ${await placeOf(a)}`);
await wait(300);
check('CCTV: 따라가는 학생의 장소가 복도', /복도 · 돌아다니는 중/.test((await cctvText()) ?? ''), fmt(await cctvText()));
await a.shot('hallway');

// 복도: 잠긴 실험실 문, 게시판, 신발장
await a.js(`__df.teleport(37, 13.5)`);
await a.press('ArrowUp', 600);
check('잠긴 실험실 문은 지나가지 못함', (await a.js(`__df.pos().row`)) >= 13.29);
await a.press('Space');
check('열쇠 없이 실험실 문: 잠김 안내', await dialogHas(/실험실 문이 잠겨/));
await a.press('Enter');
await a.js(`__df.teleport(5.5, 13.5)`);
await a.press('Space');
check('게시판 단서', await dialogHas(/신발장/), fmt(await a.dialogText()));
await a.press('Space');
await a.js(`__df.teleport(18.5, 15.5)`);
await a.press('Space');
check('신발장 퀴즈가 뜸', await dialogHas(/운동량/));
await a.press('3');
check('실험실 열쇠를 얻음', await dialogHas(/실험실 열쇠를 얻었습니다/));
await a.press('Enter');
await a.js(`__df.teleport(37, 13.5)`);
await a.press('Space');
check('실험실 문이 열림', await dialogHas(/실험실 문을 열었습니다/));
await a.press('Enter');
await a.press('ArrowUp', 900);
check('연 실험실 문을 지나 실험실로 들어감', (await a.js(`__df.pos().row`)) < 11 && (await placeOf(a)) === '실험실', await placeOf(a));

// 실험실: 약품장, 실험대
await a.js(`__df.teleport(44, 3.4)`);
await a.press('Space');
check('약품장 단서', await dialogHas(/실험대 서랍/), fmt(await a.dialogText()));
await a.press('Space');
await a.js(`__df.teleport(35, 3.5)`);
await a.press('Space');
check('실험대 퀴즈가 뜸', await dialogHas(/파동/));
await a.press('3');
check('현관 열쇠를 얻음', await dialogHas(/현관 열쇠를 얻었습니다/));
await a.press('Enter');

// 현관문을 열고 운동장으로, 교문에서 탈출
await a.js(`__df.teleport(24, 16.5)`);
await a.press('ArrowDown', 500);
const beforeEntrance = await a.js(`__df.pos().row`);
await a.press('Space');
check('현관문이 열림(열기 전에는 막힘)', beforeEntrance <= 16.71 && (await dialogHas(/현관문을 열었습니다/)), `row ${beforeEntrance.toFixed(2)}`);
await a.press('Enter');
await a.press('ArrowDown', 900);
check('연 현관문을 지나 운동장으로 나감', (await a.js(`__df.pos().row`)) > 18.5 && (await placeOf(a)) === '운동장', await placeOf(a));
await a.shot('field');
await a.js(`__df.teleport(24, 35.5)`);
await a.press('Space');
check('교문 퀴즈가 뜸', await dialogHas(/운동 에너지/));
await a.press('3');
const fin = await a.dialogText();
check('탈출 화면', /학교를 탈출했습니다/.test(fin ?? '') && /걸린 시간/.test(fin ?? ''), fmt(fin));
await a.shot('escaped');
await wait(300);
check('CCTV: 탈출 완료, 진행 11/11', /탈출 완료/.test((await cctvText()) ?? '') && /진행 11\/11/.test((await cctvText()) ?? ''), fmt(await cctvText()));
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
  Math.abs(aPos.col - 11.5) <= 1.5 && Math.abs(aPos.row - 9.5) <= 1.5 &&
  Math.abs(aOnTeacher.col - aPos.col) < 0.05 && Math.abs(aOnTeacher.row - aPos.row) < 0.05,
  `A ${aPos.col.toFixed(2)}, ${aPos.row.toFixed(2)} / 선생님 화면 ${aOnTeacher.col.toFixed(2)}, ${aOnTeacher.row.toFixed(2)}`);
check('CCTV: 다시 하기 뒤 진행 0/11, 돌아다니는 중',
  /진행 0\/11/.test((await rowText('가람')) ?? '') && /돌아다니는 중/.test((await rowText('가람')) ?? ''), fmt(await rowText('가람')));
await a.js(`__df.teleport(22, 10.5)`);
await a.press('ArrowDown', 600);
check('다시 하기 뒤 교실 문이 다시 잠김', (await a.js(`__df.pos().row`)) <= 10.71);

// ---- 선생님: CCTV 끄고 다시 돌아다니기 ----
await clickText(teacher, '.df-cctv button', 'CCTV 끄기');
check('CCTV 끄기: 창이 닫히고 살펴보기 단추가 돌아옴',
  (await teacher.js(`!document.querySelector('.df-cctv') && !document.querySelector('.df-action').hidden && __df.cctv() === null`)) === true);
const tPos3 = await teacher.js(`__df.pos()`);
await teacher.press('ArrowRight', 400);
check('CCTV를 끄면 선생님이 다시 움직임', (await teacher.js(`__df.pos().col`)) - tPos3.col > 0.5);

// ---- 골든벨 ----
// 학생 A는 교실에서 칠판을 본 뒤(진행 1/11) 골든벨에 갔다가 같은 자리, 같은 진행으로 돌아와야 한다.
await a.js(`__df.teleport(9, 2.5)`);
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
const looks = (pg) => pg.js(`__df.looks()`);
let la = await looks(a);
check('골든벨: 머리 위에 목숨(나와 다른 학생)', la.me.tag === '♥♥♥' && la.others['나래']?.tag === '♥♥♥' && la.others['선생님']?.tag === null,
  JSON.stringify(la));
await teacher.shot('gb-ready');
const gm = (await a.js(`__df.camera()`)).map;
check('골든벨 맵은 화면에 전체가 맞춰짐(따라가지 않음)', gm.x >= 0 && gm.y >= 0 && gm.x + gm.w <= aw && gm.y + gm.h <= ah,
  `맵 화면 ${gm.x.toFixed(0)},${gm.y.toFixed(0)} ${gm.w.toFixed(0)}×${gm.h.toFixed(0)}`);

const ZONE = { O: [4.5, 4.5], X: [14.5, 4.5], 1: [4.5, 4.5], 2: [14.5, 4.5], 3: [4.5, 10.5], 4: [14.5, 10.5], 밖: [9.5, 4.5] };
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
check('골든벨 3번: 탈락한 학생은 머리 위에 해골 3개, 흐리게 보임', la.others['나래'].tag === '💀💀💀' && la.others['나래'].alpha < 1, JSON.stringify(la.others['나래']));

await gbRound('O', 'O');
check('골든벨 4번: 탈락 중 맞히면 부활까지 남은 수, 점수는 그대로',
  /2문제를 더 맞히면 다시 살아납니다/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbScore === 0, fmt(await gbCard(b)));
check('골든벨 4번: 맞히면 해골이 하나 없어짐', (await looks(b)).me.tag === '💀💀' && (await looks(a)).others['나래'].tag === '💀💀', JSON.stringify((await looks(b)).me));

await gbRound(2, 2, async () => {
  check('골든벨 5번: 보기가 3개면 구역도 3개', /1 0명 · 2 2명 · 3 0명 · 구역 밖 0명/.test((await gbPanel()) ?? ''), fmt(await gbPanel()));
});
check('골든벨 5번: 부활까지 1문제, 해골 1개', /1문제를 더 맞히면/.test((await gbCard(b)) ?? '') && (await looks(b)).me.tag === '💀', fmt(await gbCard(b)));

await gbRound('X', 'X');
check('골든벨 6번: 3문제를 맞혀 목숨 1개로 다시 살아남',
  /목숨 1개로 다시 살아났습니다/.test((await gbCard(b)) ?? '') && /목숨 ♥♡♡/.test((await gbCard(b)) ?? '') && (await gbOf('나래')).gbOut === false &&
    (await looks(b)).me.tag === '♥♡♡',
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
check('골든벨 끝: 모두 학교 맵으로 돌아옴', (await maps()) === 'school,school,school' && (await c.js(`__df.map()`)) === 'school', await maps());
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
const teacher2 = await openPage('teacher2', baseUrl + '?touch=1', { touch: true });
await teacher2.enter({ teacher: true, nickname: '선생님2', code, pw: password });
check('선생님이 방 코드로 기존 방에 다시 들어감', (await teacher2.js(`window.__df?.role()`)) === 'teacher' && (await teacher2.js(`__df.code()`)) === code);

// ---- 태블릿 선생님: CCTV 모드에서는 조이스틱 영역이 감춰져 지도 위 학생을 누를 수 있다 ----
await clickText(teacher2, '.df-hud button', 'CCTV 보기');
await wait(400);
const aAt = await teacher2.js(`__df.screenOf('가람')`);
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
await odd.leave();

check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
console.log(results.join('\n'));
console.log(`캡처: ${outDir}`);
chrome.close();
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
