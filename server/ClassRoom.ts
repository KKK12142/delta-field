// 수업 하나 = 방 하나. 선생님이 비밀번호로 만들고, 학생은 방 코드로 들어온다.
// 학교(교실·복도·실험실·운동장이 이어진 방탈출) 맵과 골든벨 맵이 있고, 골든벨을 시작하면 모두 골든벨 맵으로 옮긴다.
import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import school from '../src/data/school.json' with { type: 'json' };
import goldenbellMap from '../src/data/goldenbell.json' with { type: 'json' };
import characters from '../src/data/characters.json' with { type: 'json' };
import { GB_LIVES, activeZones, judge, zoneAt, type Zones } from '../shared/goldenbell.ts';
import {
  CODE_LENGTH,
  DEFAULT_CHARACTER,
  MAX_CLIENTS,
  RECONNECT_SECONDS,
  RejectCode,
  cleanNickname,
  type GbFileInfo,
  type GbReply,
  type JoinOptions,
  type MoveMessage,
  type StatusMessage,
} from '../shared/protocol.ts';
import { ClassState, Player } from '../shared/schema.ts';
import { listQuestionFiles, loadQuestionSet, type QuestionSet } from './questions.ts';

/** 맵 id → 크기(칸) */
const MAP_SIZES: Record<string, { rows: number; cols: number }> = {
  school: { rows: school.layout.length, cols: school.layout[0].length },
  goldenbell: { rows: goldenbellMap.layout.length, cols: goldenbellMap.layout[0].length },
};
const ITEM_IDS = new Set(Object.keys(school.items));
/** 살펴볼 수 있는(action이 있는) 사물 id. 연 문도 마친 사물(done)로 받는다. */
const ACTION_IDS = new Set(school.objects.filter((o) => 'action' in o).map((o) => o.id));
const GB_ZONES: Zones = goldenbellMap.zones;
const CHARACTER_IDS = new Set(characters.map((c) => c.id));
/** 골든벨 맵에서 학생의 발밑을 처음 세우는 곳(방 데이터에서 벽과 구역에 닿지 않게 띄워 둔 네모) */
const GB_SPAWN = goldenbellMap.spawn;

function checkTeacher(password: unknown) {
  const expected = process.env.DF_TEACHER_PASSWORD;
  if (!expected) {
    throw new ServerError(RejectCode.noTeacherPassword, '서버에 선생님 비밀번호가 설정되어 있지 않습니다.');
  }
  if (password !== expected) {
    throw new ServerError(RejectCode.wrongPassword, '선생님 비밀번호가 맞지 않습니다.');
  }
}

/** 쓰이지 않는 4자리 방 코드 */
function freeCode(): string {
  for (;;) {
    const code = String(Math.floor(Math.random() * 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
    if (!matchMaker.getLocalRoomById(code)) return code;
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 아는 id만 남기고 겹친 것을 지운다. */
function knownIds(value: unknown, known: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && known.has(v)))];
}

/** 목록이 달라졌을 때만 바꾼다(바뀐 값만 보내므로). */
function replaceAll(list: string[] & { clear(): void }, values: string[]) {
  if (list.length === values.length && values.every((v, i) => list[i] === v)) return;
  list.clear();
  list.push(...values);
}

const ok: GbReply = { error: null };
const refuse = (error: string): GbReply => ({ error });

export class ClassRoom extends Room<{ state: ClassState }> {
  maxClients = MAX_CLIENTS;
  state = new ClassState();
  /** 골든벨 문제(정답 포함). 서버에만 둔다. */
  private questions: QuestionSet | null = null;
  private timer: { clear(): void } | null = null;

  onCreate(options: Partial<JoinOptions>) {
    checkTeacher(options?.password);
    this.roomId = freeCode();
    this.state.code = this.roomId;

    this.onMessage('move', (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !message || !isFiniteNumber(message.col) || !isFiniteNumber(message.row)) return;
      // 맵을 옮기는 사이에 온, 앞 맵의 위치는 버린다.
      if (message.map !== player.map) return;
      const size = MAP_SIZES[player.map];
      if (!size) return;
      player.col = Math.min(size.cols, Math.max(0, message.col));
      player.row = Math.min(size.rows, Math.max(0, message.row));
    });

    // 학생의 방탈출 진행 상태. 선생님의 CCTV 모드에 보인다.
    this.onMessage('status', (client: Client, message: StatusMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== 'student' || !message) return;
      const kind = message.activity === 'look' || message.activity === 'quiz' ? message.activity : '';
      const object = kind && typeof message.object === 'string' && ACTION_IDS.has(message.object) ? message.object : '';
      player.activity = object ? kind : '';
      player.activityObject = object;
      replaceAll(player.items, knownIds(message.items, ITEM_IDS));
      replaceAll(player.done, knownIds(message.done, ACTION_IDS));
      player.escaped = message.escaped === true;
    });

    // 골든벨(선생님만). 화면은 room.request()로 보내고 돌려준 값을 답으로 받는다.
    this.onMessage('gbFiles', (client: Client): GbFileInfo[] => (this.isTeacher(client) ? listQuestionFiles() : []));
    this.onMessage('gbStart', (client: Client, message: { file?: unknown }) => this.gbStart(client, message));
    this.onMessage('gbNext', (client: Client) => this.gbNext(client));
    this.onMessage('gbEnd', (client: Client) => this.gbEnd(client));

    console.log(`방 ${this.roomId}을 만들었습니다.`);
  }

  onJoin(client: Client, options: Partial<JoinOptions>) {
    const nickname = cleanNickname(options?.nickname);
    if (!nickname) throw new ServerError(RejectCode.badNickname, '닉네임이 알맞지 않습니다.');
    const teacher = typeof options?.password === 'string' && options.password !== '';
    if (teacher) checkTeacher(options.password);
    for (const p of this.state.players.values()) {
      if (p.nickname === nickname) throw new ServerError(RejectCode.nicknameTaken, '같은 닉네임이 이미 있습니다.');
    }
    const player = new Player();
    player.nickname = nickname;
    player.role = teacher ? 'teacher' : 'student';
    // 모르는 캐릭터면 기본 캐릭터로 받는다(거절하지 않는다).
    const character = options?.character;
    player.character = typeof character === 'string' && CHARACTER_IDS.has(character) ? character : DEFAULT_CHARACTER;
    player.col = school.start.col;
    player.row = school.start.row;
    // 골든벨을 하는 중에 들어오면 골든벨 맵으로 들어온다.
    if (this.state.goldenbell.phase !== '') this.enterGoldenBell(player);
    this.state.players.set(client.sessionId, player);
  }

  onDrop(client: Client) {
    // 들어오다 거절된 접속(닉네임 겹침 등)에도 onDrop이 불린다. 그때 기다리기를 걸면 오류로 서버 전체가 꺼지므로,
    // 실제로 들어와 있던 접속만 다시 붙기를 기다린다.
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.online = false;
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.online = true;
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log(`방 ${this.roomId}을 닫았습니다.`);
  }

  // ---- 골든벨 ----

  private isTeacher(client: Client) {
    return this.state.players.get(client.sessionId)?.role === 'teacher';
  }

  /** 골든벨 맵의 출발 자리(spawn) 안에 세우고 목숨·점수를 처음으로 되돌린다. 학교 맵의 자리는 화면이 기억한다. */
  private enterGoldenBell(p: Player) {
    p.map = 'goldenbell';
    p.col = GB_SPAWN.col + Math.random() * GB_SPAWN.w;
    p.row = GB_SPAWN.row + Math.random() * GB_SPAWN.h;
    p.gbLives = GB_LIVES;
    p.gbScore = 0;
    p.gbOut = false;
    p.gbRevive = 0;
    p.gbResult = '';
    p.gbAnswer = '';
  }

  private gbStart(client: Client, message: { file?: unknown }): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 골든벨을 시작할 수 있습니다.');
    if (this.state.goldenbell.phase !== '') return refuse('이미 골든벨을 하고 있습니다.');
    let set: QuestionSet;
    try {
      set = loadQuestionSet(typeof message?.file === 'string' ? message.file : '');
    } catch (e) {
      return refuse((e as Error).message);
    }
    this.questions = set;
    const gb = this.state.goldenbell;
    gb.title = set.title;
    gb.total = set.questions.length;
    gb.index = -1;
    this.clearQuestion();
    gb.phase = 'ready';
    for (const p of this.state.players.values()) this.enterGoldenBell(p);
    console.log(`방 ${this.roomId}: 골든벨 "${set.title}"(${set.questions.length}문제)을 시작했습니다.`);
    return ok;
  }

  /** 첫 문제 또는 다음 문제를 낸다. 마지막 문제의 정답을 공개한 뒤에는 결과(end)로 넘어간다. */
  private gbNext(client: Client): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 문제를 넘길 수 있습니다.');
    const gb = this.state.goldenbell;
    if (gb.phase !== 'ready' && gb.phase !== 'reveal') return refuse('지금은 다음 문제로 넘어갈 수 없습니다.');
    const questions = this.questions?.questions ?? [];
    const next = gb.index + 1;
    if (next >= questions.length) {
      this.clearQuestion();
      gb.phase = 'end';
      return ok;
    }
    const q = questions[next];
    gb.index = next;
    gb.type = q.type;
    gb.question = q.question;
    replaceAll(gb.choices, q.choices);
    gb.answer = '';
    gb.timeLeft = q.seconds;
    for (const p of this.state.players.values()) {
      p.gbResult = '';
      p.gbAnswer = '';
    }
    gb.phase = 'question';
    this.timer?.clear();
    this.timer = this.clock.setInterval(() => this.tick(), 1000);
    return ok;
  }

  private tick() {
    const gb = this.state.goldenbell;
    gb.timeLeft = Math.max(0, gb.timeLeft - 1);
    if (gb.timeLeft > 0) return;
    this.timer?.clear();
    this.timer = null;
    this.reveal();
  }

  /** 시간이 끝나면 학생마다 서 있는 구역으로 채점하고 정답을 공개한다. 구역 밖은 틀린 것으로 센다. */
  private reveal() {
    const gb = this.state.goldenbell;
    const q = this.questions?.questions[gb.index];
    if (!q) return;
    const zones = activeZones(GB_ZONES, q.type, q.choices.length);
    for (const p of this.state.players.values()) {
      if (p.role !== 'student' || p.map !== 'goldenbell') continue;
      p.gbAnswer = zoneAt(zones, p.col, p.row);
      judge(p, p.gbAnswer === q.answer);
    }
    gb.answer = q.answer;
    gb.phase = 'reveal';
  }

  /** 골든벨을 끝내고 모두 학교 맵으로 돌려보낸다(자리는 화면이 기억해 둔 곳). */
  private gbEnd(client: Client): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 골든벨을 끝낼 수 있습니다.');
    const gb = this.state.goldenbell;
    if (gb.phase === '') return refuse('골든벨을 하고 있지 않습니다.');
    this.timer?.clear();
    this.timer = null;
    this.questions = null;
    this.clearQuestion();
    gb.phase = '';
    gb.title = '';
    gb.total = 0;
    gb.index = -1;
    for (const p of this.state.players.values()) p.map = 'school';
    console.log(`방 ${this.roomId}: 골든벨을 끝냈습니다.`);
    return ok;
  }

  private clearQuestion() {
    const gb = this.state.goldenbell;
    gb.type = '';
    gb.question = '';
    replaceAll(gb.choices, []);
    gb.timeLeft = 0;
    gb.answer = '';
  }
}
