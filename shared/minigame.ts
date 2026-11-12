// 미니게임 약속(2026-11-12 교사 결정, 대장 결정). 서버, 화면, 봇(scripts/lib/bots.mjs)이 함께 쓴다.
// - 보물찾기(treasure): 열린 장소 곳곳의 보물을 먼저 닿은 학생이 가져간다. 줍기 판정은 서버.
// - 공 피하기(dodge): 운동장에서 굴러오는 공을 피한다. 공 일정은 seed로 모든 화면이 똑같이 만들고, 맞음은 학생 화면이 알린다.
// - 줄다리기(tug): 반마다 누른 수를 반 학생 수로 나눠 줄을 당긴다. 이긴 반 학생은 다음 골든벨에서 하트 +1.

export const MINI_KINDS = ['treasure', 'dodge', 'tug'] as const;
export type MiniKind = (typeof MINI_KINDS)[number];

export const MINI_NAMES: Record<MiniKind, string> = { treasure: '보물찾기', dodge: '공 피하기', tug: '줄다리기' };

/** '' 꺼짐 | 'count' 시작 전 세기 | 'play' 하는 중 | 'result' 결과 */
export type MiniPhase = '' | 'count' | 'play' | 'result';

/** 시작 전 세는 시간(초) */
export const MINI_COUNT_SECONDS = 3;
/** 결과 창을 보이는 시간(초) */
export const MINI_RESULT_SECONDS = 10;
/** 한 판 시간(초). 확인용으로는 서버를 DF_MINI_FAST=1로 켜면 MINI_FAST_SECONDS를 쓴다. */
export const MINI_SECONDS: Record<MiniKind, number> = { treasure: 180, dodge: 120, tug: 30 };
export const MINI_FAST_SECONDS: Record<MiniKind, number> = { treasure: 20, dodge: 20, tug: 10 };

// ---- 보물찾기 ----
/** 보통 보물 수(1점)와 금 보물 수(GOLD_POINTS점) */
export const TREASURE_COUNT = 25;
export const GOLD_COUNT = 5;
export const GOLD_POINTS = 3;
/** 학생 화면: 발이 보물에서 이만큼(칸) 안이면 줍기를 보낸다 */
export const PICK_REACH = 0.7;
/** 서버: 서버가 아는 학생 위치와 보물 사이가 이만큼(칸) 안이면 준 것으로 본다(위치를 보내는 사이의 늦음을 넉넉히 본다) */
export const PICK_TOLERANCE = 1.6;

// ---- 공 피하기 ----
/** 공 피하기 판(학교 맵 운동장 안, 칸). 이 판 동안 학생은 이 네모 밖으로 나가지 못한다. */
export const DODGE_ARENA = { col: 2, row: 20, w: 44, h: 15 } as const;
/** 탈락한 학생이 구경하는 줄(운동장 위쪽, 건물 앞): 행과 열 범위 */
export const DODGE_STANDS = { row: 19.5, col: 3, w: 42 } as const;
/** 공 반지름(칸). 학생 발 반지름(size.avatarFeet 0.3)과 더해 맞음을 본다. */
export const BALL_RADIUS = 0.35;
/** 공이 나오는 간격(초): 처음과 끝. 판이 지날수록 줄어든다. */
export const BALL_GAP = { start: 1.3, end: 0.22 } as const;
/** 공 빠르기(칸/초): 처음과 끝 */
export const BALL_SPEED = { start: 3, end: 8.5 } as const;

// ---- 줄다리기 ----
/** 줄 위치가 이 값(반 평균 누른 수의 차이)에 닿으면 그 반이 이긴다 */
export const TUG_GOAL = 25;
/** 한 학생이 1초에 이보다 많이 누른 것은 세지 않는다 */
export const TUG_MAX_PER_SECOND = 12;

/** 보물 하나 */
export interface TreasureSpot {
  id: string;
  col: number;
  row: number;
  gold: boolean;
}

/** 굴러가는 공 하나: t초에 (x0, y0)에서 나와 (vx, vy)칸/초로 life초 동안 굴러간다. */
export interface Ball {
  t: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  life: number;
}

/** seed로 늘 같은 수를 내는 난수(mulberry32). 서버·화면·봇이 같은 공 일정을 만든다. */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k));

/**
 * 공 일정: 판 시작부터 duration초 동안 운동장 네 가장자리 가운데 하나에서 나와 맞은편 가장자리의 아무 데로 굴러간다.
 * 판이 지날수록 나오는 간격이 줄고(BALL_GAP) 빨라진다(BALL_SPEED).
 */
export function ballSchedule(seed: number, duration: number): Ball[] {
  const rnd = random(seed);
  const a = DODGE_ARENA;
  const balls: Ball[] = [];
  let t = 0.5;
  while (t < duration) {
    const k = t / duration;
    const side = Math.floor(rnd() * 4);
    const along = (n: number) => rnd() * n;
    // 나오는 자리와 가는 자리(맞은편 가장자리)
    let from: [number, number];
    let to: [number, number];
    if (side === 0) {
      from = [a.col + along(a.w), a.row - BALL_RADIUS];
      to = [a.col + along(a.w), a.row + a.h + BALL_RADIUS];
    } else if (side === 1) {
      from = [a.col + along(a.w), a.row + a.h + BALL_RADIUS];
      to = [a.col + along(a.w), a.row - BALL_RADIUS];
    } else if (side === 2) {
      from = [a.col - BALL_RADIUS, a.row + along(a.h)];
      to = [a.col + a.w + BALL_RADIUS, a.row + along(a.h)];
    } else {
      from = [a.col + a.w + BALL_RADIUS, a.row + along(a.h)];
      to = [a.col - BALL_RADIUS, a.row + along(a.h)];
    }
    const speed = lerp(BALL_SPEED.start, BALL_SPEED.end, k) * (0.85 + rnd() * 0.3);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const d = Math.hypot(dx, dy);
    balls.push({ t, x0: from[0], y0: from[1], vx: (dx / d) * speed, vy: (dy / d) * speed, life: d / speed });
    t += lerp(BALL_GAP.start, BALL_GAP.end, k) * (0.7 + rnd() * 0.6);
  }
  return balls;
}

/** time초(판 시작부터)에 굴러가고 있는 공들의 자리 [x, y, 공 번호]. 일정은 나온 순서라 앞에서부터 본다. */
export function ballsAt(balls: Ball[], time: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.t > time) break;
    const dt = time - b.t;
    if (dt > b.life) continue;
    out.push([b.x0 + b.vx * dt, b.y0 + b.vy * dt, i]);
  }
  return out;
}

/** (col, row)에 선 발이 time초에 공에 닿았는지(feet: 발 반지름, 칸) */
export function hitAt(balls: Ball[], time: number, col: number, row: number, feet: number) {
  return ballsAt(balls, time).some(([x, y]) => Math.hypot(x - col, y - row) < BALL_RADIUS + feet);
}

/** 탈락한 학생 n번째(0부터)가 서는 구경 자리 */
export function standsSpot(n: number) {
  const s = DODGE_STANDS;
  const per = Math.max(1, Math.floor(s.w / 0.9));
  return { col: s.col + 0.45 + (n % per) * 0.9, row: s.row - Math.floor(n / per) * 0.01 };
}

/** 학생 화면이 미니게임에서 보내는 것 */
export interface MiniPickMessage {
  id: string;
}

/** 선생님이 미니게임을 시작한다 */
export interface MiniStartMessage {
  kind: MiniKind;
}
