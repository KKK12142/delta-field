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
} from '../shared/protocol.ts';
import { ClassState, Player } from '../shared/schema.ts';

const ROWS = classroom.layout.length;
const COLS = classroom.layout[0].length;

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
    if (!this.state.players.has(client.sessionId)) return;
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log(`방 ${this.roomId}을 닫았습니다.`);
  }
}
