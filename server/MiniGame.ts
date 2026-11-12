// 한 방의 미니게임(보물찾기·공 피하기·줄다리기, shared/minigame.ts). 선생님이 시작하고, 서버가 시간·점수·결과를 정한다.
// 모든 학생이 학교 맵에 있을 때만 한다(골든벨 중·강당으로 모으는 중에는 시작하지 않는다).
import school from '../src/data/school.json' with { type: 'json' };
import { areaAt, isFloor, loadRoom } from '../src/data/room.ts';
import {
  DODGE_ARENA,
  GOLD_COUNT,
  GOLD_POINTS,
  MINI_COUNT_SECONDS,
  MINI_FAST_SECONDS,
  MINI_KINDS,
  MINI_NAMES,
  MINI_RESULT_SECONDS,
  MINI_SECONDS,
  PICK_TOLERANCE,
  TREASURE_COUNT,
  TUG_GOAL,
  TUG_MAX_PER_SECOND,
  standsSpot,
  type MiniKind,
} from '../shared/minigame.ts';
import { CLASS_GROUPS, classGroupName } from '../shared/protocol.ts';
import { MiniResult, Treasure, type ClassState, type Player } from '../shared/schema.ts';

const SCHOOL = loadRoom(school);
/** 사물이 차지한 칸("열,행") */
const COVERED = new Set<string>();
for (const o of SCHOOL.objects) {
  for (let r = o.row; r < o.row + o.h; r++) for (let c = o.col; c < o.col + o.w; c++) COVERED.add(`${c},${r}`);
}
/** 사물이 없는 바닥 칸과 그 칸이 열리는 부(장소의 part) */
const OPEN_TILES: { col: number; row: number; part: number }[] = [];
SCHOOL.layout.forEach((line, row) => {
  [...line].forEach((ch, col) => {
    if (!isFloor(ch) || COVERED.has(`${col},${row}`)) return;
    const area = areaAt(SCHOOL, col + 0.5, row + 0.5);
    if (!area) return;
    // 장소 네모 밖(문턱, 계단 옆 등)은 빼고 장소 안 칸만
    if (col < area.col || col >= area.col + area.w || row < area.row || row >= area.row + area.h) return;
    OPEN_TILES.push({ col, row, part: area.part ?? 1 });
  });
});
/** 공 피하기 판 안의 빈 칸 */
const ARENA_TILES = OPEN_TILES.filter(
  (t) => t.col >= DODGE_ARENA.col && t.col < DODGE_ARENA.col + DODGE_ARENA.w && t.row >= DODGE_ARENA.row && t.row < DODGE_ARENA.row + DODGE_ARENA.h,
);

/** 방의 시계(Colyseus Room.clock에서 쓰는 것만) */
interface Clock {
  setInterval(fn: () => void, ms: number): { clear(): void };
}

const fast = process.env.DF_MINI_FAST === '1';
const secondsOf = (kind: MiniKind) => (fast ? MINI_FAST_SECONDS : MINI_SECONDS)[kind];

function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export class MiniGames {
  private readonly state: ClassState;
  private readonly clock: Clock;
  private timer: { clear(): void } | null = null;
  /** 이번 판에 든 학생(접속 id). 시작할 때 학교 맵에 있던 학생 */
  private roster = new Set<string>();
  /** 줄다리기: 반 id → 시작할 때 학생 수, 반 id → 센 누른 수 */
  private classSize = new Map<string, number>();
  private pulls = new Map<string, number>();
  /** 줄다리기: 학생 → 최근 1초 동안 센 누른 시각(ms) */
  private recent = new Map<string, number[]>();
  /** 공 피하기: 탈락한 차례 */
  private outCount = 0;

  constructor(state: ClassState, clock: Clock) {
    this.state = state;
    this.clock = clock;
  }

  get active() {
    return this.state.mini.phase !== '';
  }

  /** 하는 중(세기 포함)인 미니게임 종류. 없으면 '' */
  get playing(): MiniKind | '' {
    const m = this.state.mini;
    return m.phase === 'count' || m.phase === 'play' ? (m.kind as MiniKind) : '';
  }

  private students() {
    return [...this.state.players].filter(([, p]) => p.role === 'student' && p.online && p.map === 'school');
  }

  /** 선생님이 시작한다. 할 수 없으면 까닭을 돌려준다. */
  start(kind: unknown): string | null {
    if (!(MINI_KINDS as readonly unknown[]).includes(kind)) return '미니게임 종류를 고릅니다.';
    const k = kind as MiniKind;
    if (this.active) return '이미 미니게임을 하고 있습니다.';
    if (this.state.goldenbell.phase !== '') return '골든벨을 하는 중에는 미니게임을 시작할 수 없습니다.';
    if (this.state.gatherLeft > 0) return '강당으로 모으는 중에는 미니게임을 시작할 수 없습니다.';
    const students = this.students();
    if (!students.length) return '학교 맵에 있는 학생이 없습니다.';
    if (k === 'tug') {
      for (const g of CLASS_GROUPS) {
        if (!students.some(([, p]) => p.classGroup === g.id)) return `${g.name} 학생이 없어 줄다리기를 할 수 없습니다.`;
      }
    }
    const m = this.state.mini;
    this.roster = new Set(students.map(([id]) => id));
    for (const p of this.state.players.values()) {
      p.miniScore = 0;
      p.miniOut = false;
    }
    m.kind = k;
    m.duration = secondsOf(k);
    m.seed = Math.floor(Math.random() * 2 ** 31);
    m.startedAt = 0;
    m.treasures.clear();
    m.results.clear();
    m.winner = '';
    m.tugScience = m.tugAisw = m.tugPos = 0;
    m.tugGoal = TUG_GOAL;
    this.pulls.clear();
    this.recent.clear();
    this.outCount = 0;
    this.classSize = new Map(CLASS_GROUPS.map((g) => [g.id, students.filter(([, p]) => p.classGroup === g.id).length]));
    if (k === 'treasure') this.placeTreasures();
    if (k === 'dodge') {
      // 모두 운동장 안 아무 빈 칸으로 옮긴다(화면이 서버가 세운 자리를 받아 선다).
      const spots = shuffle([...ARENA_TILES]);
      students.forEach(([, p], i) => {
        const t = spots[i % spots.length];
        p.col = t.col + 0.3 + Math.random() * 0.4;
        p.row = t.row + 0.3 + Math.random() * 0.4;
      });
    }
    m.phase = 'count';
    m.timeLeft = MINI_COUNT_SECONDS;
    this.runTimer(() => {
      if (m.timeLeft > 1) {
        m.timeLeft -= 1;
        return;
      }
      this.play();
    });
    console.log(`미니게임을 시작합니다: ${MINI_NAMES[k]}(학생 ${students.length}명)`);
    return null;
  }

  /** 지금 열린 장소의 빈 칸에 보물을 흩어 놓는다(금 보물 몇 개). */
  private placeTreasures() {
    const tiles = shuffle(OPEN_TILES.filter((t) => t.part <= this.state.part)).slice(0, TREASURE_COUNT + GOLD_COUNT);
    tiles.forEach((t, i) => {
      const treasure = new Treasure();
      treasure.col = t.col + 0.5;
      treasure.row = t.row + 0.5;
      treasure.gold = i < GOLD_COUNT;
      this.state.mini.treasures.set(`t${i}`, treasure);
    });
  }

  private play() {
    const m = this.state.mini;
    m.phase = 'play';
    m.timeLeft = m.duration;
    m.startedAt = Date.now();
    this.runTimer(() => {
      m.timeLeft = Math.max(0, m.timeLeft - 1);
      if (m.timeLeft === 0) this.finish();
    });
  }

  private runTimer(each: () => void) {
    this.timer?.clear();
    this.timer = this.clock.setInterval(each, 1000);
  }

  /** 판의 지난 시간(초) */
  private elapsed() {
    const m = this.state.mini;
    return Math.min(m.duration, Math.max(0, (Date.now() - m.startedAt) / 1000));
  }

  /** 보물을 줍는다. 서버가 아는 위치가 보물 가까이면 먼저 온 학생이 가진다. */
  pick(id: string, p: Player, treasureId: unknown) {
    const m = this.state.mini;
    if (m.kind !== 'treasure' || m.phase !== 'play' || p.role !== 'student' || typeof treasureId !== 'string') return;
    const t = m.treasures.get(treasureId);
    if (!t || Math.hypot(t.col - p.col, t.row - p.row) > PICK_TOLERANCE) return;
    m.treasures.delete(treasureId);
    p.miniScore += t.gold ? GOLD_POINTS : 1;
    this.roster.add(id);
    if (m.treasures.size === 0) this.finish();
  }

  /** 공 피하기: 학생 화면이 자기 캐릭터가 공에 맞았다고 알린다. 탈락시켜 구경 자리로 옮긴다. */
  hit(id: string, p: Player) {
    const m = this.state.mini;
    if (m.kind !== 'dodge' || m.phase !== 'play' || !this.roster.has(id) || p.miniOut) return;
    p.miniOut = true;
    p.miniScore = Math.round(this.elapsed() * 10) / 10;
    const spot = standsSpot(this.outCount++);
    p.col = spot.col;
    p.row = spot.row;
    // 둘 넘게 시작했으면 한 명만 남을 때, 혼자였으면 맞을 때 끝난다.
    const alive = [...this.roster].filter((sid) => {
      const q = this.state.players.get(sid);
      return q && !q.miniOut && q.online;
    }).length;
    if (alive <= (this.roster.size >= 2 ? 1 : 0)) this.finish();
  }

  /** 줄다리기: 한 번 누름. 1초에 TUG_MAX_PER_SECOND번 넘게 누른 것은 세지 않는다. */
  tug(id: string, p: Player) {
    const m = this.state.mini;
    if (m.kind !== 'tug' || m.phase !== 'play' || !this.roster.has(id) || !this.classSize.get(p.classGroup)) return;
    const now = Date.now();
    const times = (this.recent.get(id) ?? []).filter((t) => now - t < 1000);
    if (times.length >= TUG_MAX_PER_SECOND) {
      this.recent.set(id, times);
      return;
    }
    times.push(now);
    this.recent.set(id, times);
    p.miniScore += 1;
    this.pulls.set(p.classGroup, (this.pulls.get(p.classGroup) ?? 0) + 1);
    const avg = (g: string) => (this.pulls.get(g) ?? 0) / Math.max(1, this.classSize.get(g) ?? 0);
    m.tugScience = avg('science');
    m.tugAisw = avg('aisw');
    m.tugPos = m.tugScience - m.tugAisw;
    if (Math.abs(m.tugPos) >= m.tugGoal) this.finish();
  }

  /** 판을 끝내고 결과를 보인다(MINI_RESULT_SECONDS 뒤 닫는다). */
  finish() {
    const m = this.state.mini;
    if (m.phase !== 'play' && m.phase !== 'count') return;
    const kind = m.kind as MiniKind;
    const elapsed = m.phase === 'play' ? this.elapsed() : 0;
    const members = [...this.roster].map((id) => this.state.players.get(id)).filter((p): p is Player => !!p);
    // 공 피하기: 끝까지 남은 학생은 판이 끝난 때까지 버틴 것으로 친다.
    if (kind === 'dodge') for (const p of members) if (!p.miniOut) p.miniScore = Math.round(elapsed * 10) / 10;
    if (kind === 'tug') {
      m.winner = m.tugPos > 0 ? 'science' : m.tugPos < 0 ? 'aisw' : '';
      for (const p of members) if (m.winner && p.classGroup === m.winner) p.miniHeart = true;
    }
    const sorted = members.sort((a, b) => b.miniScore - a.miniScore || a.nickname.localeCompare(b.nickname, 'ko'));
    m.results.clear();
    for (const p of sorted) {
      const r = new MiniResult();
      r.nickname = p.nickname;
      r.character = p.character;
      r.classGroup = p.classGroup;
      r.score = p.miniScore;
      r.rank = sorted.filter((q) => q.miniScore > p.miniScore).length + 1;
      m.results.push(r);
    }
    m.treasures.clear();
    m.phase = 'result';
    m.timeLeft = MINI_RESULT_SECONDS;
    this.runTimer(() => {
      m.timeLeft = Math.max(0, m.timeLeft - 1);
      if (m.timeLeft === 0) this.close();
    });
    const tugText = kind === 'tug' ? `, 이긴 반 ${classGroupName(m.winner) || '비김'}` : '';
    console.log(`미니게임이 끝났습니다: ${MINI_NAMES[kind]}(학생 ${members.length}명${tugText})`);
  }

  /** 선생님이 그만둔다: 하는 중이면 결과 없이 닫는다. 결과를 보이는 중이면 결과 창을 닫는다. */
  stop() {
    this.close();
  }

  /** 미니게임을 닫고 처음으로 돌린다(학생 자리는 화면이 시작 전 자리로 되돌린다). */
  private close() {
    this.timer?.clear();
    this.timer = null;
    const m = this.state.mini;
    m.phase = '';
    m.kind = '';
    m.timeLeft = 0;
    m.treasures.clear();
    for (const p of this.state.players.values()) p.miniOut = false;
    this.roster.clear();
  }

  /** 학생이 나가면 줄다리기·공 피하기 명단에서는 그대로 두고(점수는 결과에 남는다) 따로 하는 일은 없다. */
  dispose() {
    this.timer?.clear();
  }
}
