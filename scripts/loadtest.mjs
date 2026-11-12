// 학생 35명이 한꺼번에 들어와 움직일 때 서버와 화면이 버티는지 잰다.
// 가짜 학생(봇)은 Node에서 Colyseus SDK로 붙고, 선생님 1명과 학생 1명은 헤드리스 크롬 화면으로 들어와 CCTV와 그리기 빠르기를 본다.
// 학교 맵에서는 봇이 모두 바닥 칸 아무 데로나 쉬지 않고 움직인다(실제 수업보다 무거운 경우). 골든벨은 확인용 문제(3초 7문제)로 한 판 한다.
// 화면 서버(Vite)와 게임 서버가 켜져 있어야 하고, 게임 서버는 DF_GOLDENBELL_DIR=scripts/playtest-goldenbell,
// DF_ESCAPE_DIR=scripts/playtest-escape로 켠다(선생님이 방을 만들면 예시 방탈출 자료를 고른다).
// 사용: DF_TEACHER_PASSWORD=... pnpm loadtest [화면 주소] [게임 서버 주소] [학생 수]
//   기본값: http://localhost:5173/  http://localhost:2567  35
// 결과와 캡처는 .run/loadtest/에 남긴다.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Bot, bytesIn, runBots } from './lib/bots.mjs';
import { launchChrome, wait } from './lib/chrome.mjs';

const [baseUrl = 'http://localhost:5173/', gameUrl = 'http://localhost:2567', countArg = '35'] = process.argv.slice(2);
const students = Number(countArg);
const password = process.env.DF_TEACHER_PASSWORD;
if (!password) {
  console.error('DF_TEACHER_PASSWORD(게임 서버의 선생님 비밀번호)를 넘겨야 합니다.');
  process.exit(2);
}
const outDir = '.run/loadtest';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '통과' : '실패'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const measure = (name, detail) => results.push(`측정  ${name}: ${detail}`);
const fmt = (s) => s?.replace(/\n+/g, ' / ');

// ---- 서버 프로세스 재기(CPU, 메모리) ----

function serverPid(port) {
  for (const cmd of [`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, `ss -ltnpH sport = :${port}`]) {
    try {
      const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/pid=(\d+)/) ?? out.match(/^(\d+)/m);
      if (m) return Number(m[1]);
    } catch {}
  }
  return null;
}

/** 지금까지 쓴 CPU 시간(초). 리눅스는 /proc, 맥은 ps */
function cpuSeconds(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return (Number(f[11]) + Number(f[12])) / 100;
  } catch {}
  try {
    const t = execSync(`ps -o cputime= -p ${pid}`, { encoding: 'utf8' }).trim();
    return t.split(':').reduce((acc, v) => acc * 60 + Number(v), 0);
  } catch {
    return null;
  }
}

const rssMb = (pid) => {
  try {
    return Number(execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' }).trim()) / 1024;
  } catch {
    return null;
  }
};

/** 한 구간의 서버 CPU(코어 1개 기준 %)를 잰다. */
function cpuMeter(pid) {
  const c0 = pid && cpuSeconds(pid);
  const t0 = performance.now();
  return () => {
    const c1 = pid && cpuSeconds(pid);
    if (c0 == null || c1 == null) return null;
    return ((c1 - c0) / ((performance.now() - t0) / 1000)) * 100;
  };
}

const percentile = (list, p) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};

// ---- 시험 ----

const pid = serverPid(new URL(gameUrl).port || 80);
const chrome = await launchChrome(outDir);
const teacher = await chrome.openPage('teacher', baseUrl);
await teacher.enter({ teacher: true, nickname: '선생님', pw: password });
const code = await teacher.js(`window.__df?.code()`);
check('선생님 화면이 방을 만듦', /^\d{4}$/.test(code ?? ''), code);
// 방을 만들면 방탈출 자료를 고르는 창이 뜬다.
await wait(800);
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('예시 방탈출'))?.click()`);
await wait(500);

const bots = Array.from({ length: students - 1 }, (_, i) => new Bot(i, gameUrl));
measure('인원', `학생 ${students}명(봇 ${bots.length}명 + 크롬 화면 1명), 선생님 1명(크롬 화면)`);
const joinStart = performance.now();
const joined = await Promise.allSettled(bots.map((b) => b.join(code)));
const joinTotal = performance.now() - joinStart;
const failed = joined.filter((r) => r.status === 'rejected');
check(`봇 ${bots.length}명이 한꺼번에 들어옴`, failed.length === 0, failed.map((r) => r.reason?.message ?? r.reason).join(', '));
measure('들어오기', `${bots.length}명이 동시에 ${(joinTotal / 1000).toFixed(1)}초 안에 모두 들어옴(가장 오래 걸린 1명 ${(Math.max(...bots.map((b) => b.joinMs ?? 0)) / 1000).toFixed(1)}초)`);
const live = bots.filter((b) => b.room);

const student = await chrome.openPage('student', baseUrl);
await student.enter({ nickname: '관찰학생', code });
await wait(1000);
const hud = await teacher.js(`document.querySelector('.df-hud').innerText`);
check(`선생님 화면: 학생 ${students}명 접속`, hud?.includes(`학생 ${students}명 접속`), fmt(hud));

// 모두 움직이게 한다.
const stopBots = runBots(live);
const pingLoop = setInterval(() => {
  for (const b of live) b.ping();
}, 2000);

// ---- 학교 맵: 모두 쉬지 않고 움직이는 30초 ----
for (const b of live) b.wander = true;
await wait(1000);
const classCpu = cpuMeter(pid);
const bytes0 = bytesIn();
const sent0 = live.reduce((n, b) => n + b.sent, 0);
const t0 = performance.now();
const [teacherFps, studentFps] = await Promise.all([teacher.fps(), student.fps()]);
await teacher.shot('walk');
await student.shot('walk');
await teacher.js(`[...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === 'CCTV 보기').click()`);
await wait(1000);
const cctvFps = await teacher.fps();
const rows = await teacher.js(`document.querySelectorAll('.df-cctv-row').length`);
check(`CCTV 목록에 학생 ${students}명`, rows === students, `${rows}줄`);
await teacher.shot('cctv');
await wait(Math.max(0, 30000 - (performance.now() - t0)));
const seconds = (performance.now() - t0) / 1000;
const cpuClass = classCpu();
const perDevice = (bytesIn() - bytes0) / live.length / seconds;
const movesPerSec = (live.reduce((n, b) => n + b.sent, 0) - sent0) / seconds;
measure('서버 CPU(학교 맵, 모두 움직임)', cpuClass == null ? '재지 못함' : `코어 1개의 ${cpuClass.toFixed(0)}%`);
measure('서버 메모리', pid ? `${rssMb(pid)?.toFixed(0)} MB` : '재지 못함');
measure('서버가 받은 위치 메시지', `초당 ${movesPerSec.toFixed(0)}개`);
measure('기기 1대가 받는 데이터', `초당 ${(perDevice / 1024).toFixed(1)} KB(${((perDevice * 8) / 1e6).toFixed(2)} Mbps), ${students + 1}대 합 ${(((perDevice * 8) / 1e6) * (students + 1)).toFixed(1)} Mbps`);
const pings = live.flatMap((b) => b.pings);
measure('응답 시간(ping)', `중앙 ${percentile(pings, 50)} ms, 95% ${percentile(pings, 95)} ms, 가장 김 ${Math.max(...pings)} ms (${pings.length}번)`);
measure('화면 빠르기(헤드리스 크롬, 참고용)', `선생님 ${teacherFps.toFixed(0)}fps, CCTV 켬 ${cctvFps.toFixed(0)}fps, 학생 ${studentFps.toFixed(0)}fps`);

// 멈추면 선생님 화면의 위치가 봇의 위치와 같아져야 한다.
for (const b of live) {
  b.wander = false;
  b.target = { ...b.pos };
}
await wait(1500);
const seen = await teacher.js(`Object.fromEntries(__df.others().map((o) => [o.nickname, [o.col, o.row]]))`);
const drift = Math.max(...live.map((b) => Math.hypot((seen[b.nickname]?.[0] ?? NaN) - b.pos.col, (seen[b.nickname]?.[1] ?? NaN) - b.pos.row)));
check('멈춘 뒤 선생님 화면의 위치가 봇과 같음', drift < 0.01, `가장 큰 차이 ${drift.toFixed(4)}칸`);
await teacher.js(`[...document.querySelectorAll('.df-cctv button')].find((b) => b.textContent === 'CCTV 끄기').click()`);
await wait(500);

// ---- 골든벨 ----
await teacher.js(`[...document.querySelectorAll('.df-hud button')].find((b) => b.textContent === '강당으로 모으기').click()`);
await wait(1000);
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent.includes('확인용 골든벨'))?.click()`);
await wait(300);
await teacher.js(`[...document.querySelectorAll('.df-dialog .df-choice')].find((b) => b.textContent === '지금 바로 옮기기')?.click()`);
await wait(1500);
const inBell = async () => teacher.js(`__df.others().filter((o) => o.role === 'student' && o.map === 'goldenbell').length`);
check(`골든벨: 학생 ${students}명 모두 골든벨 맵`, (await inBell()) === students, `${await inBell()}명`);
const total = (await teacher.js(`__df.gb().total`)) ?? 0;
const bellCpu = cpuMeter(pid);
const next = () => teacher.js(`document.querySelector('.df-gb-panel .df-row > .df-button:not(.df-button-small)').click()`);
const judged = [];
for (let i = 0; i < total; i++) {
  await next();
  await wait(1800);
  if (i === 1) await teacher.shot('gb-question');
  await wait(2000);
  judged.push(await teacher.js(`__df.others().filter((o) => o.role === 'student' && o.gbResult !== '').length`));
}
check(`골든벨: ${total}문제 모두 ${students}명을 채점`, total > 0 && judged.every((n) => n === students), judged.join(', '));
const cpuBell = bellCpu();
measure('서버 CPU(골든벨)', cpuBell == null ? '재지 못함' : `코어 1개의 ${cpuBell.toFixed(0)}%`);
await next();
await wait(800);
const ranks = await teacher.js(`document.querySelectorAll('.df-gb-panel .df-gb-ranking li').length`);
check(`골든벨 결과: 순위 ${students}줄`, ranks === students, `${ranks}줄`);
await teacher.shot('gb-end');
await teacher.js(`[...document.querySelectorAll('.df-gb-panel button')].find((b) => b.textContent === '골든벨 끝내기').click()`);
await wait(1500);
const back = await teacher.js(`__df.others().filter((o) => o.role === 'student' && o.map === 'school').length`);
check(`골든벨 끝: 학생 ${students}명 모두 학교 맵으로`, back === students, `${back}명`);

stopBots();
clearInterval(pingLoop);
await Promise.allSettled(live.map((b) => b.room.leave()));
check('화면 오류 없음', chrome.consoleErrors.length === 0, chrome.consoleErrors.slice(0, 3).join(' | '));
chrome.close();

const text = results.join('\n');
console.log(text);
console.log(`캡처: ${outDir}`);
writeFileSync(`${outDir}/result.txt`, text + '\n');
process.exit(results.some((r) => r.startsWith('실패')) ? 1 : 0);
