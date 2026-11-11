// 서버와의 연결. 방 만들기·들어가기, 내 위치 보내기, 연결 상태 알리기를 맡는다.
import { Client, type Room } from '@colyseus/sdk';
import { MOVE_INTERVAL_MS, ROOM_NAME, RejectCode, type JoinOptions, type Role } from '../../shared/protocol.ts';
import type { ClassState, Player } from '../../shared/schema.ts';

/** 개발 중에는 Vite가 /colyseus를 서버(2567)로 넘겨 주고, 수업용 서버는 같은 주소에서 바로 받는다. */
function endpoint() {
  return import.meta.env.DEV ? `${location.origin}/colyseus` : location.origin;
}

export type Entry =
  | { role: 'student'; nickname: string; code: string }
  | { role: 'teacher'; nickname: string; password: string; code: string };

export type ConnectionStatus = 'connected' | 'reconnecting' | 'closed';

export class Net {
  private lastSentAt = 0;
  private lastSent = { col: NaN, row: NaN };
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  constructor(
    readonly room: Room<any, ClassState>,
    readonly role: Role,
    readonly nickname: string,
  ) {
    room.onDrop(() => this.emit('reconnecting'));
    room.onReconnect(() => this.emit('connected'));
    room.onLeave(() => this.emit('closed'));
  }

  /** 방 코드(= 서버의 방 id) */
  get code() {
    return this.room.roomId;
  }

  get sessionId() {
    return this.room.sessionId;
  }

  /** 나를 뺀 접속자 */
  others(): [string, Player][] {
    const list: [string, Player][] = [];
    this.room.state.players.forEach((p, id) => {
      if (id !== this.room.sessionId) list.push([id, p]);
    });
    return list;
  }

  studentCount() {
    let n = 0;
    this.room.state.players.forEach((p) => {
      if (p.role === 'student') n++;
    });
    return n;
  }

  /** 위치가 바뀌었고 간격이 지났으면 보낸다. force면 간격을 따지지 않는다. */
  sendMove(col: number, row: number, force = false) {
    const now = performance.now();
    if (col === this.lastSent.col && row === this.lastSent.row) return;
    if (!force && now - this.lastSentAt < MOVE_INTERVAL_MS) return;
    this.room.send('move', { col, row });
    this.lastSentAt = now;
    this.lastSent = { col, row };
  }

  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emit(status: ConnectionStatus) {
    for (const l of this.statusListeners) l(status);
  }
}

/** 학생은 방 코드로 들어오고, 선생님은 코드가 없으면 새 방을 만든다. */
export async function connect(entry: Entry): Promise<Net> {
  const client = new Client(endpoint());
  if (entry.role === 'student') {
    const options: JoinOptions = { nickname: entry.nickname };
    return new Net(await client.joinById<ClassState>(entry.code, options), 'student', entry.nickname);
  }
  const options: JoinOptions = { nickname: entry.nickname, password: entry.password };
  const room = entry.code
    ? await client.joinById<ClassState>(entry.code, options)
    : await client.create<ClassState>(ROOM_NAME, options);
  return new Net(room, 'teacher', entry.nickname);
}

/** 들어가지 못한 까닭을 화면에 보일 문장으로 바꾼다. */
export function joinErrorText(error: unknown, entry: Entry): string {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case RejectCode.wrongPassword:
      return '선생님 비밀번호가 맞지 않습니다.';
    case RejectCode.noTeacherPassword:
      return '서버에 선생님 비밀번호가 설정되어 있지 않습니다. 서버를 켠 컴퓨터의 .env 파일에 비밀번호를 넣어야 합니다.';
    case RejectCode.nicknameTaken:
      return '같은 닉네임이 이미 있습니다. 다른 닉네임으로 들어갑니다.';
    case RejectCode.badNickname:
      return '닉네임은 1~12자로 씁니다.';
    case 522: // Colyseus: 그런 방이 없음
      return `방 코드 ${entry.code}인 방이 없습니다. 코드를 다시 확인합니다.`;
  }
  if (typeof code === 'string' || error instanceof TypeError) {
    return '서버에 연결하지 못했습니다. 서버가 켜져 있는지, 같은 와이파이에 있는지 확인합니다.';
  }
  return `들어가지 못했습니다(오류 ${String(code ?? '알 수 없음')}).`;
}
