// 수업 하나 = 방 하나. 선생님이 비밀번호로 만들고, 학생은 방 코드로 들어온다.
// 학교(교실·복도·실험실·운동장이 이어진 방탈출) 맵과 골든벨 맵이 있고, 골든벨을 시작하면 모두 골든벨 맵으로 옮긴다.
import { Room, ServerError, matchMaker, type AuthContext, type Client, type Deferred } from '@colyseus/core';
import school from '../src/data/school.json' with { type: 'json' };
import goldenbellMap from '../src/data/goldenbell.json' with { type: 'json' };
import characters from '../src/data/characters.json' with { type: 'json' };
import {
  GB_LIVES,
  GB_MAX_ANSWER,
  GB_MAX_LIVES,
  activeZones,
  answerDisplay,
  answerKey,
  judgeQuestion,
  matchAnswer,
  zoneAt,
  type GbScore,
  type Zones,
} from '../shared/goldenbell.ts';
import {
  ANNOUNCE_INTERVAL_MS,
  CODE_LENGTH,
  DEFAULT_CHARACTER,
  GATHER_SECONDS,
  MAX_CLIENTS,
  RECONNECT_SECONDS,
  RejectCode,
  classGroupName,
  cleanAnnounce,
  cleanNickname,
  type AnnounceBroadcast,
  type AnnounceMessage,
  type GbAcceptMessage,
  type GbFileInfo,
  type GbReply,
  type GbSubmitMessage,
  type GatherMessage,
  type JoinOptions,
  type MoveMessage,
  type OpenRoomInfo,
  type RoomClosedMessage,
  type StatusMessage,
} from '../shared/protocol.ts';
import { ClassState, Player } from '../shared/schema.ts';
import { listQuestionFiles, loadQuestionSet, type QuestionSet } from './questions.ts';
import { EscapeGame } from './EscapeGame.ts';
import { loadRoom, partOf } from '../src/data/room.ts';
import { listEscapeFiles, loadEscapeSet } from './escape.ts';
import { MiniGames } from './MiniGame.ts';
import { BLOCKED_TEXT, PEER_HEADER, checkTeacherAttempt, clientIp, hasTeacherPassword, teacherPasswordMatches } from './password.ts';
import type { EscapeFileInfo, HintCard, MissionAnswerMessage, MissionAnswerReply, MissionPressReply, MissionView } from '../shared/escape.ts';

/** 맵 id → 크기(칸) */
const MAP_SIZES: Record<string, { rows: number; cols: number }> = {
  school: { rows: school.layout.length, cols: school.layout[0].length },
  goldenbell: { rows: goldenbellMap.layout.length, cols: goldenbellMap.layout[0].length },
};
/** 사물 id → 열리는 부(2부 사물·장소는 2) */
const SCHOOL = loadRoom(school);
const OBJECT_PARTS = new Map(SCHOOL.objects.map((o) => [o.id, partOf(SCHOOL, o)]));
/** 미션을 단(살펴볼 수 있는) 사물 id */
const MISSION_OBJECT_IDS = new Set(school.objects.filter((o) => 'mission' in o).map((o) => o.id));
const GB_ZONES: Zones = goldenbellMap.zones;
const CHARACTER_IDS = new Set(characters.map((c) => c.id));
/** 골든벨 맵에서 학생의 발밑을 처음 세우는 곳(방 데이터에서 벽과 구역에 닿지 않게 띄워 둔 네모) */
const GB_SPAWN = goldenbellMap.spawn;

function checkTeacher(password: unknown) {
  if (!hasTeacherPassword()) {
    throw new ServerError(RejectCode.noTeacherPassword, '서버에 선생님 비밀번호가 설정되어 있지 않습니다.');
  }
  if (!teacherPasswordMatches(password)) {
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
  /** 강당으로 모으기: 시간이 다 되면 시작할 문제와 남은 시간을 세는 시계 */
  private gatherSet: QuestionSet | null = null;
  private gatherTimer: { clear(): void } | null = null;
  /** 단답형: 접속 id → 낸 답. 정답 공개 전에는 상태(모두에게 가는 값)에 넣지 않는다. */
  private shortAnswers = new Map<string, string>();
  /** 이번 문제를 채점하기 전의 목숨·점수(선생님이 단답형 답을 정답으로 인정하거나 거둘 때 다시 채점한다) */
  private beforeJudge = new Map<string, GbScore>();
  /** 전체 공지: 선생님 접속 id → 마지막으로 보낸 시각(ms). 너무 잦은 공지를 막는다. */
  private lastAnnounceAt = new Map<string, number>();
  /**
   * 이어 하기(2026-11-13 교사 요청): 방에서 나간 사람의 기록. 닉네임 → 나갈 때의 상태와, 그 뒤 방 전체에 일어난 일을 맞추는 데 쓰는 번호들.
   * 같은 방에 같은 닉네임·같은 역할로 들어오면 이 기록을 이어 받는다.
   */
  private departed = new Map<string, { player: Player; sessionId: string; escapeVersion: number; gbGame: number; totalsEpoch: number }>();
  /** 합계를 처음으로 돌린 횟수와 골든벨을 시작한 횟수(나간 사이에 일어났는지 보려고) */
  private totalsEpoch = 0;
  private gbGame = 0;
  /** 다시 붙기를 기다리는 접속 id → 기다림. 같은 닉네임이 새로 들어오면 끝낸다. */
  private reconnections = new Map<string, Deferred<Client>>();
  /** 이어 받아 들어온 접속 id(화면이 한 번 물어 안내를 띄운다) */
  private resumed = new Set<string>();
  /** 방을 만든 시각(ms). 선생님 첫 화면의 열린 방 목록에 쓴다. */
  readonly openedAt = Date.now();
  private readonly escape = new EscapeGame(this.state);
  private readonly mini = new MiniGames(this.state, this.clock);

  /**
   * 방 만들기·들어가기(matchmake) 때 먼저 불린다. 선생님(비밀번호를 넣음)이면 같은 IP의 잦은 실패를 막고 비밀번호를 본다.
   * 학생은 막지 않는다. 비밀번호는 onCreate·onJoin에서도 한 번 더 본다(checkTeacher).
   */
  static async onAuth(_token: string | undefined, options: Partial<JoinOptions>, context: AuthContext) {
    const password = options?.password;
    if (typeof password !== 'string' || password === '') return true;
    const ip = clientIp(context.headers.get(PEER_HEADER), context.headers.get('x-forwarded-for'));
    switch (checkTeacherAttempt(ip, password, '방 만들기·들어가기')) {
      case 'unset':
        throw new ServerError(RejectCode.noTeacherPassword, '서버에 선생님 비밀번호가 설정되어 있지 않습니다.');
      case 'blocked':
        throw new ServerError(RejectCode.tooManyTries, BLOCKED_TEXT);
      case 'wrong':
        throw new ServerError(RejectCode.wrongPassword, '선생님 비밀번호가 맞지 않습니다.');
    }
    return true;
  }

  onCreate(options: Partial<JoinOptions>) {
    checkTeacher(options?.password);
    this.roomId = freeCode();
    this.state.code = this.roomId;
    // 방의 시계(초). 막힌 학생을 셀 때 쓴다.
    this.clock.setInterval(() => {
      this.state.now += 1;
    }, 1000);

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

    // 학생이 지금 하는 일. 선생님의 CCTV 모드에 보인다.
    this.onMessage('status', (client: Client, message: StatusMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== 'student' || !message) return;
      const kind = message.activity === 'look' || message.activity === 'quiz' ? message.activity : '';
      const object = kind && typeof message.object === 'string' && MISSION_OBJECT_IDS.has(message.object) ? message.object : '';
      player.activity = object ? kind : '';
      player.activityObject = object;
    });

    // 방탈출: 자료 파일 고르기(선생님), 미션 살펴보기·답 내기·순서 누르기·힌트 수첩(모두). 채점은 서버가 한다.
    this.onMessage('escapeFiles', (client: Client): EscapeFileInfo[] => (this.isTeacher(client) ? listEscapeFiles() : []));
    this.onMessage('escapeLoad', (client: Client, message: { file?: unknown }) => this.escapeLoad(client, message));
    this.onMessage('missionOpen', (client: Client, message: { object?: unknown }): MissionView => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.map !== 'school') return { kind: 'none', text: '지금은 살펴볼 수 없습니다.' };
      if (this.mini.playing) return { kind: 'none', text: '미니게임 중에는 살펴볼 수 없습니다.' };
      if ((OBJECT_PARTS.get(String(message?.object)) ?? 1) > this.state.part) {
        return { kind: 'none', text: '아직 열리지 않은 곳입니다. 선생님이 2부를 열면 살펴볼 수 있습니다.' };
      }
      return this.escape.open(p, message?.object);
    });
    this.onMessage('missionAnswer', (client: Client, message: MissionAnswerMessage): MissionAnswerReply => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.map !== 'school' || this.mini.playing) return { correct: false, reward: null, clue: '', error: '지금은 답을 낼 수 없습니다.' };
      return this.escape.answer(p, message?.object, message?.answer);
    });
    this.onMessage('missionPress', (client: Client, message: { object?: unknown }): MissionPressReply => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.map !== 'school' || this.mini.playing || (OBJECT_PARTS.get(String(message?.object)) ?? 1) > this.state.part) {
        return { step: 0, total: 0, wrong: false, reward: null, error: '지금은 누를 수 없습니다.' };
      }
      return this.escape.press(p, message?.object);
    });
    this.onMessage('myHints', (client: Client): HintCard[] => {
      const p = this.state.players.get(client.sessionId);
      return p ? this.escape.hints(p) : [];
    });

    // 골든벨(선생님만). 화면은 room.request()로 보내고 돌려준 값을 답으로 받는다.
    this.onMessage('gbFiles', (client: Client): GbFileInfo[] => (this.isTeacher(client) ? listQuestionFiles() : []));
    this.onMessage('gbStart', (client: Client, message: { file?: unknown }) => this.gbStart(client, message));
    this.onMessage('gbGather', (client: Client, message: GatherMessage) => this.gbGather(client, message));
    this.onMessage('gbGatherCancel', (client: Client) => this.gbGatherCancel(client));
    this.onMessage('openPart', (client: Client, message: { part?: unknown }) => this.openPart(client, message));
    // 미니게임(shared/minigame.ts): 선생님이 시작·그만두기, 학생은 보물 줍기·공에 맞음·줄 당기기. 화면이 서버 시계를 맞추려고 clock을 묻는다.
    this.onMessage('miniStart', (client: Client, message: { kind?: unknown }): GbReply => {
      if (!this.isTeacher(client)) return refuse('선생님만 미니게임을 시작할 수 있습니다.');
      const error = this.mini.start(message?.kind);
      return error ? refuse(error) : ok;
    });
    this.onMessage('miniStop', (client: Client): GbReply => {
      if (!this.isTeacher(client)) return refuse('선생님만 미니게임을 그만둘 수 있습니다.');
      if (!this.mini.active) return refuse('미니게임을 하고 있지 않습니다.');
      this.mini.stop();
      return ok;
    });
    this.onMessage('miniPick', (client: Client, message: { id?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) this.mini.pick(client.sessionId, p, message?.id);
    });
    this.onMessage('miniHit', (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) this.mini.hit(client.sessionId, p);
    });
    this.onMessage('miniTug', (client: Client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) this.mini.tug(client.sessionId, p);
    });
    this.onMessage('clock', (): number => Date.now());
    // 이어 받아 들어왔는지(한 번만 true)
    this.onMessage('resumed', (client: Client): boolean => this.resumed.delete(client.sessionId));
    this.onMessage('announce', (client: Client, message: AnnounceMessage) => this.announce(client, message));
    this.onMessage('gbNext', (client: Client) => this.gbNext(client));
    this.onMessage('gbClose', (client: Client) => this.gbClose(client));
    this.onMessage('gbResetTotal', (client: Client) => this.gbResetTotal(client));
    this.onMessage('gbEnd', (client: Client) => this.gbEnd(client));
    this.onMessage('gbSubmit', (client: Client, message: GbSubmitMessage) => this.gbSubmit(client, message));
    this.onMessage('gbAccept', (client: Client, message: GbAcceptMessage) => this.gbAccept(client, message));

    console.log(`방 ${this.roomId}을 만들었습니다.`);
  }

  /** 선생님 첫 화면의 열린 방 목록 한 줄(접속 중인 사람만 센다) */
  summary(): OpenRoomInfo {
    let teachers = 0;
    let students = 0;
    for (const p of this.state.players.values()) {
      if (!p.online) continue;
      if (p.role === 'teacher') teachers++;
      else students++;
    }
    const activity = this.mini.active
      ? '미니게임'
      : this.state.goldenbell.phase !== ''
        ? '골든벨'
        : this.state.gatherLeft > 0
          ? '강당으로 모으는 중'
          : `방탈출 ${this.state.part}부`;
    return { code: this.roomId, openedAt: this.openedAt, teachers, students, activity };
  }

  /** 선생님이 첫 화면에서 방을 닫는다. 모두에게 안내를 보낸 뒤 연결을 끊는다(다시 붙기 없음). */
  closeByTeacher() {
    const message: RoomClosedMessage = { text: '선생님이 방을 닫았습니다.' };
    this.broadcast('roomClosed', message);
    console.log(`방 ${this.roomId}을 선생님이 닫았습니다.`);
    void this.disconnect();
  }

  onJoin(client: Client, options: Partial<JoinOptions>) {
    const nickname = cleanNickname(options?.nickname);
    if (!nickname) throw new ServerError(RejectCode.badNickname, '닉네임이 알맞지 않습니다.');
    const teacher = typeof options?.password === 'string' && options.password !== '';
    if (teacher) checkTeacher(options.password);
    const role = teacher ? 'teacher' : 'student';
    // 같은 닉네임이 다시 붙기를 기다리는 중이면 그 자리를 넘겨받는다. 지금 접속 중이거나 역할이 다르면 거절한다.
    let waiting: { id: string; player: Player } | null = null;
    for (const [id, p] of this.state.players) {
      if (p.nickname !== nickname) continue;
      if (p.online || p.role !== role) throw new ServerError(RejectCode.nicknameTaken, '같은 닉네임이 지금 들어와 있습니다.');
      waiting = { id, player: p };
    }
    // 모르는 캐릭터면 기본 캐릭터로 받는다(거절하지 않는다). 이어 하기에서도 캐릭터는 새로 고른 것을 쓴다.
    const character = options?.character;
    const characterId = typeof character === 'string' && CHARACTER_IDS.has(character) ? character : DEFAULT_CHARACTER;
    const record = waiting ? null : this.departed.get(nickname);
    if (waiting || (record && record.player.role === role)) {
      const player = waiting ? this.takeOver(waiting.id, waiting.player, client.sessionId) : this.restore(record!);
      this.departed.delete(nickname);
      player.character = characterId;
      player.online = true;
      player.activity = '';
      player.activityObject = '';
      player.lastProgressAt = this.state.now;
      this.state.players.set(client.sessionId, player);
      this.resumed.add(client.sessionId);
      console.log(`방 ${this.roomId}: ${nickname} 다시 들어옴(이어 하기).`);
      return;
    }
    const player = new Player();
    player.nickname = nickname;
    player.role = role;
    player.character = characterId;
    // 반도 모르는 값이면 ''(반 없음)으로 받는다. 선생님은 반이 없다.
    player.classGroup = !teacher && classGroupName(String(options?.classGroup ?? '')) ? String(options.classGroup) : '';
    player.col = school.start.col;
    player.row = school.start.row;
    player.lastProgressAt = this.state.now;
    // 골든벨을 하는 중에 들어오면 골든벨 맵으로 들어온다.
    if (this.state.goldenbell.phase !== '') this.enterGoldenBell(player);
    this.state.players.set(client.sessionId, player);
  }

  /** 다시 붙기를 기다리던 자리를 새 접속이 넘겨받는다. 옛 접속의 기다림은 끝낸다(옛 접속의 onLeave는 아무것도 남기지 않는다). */
  private takeOver(oldId: string, old: Player, newId: string): Player {
    const player = old.clone();
    this.state.players.delete(oldId);
    const answer = this.shortAnswers.get(oldId);
    this.shortAnswers.delete(oldId);
    if (answer !== undefined) this.shortAnswers.set(newId, answer);
    const before = this.beforeJudge.get(oldId);
    this.beforeJudge.delete(oldId);
    if (before) this.beforeJudge.set(newId, before);
    this.lastAnnounceAt.delete(oldId);
    this.leaveMiniRound(oldId, player);
    this.reconnections.get(oldId)?.reject(false);
    this.reconnections.delete(oldId);
    return player;
  }

  /** 나간 사이에 방 전체에 일어난 일(방탈출 자료 바꾸기, 골든벨 시작·끝, 합계 처음으로)을 기록에 맞춘 뒤 돌려준다. */
  private restore(record: { player: Player; sessionId: string; escapeVersion: number; gbGame: number; totalsEpoch: number }): Player {
    const p = record.player;
    if (record.escapeVersion !== this.state.escape.version) {
      p.items.clear();
      p.done.clear();
      p.hints.clear();
      p.pressed.clear();
      p.wrongs.clear();
      p.finished = false;
      p.bonusHeart = false;
    }
    const playing = this.state.goldenbell.phase !== '';
    const sameGame = record.gbGame === this.gbGame;
    const wasIn = p.map === 'goldenbell';
    // 나간 사이에 합계를 처음으로 돌렸으면 합계를 지운다. 같은 판을 하는 중이 아니면 이번 판 점수도(gbResetTotal과 같게).
    const reset = record.totalsEpoch !== this.totalsEpoch;
    if (reset) {
      p.gbTotal = 0;
      if (!(playing && sameGame)) p.gbScore = 0;
    }
    if (!sameGame) {
      // 나간 사이에 새 골든벨이 시작됐다: 앞 판 점수를 합계에 넣는다(beginGoldenBell과 같게).
      if (!reset) p.gbTotal += p.gbScore;
      p.gbScore = 0;
      if (playing) this.enterGoldenBell(p);
      else p.map = 'school';
    } else if (playing && !wasIn) this.enterGoldenBell(p);
    else if (!playing) p.map = 'school';
    // 골든벨 맵의 자리는 학교 맵에서 쓸 수 없으므로 시작 위치로 둔다.
    if (wasIn && p.map === 'school') {
      p.col = school.start.col;
      p.row = school.start.row;
    }
    p.gbResult = playing && p.map === 'goldenbell' ? p.gbResult : '';
    this.leaveMiniRound(record.sessionId, p);
    return p;
  }

  /** 미니게임을 하는 중에 다시 들어오면 그 판은 빠진 것으로 둔다(점수 0, 탈락 표시 없음, 옛 id는 이번 판에서 뺌). */
  private leaveMiniRound(oldId: string, p: Player) {
    this.mini.forget(oldId);
    p.miniScore = 0;
    p.miniOut = false;
  }

  onDrop(client: Client) {
    // 들어오다 거절된 접속(닉네임 겹침 등)에도 onDrop이 불린다. 그때 기다리기를 걸면 오류로 서버 전체가 꺼지므로,
    // 실제로 들어와 있던 접속만 다시 붙기를 기다린다.
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.online = false;
    this.reconnections.set(client.sessionId, this.allowReconnection(client, RECONNECT_SECONDS));
  }

  onReconnect(client: Client) {
    this.reconnections.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player) player.online = true;
  }

  onLeave(client: Client) {
    this.reconnections.delete(client.sessionId);
    this.resumed.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    // 이어 하기: 나간 사람의 기록을 닉네임으로 남겨 둔다(방이 살아 있는 동안).
    if (player) {
      this.departed.set(player.nickname, {
        player: player.clone(),
        sessionId: client.sessionId,
        escapeVersion: this.state.escape.version,
        gbGame: this.gbGame,
        totalsEpoch: this.totalsEpoch,
      });
    }
    this.state.players.delete(client.sessionId);
    if (this.shortAnswers.delete(client.sessionId)) this.state.goldenbell.submitted = this.shortAnswers.size;
    this.beforeJudge.delete(client.sessionId);
    this.lastAnnounceAt.delete(client.sessionId);
  }

  onDispose() {
    this.mini.dispose();
    console.log(`방 ${this.roomId}을 닫았습니다.`);
  }

  /**
   * 전체 공지: 선생님이 보낸 글을 방의 모두(학교 맵·골든벨 맵·미니게임 중 모두, 보낸 선생님 포함)에게 한 번 보낸다.
   * 상태에 남기지 않으므로 나중에 들어온 사람은 보지 않는다.
   */
  private announce(client: Client, message: AnnounceMessage): GbReply {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== 'teacher') return refuse('선생님만 전체 공지를 보낼 수 있습니다.');
    const text = cleanAnnounce(message?.text);
    if (!text) return refuse('보낼 글을 씁니다.');
    const now = Date.now();
    if (now - (this.lastAnnounceAt.get(client.sessionId) ?? -Infinity) < ANNOUNCE_INTERVAL_MS) return refuse('방금 공지를 보냈습니다. 잠시 뒤 다시 보냅니다.');
    this.lastAnnounceAt.set(client.sessionId, now);
    const out: AnnounceBroadcast = { text, from: player.nickname };
    this.broadcast('announce', out);
    console.log(`방 ${this.roomId}: 전체 공지를 보냈습니다(${text.length}자).`);
    return ok;
  }

  // ---- 골든벨 ----

  private isTeacher(client: Client) {
    return this.state.players.get(client.sessionId)?.role === 'teacher';
  }

  /**
   * 골든벨 맵의 출발 자리(spawn) 안에 세우고 목숨·점수를 처음으로 되돌린다. 학교 맵의 자리는 화면이 기억한다.
   * 보너스 미션 하트, 미니게임(줄다리기) 하트가 남아 있으면 하나씩 목숨에 더해(최대 GB_MAX_LIVES) 시작하고 하트를 쓴다.
   */
  private enterGoldenBell(p: Player) {
    p.map = 'goldenbell';
    p.col = GB_SPAWN.col + Math.random() * GB_SPAWN.w;
    p.row = GB_SPAWN.row + Math.random() * GB_SPAWN.h;
    p.gbLives = Math.min(GB_MAX_LIVES, GB_LIVES + (p.bonusHeart ? 1 : 0) + (p.miniHeart ? 1 : 0));
    p.bonusHeart = false;
    p.miniHeart = false;
    p.gbScore = 0;
    p.gbOut = false;
    p.gbRevive = 0;
    p.gbResult = '';
    p.gbAnswer = '';
  }

  // ---- 방탈출 자료 ----

  /** 선생님이 방탈출 자료 파일을 고른다. 모든 사람의 방탈출 진행이 처음으로 돌아간다. 지금 쓰는 파일을 다시 고르면 아무 일도 하지 않는다. */
  private escapeLoad(client: Client, message: { file?: unknown }): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 방탈출 자료를 고를 수 있습니다.');
    if (this.escape.loaded && message?.file === this.escape.file) return ok;
    try {
      const set = loadEscapeSet(typeof message?.file === 'string' ? message.file : '');
      this.escape.load(set);
      console.log(`방 ${this.roomId}: 방탈출 자료 "${set.title}"(${set.file})을 골랐습니다.`);
      return ok;
    } catch (e) {
      return refuse((e as Error).message);
    }
  }

  /** 문제 파일을 읽는다. 읽지 못하면 까닭을 글로 돌려준다. */
  private readSet(file: unknown): QuestionSet | string {
    try {
      return loadQuestionSet(typeof file === 'string' ? file : '');
    } catch (e) {
      return (e as Error).message;
    }
  }

  private gbStart(client: Client, message: { file?: unknown }): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 골든벨을 시작할 수 있습니다.');
    if (this.state.goldenbell.phase !== '') return refuse('이미 골든벨을 하고 있습니다.');
    if (this.mini.active) return refuse('미니게임을 하는 중에는 골든벨을 시작할 수 없습니다.');
    const set = this.readSet(message?.file);
    if (typeof set === 'string') return refuse(set);
    this.beginGoldenBell(set);
    return ok;
  }

  /** 모두 골든벨 맵으로 옮기고 첫 문제 전(ready)으로 둔다. 강당으로 모으던 중이면 그만둔다. */
  private beginGoldenBell(set: QuestionSet) {
    this.stopGather();
    this.questions = set;
    const gb = this.state.goldenbell;
    gb.title = set.title;
    gb.total = set.questions.length;
    gb.index = -1;
    this.clearQuestion();
    gb.phase = 'ready';
    // 앞 판의 점수를 합계에 넣고 새 판을 센다(합산 순위).
    for (const p of this.state.players.values()) p.gbTotal += p.gbScore;
    this.state.gbRounds += 1;
    this.gbGame += 1;
    for (const p of this.state.players.values()) this.enterGoldenBell(p);
    console.log(`방 ${this.roomId}: 골든벨 "${set.title}"(${set.questions.length}문제)을 시작했습니다.`);
  }

  /**
   * 강당으로 모으기: 남은 시간(1·3·5분)을 모두의 화면에 띄우고, 0이 되면 고른 문제 파일로 골든벨을 시작한다.
   * 0초를 고르면 바로 옮긴다. 문제 파일은 지금 읽어 두어 형식이 틀리면 바로 알린다.
   */
  private gbGather(client: Client, message: GatherMessage): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 강당으로 모을 수 있습니다.');
    if (this.state.goldenbell.phase !== '') return refuse('이미 골든벨을 하고 있습니다.');
    if (this.mini.active) return refuse('미니게임을 하는 중에는 강당으로 모을 수 없습니다.');
    if (this.state.gatherLeft > 0) return refuse('이미 강당으로 모으는 중입니다.');
    const seconds = Number(message?.seconds);
    if (!(GATHER_SECONDS as readonly number[]).includes(seconds)) return refuse('남은 시간을 1분, 3분, 5분 가운데에서 고릅니다.');
    const set = this.readSet(message?.file);
    if (typeof set === 'string') return refuse(set);
    if (seconds === 0) {
      this.beginGoldenBell(set);
      return ok;
    }
    this.gatherSet = set;
    this.state.gatherTitle = set.title;
    this.state.gatherLeft = seconds;
    this.gatherTimer = this.clock.setInterval(() => {
      this.state.gatherLeft = Math.max(0, this.state.gatherLeft - 1);
      if (this.state.gatherLeft === 0 && this.gatherSet) this.beginGoldenBell(this.gatherSet);
    }, 1000);
    console.log(`방 ${this.roomId}: ${seconds}초 뒤 강당으로 모읍니다("${set.title}").`);
    return ok;
  }

  private gbGatherCancel(client: Client): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 모으기를 그만둘 수 있습니다.');
    if (this.state.gatherLeft === 0) return refuse('강당으로 모으는 중이 아닙니다.');
    this.stopGather();
    return ok;
  }

  private stopGather() {
    this.gatherTimer?.clear();
    this.gatherTimer = null;
    this.gatherSet = null;
    this.state.gatherLeft = 0;
    this.state.gatherTitle = '';
  }

  /** 2부 열기. 지금은 서버 상태만 바꾼다(2부 장소의 문 잇기는 맵을 넓힐 때 한다). */
  private openPart(client: Client, message: { part?: unknown }): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 2부를 열 수 있습니다.');
    if (message?.part !== 2) return refuse('열 수 있는 부는 2부입니다.');
    if (this.state.part === 2) return refuse('2부는 이미 열려 있습니다.');
    this.state.part = 2;
    this.escape.resetProgressClock();
    console.log(`방 ${this.roomId}: 2부를 열었습니다.`);
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
    gb.nonsense = q.nonsense;
    replaceAll(gb.choices, q.choices);
    gb.answer = '';
    gb.explain = '';
    gb.timeLeft = q.seconds;
    this.shortAnswers.clear();
    this.beforeJudge.clear();
    gb.submitted = 0;
    replaceAll(gb.accepted, []);
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

  /**
   * 시간이 끝나면 채점하고 정답을 공개한다. OX·객관식은 서 있는 구역으로(구역 밖은 틀림),
   * 단답형은 마지막에 낸 답으로(내지 않으면 틀림) 채점한다.
   */
  private reveal() {
    const gb = this.state.goldenbell;
    const q = this.questions?.questions[gb.index];
    if (!q) return;
    const zones = activeZones(GB_ZONES, q.type, q.choices.length);
    this.beforeJudge.clear();
    for (const [id, p] of this.state.players) {
      if (p.role !== 'student' || p.map !== 'goldenbell') continue;
      this.beforeJudge.set(id, scoreOf(p));
      if (q.type === 'short') {
        p.gbAnswer = this.shortAnswers.get(id) ?? '';
        judgeQuestion(p, matchAnswer(p.gbAnswer, q.answers), q.nonsense);
      } else {
        p.gbAnswer = zoneAt(zones, p.col, p.row);
        judgeQuestion(p, p.gbAnswer === q.answer, q.nonsense);
      }
    }
    gb.answer = q.type === 'short' ? answerDisplay(q.answers) : q.answer;
    gb.explain = q.explain;
    gb.phase = 'reveal';
  }

  /** 학생이 단답형 답을 낸다. 제한 시간 안에는 다시 낼 수 있고, 마지막에 낸 답으로 채점한다. */
  private gbSubmit(client: Client, message: GbSubmitMessage): GbReply {
    const p = this.state.players.get(client.sessionId);
    const gb = this.state.goldenbell;
    if (!p || p.role !== 'student' || p.map !== 'goldenbell') return refuse('학생만 답을 낼 수 있습니다.');
    if (gb.phase !== 'question' || gb.type !== 'short' || gb.timeLeft <= 0) return refuse('지금은 답을 낼 수 없습니다.');
    const text = typeof message?.text === 'string' ? message.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) return refuse('답을 써서 냅니다.');
    if (text.length > GB_MAX_ANSWER) return refuse(`답은 ${GB_MAX_ANSWER}자 안으로 씁니다.`);
    this.shortAnswers.set(client.sessionId, text);
    gb.submitted = this.shortAnswers.size;
    return ok;
  }

  /**
   * 선생님이 단답형 정답 공개 뒤, 같은 꼴(answerKey)의 답을 낸 학생들을 정답으로 인정하거나 인정을 거둔다.
   * 채점 전의 목숨·점수로 되돌린 뒤 다시 채점한다.
   */
  private gbAccept(client: Client, message: GbAcceptMessage): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 정답을 인정할 수 있습니다.');
    const gb = this.state.goldenbell;
    const q = this.questions?.questions[gb.index];
    if (gb.phase !== 'reveal' || q?.type !== 'short') return refuse('단답형 정답을 공개한 뒤에만 인정할 수 있습니다.');
    const key = typeof message?.key === 'string' ? message.key : '';
    const accept = message?.accept === true;
    const members = [...this.state.players].filter(([id, p]) => this.beforeJudge.has(id) && p.gbAnswer && answerKey(p.gbAnswer) === key);
    if (!key || !members.length) return refuse('그 답을 낸 학생이 없습니다.');
    if (matchAnswer(members[0][1].gbAnswer, q.answers)) return refuse('이미 정답으로 채점한 답입니다.');
    if (accept === gb.accepted.includes(key)) return ok;
    for (const [id, p] of members) {
      Object.assign(p, this.beforeJudge.get(id));
      judgeQuestion(p, accept, q.nonsense);
    }
    replaceAll(gb.accepted, accept ? [...gb.accepted, key] : gb.accepted.filter((k) => k !== key));
    return ok;
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
    this.escape.resetProgressClock();
    console.log(`방 ${this.roomId}: 골든벨을 끝냈습니다.`);
    return ok;
  }

  /** 마감: 푸는 중인 문제의 남은 시간을 0으로 하고 바로 채점해 정답을 공개한다. */
  private gbClose(client: Client): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 마감할 수 있습니다.');
    const gb = this.state.goldenbell;
    if (gb.phase !== 'question') return refuse('문제를 푸는 중에만 마감할 수 있습니다.');
    this.timer?.clear();
    this.timer = null;
    gb.timeLeft = 0;
    this.reveal();
    return ok;
  }

  /** 합산 순위를 처음으로: 앞 판들의 합계를 지운다. 골든벨을 하는 중이면 이번 판부터 다시 센다. */
  private gbResetTotal(client: Client): GbReply {
    if (!this.isTeacher(client)) return refuse('선생님만 합계를 처음으로 돌릴 수 있습니다.');
    const playing = this.state.goldenbell.phase !== '';
    for (const p of this.state.players.values()) {
      p.gbTotal = 0;
      if (!playing) p.gbScore = 0;
    }
    this.state.gbRounds = playing ? 1 : 0;
    this.totalsEpoch += 1;
    return ok;
  }

  private clearQuestion() {
    const gb = this.state.goldenbell;
    gb.type = '';
    gb.question = '';
    gb.nonsense = false;
    replaceAll(gb.choices, []);
    gb.timeLeft = 0;
    gb.answer = '';
    gb.explain = '';
    gb.submitted = 0;
    replaceAll(gb.accepted, []);
    this.shortAnswers.clear();
    this.beforeJudge.clear();
  }
}

/** 채점에 쓰는 값만 떼어 둔다. */
function scoreOf(p: Player): GbScore {
  return { gbLives: p.gbLives, gbScore: p.gbScore, gbOut: p.gbOut, gbRevive: p.gbRevive, gbResult: p.gbResult };
}
