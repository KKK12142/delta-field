// 수업 하나 = 방 하나. 선생님이 비밀번호로 만들고, 학생은 방 코드로 들어온다.
import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import classroom from '../src/data/classroom.json' with { type: 'json' };
import {
  CODE_LENGTH,
  MAX_CLIENTS,
  RECONNECT_SECONDS,
  RejectCode,
  cleanNickname,
  type JoinOptions,
  type MoveMessage,
  type StatusMessage,
} from '../shared/protocol.ts';
import { ClassState, Player } from '../shared/schema.ts';

const ROWS = classroom.layout.length;
const COLS = classroom.layout[0].length;
const ITEM_IDS = new Set(Object.keys(classroom.items));
/** 살펴볼 수 있는(action이 있는) 사물 id */
const ACTION_IDS = new Set(classroom.objects.filter((o) => 'action' in o).map((o) => o.id));

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

export class ClassRoom extends Room<{ state: ClassState }> {
  maxClients = MAX_CLIENTS;
  state = new ClassState();

  onCreate(options: Partial<JoinOptions>) {
    checkTeacher(options?.password);
    this.roomId = freeCode();
    this.state.code = this.roomId;

    this.onMessage('move', (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !message || !isFiniteNumber(message.col) || !isFiniteNumber(message.row)) return;
      player.col = Math.min(COLS, Math.max(0, message.col));
      player.row = Math.min(ROWS, Math.max(0, message.row));
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
    player.col = classroom.start.col;
    player.row = classroom.start.row;
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
}
