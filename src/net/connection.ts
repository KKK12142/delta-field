// 서버와의 연결. 방 만들기·들어가기, 내 위치와 진행 상태 보내기, 골든벨 요청, 연결 상태 알리기를 맡는다.
import { Client, type Room } from '@colyseus/sdk';
import {
  MOVE_INTERVAL_MS,
  ROOM_NAME,
  RejectCode,
  type AnnounceBroadcast,
  type AnnounceMessage,
  type GbFileInfo,
  type GbAcceptMessage,
  type GbReply,
  type GbSubmitMessage,
  type GatherMessage,
  type JoinOptions,
  type MapId,
  type MoveMessage,
  type Role,
  type StatusMessage,
} from '../../shared/protocol.ts';
import type { ClassState, Escape, GoldenBell, MiniGame, Player } from '../../shared/schema.ts';
import type { MiniKind, MiniPickMessage, MiniStartMessage } from '../../shared/minigame.ts';
import type { EscapeFileInfo, HintCard, MissionAnswerMessage, MissionAnswerReply, MissionPressReply, MissionView } from '../../shared/escape.ts';

/** 개발 중에는 Vite가 /colyseus를 서버(2567)로 넘겨 주고, 수업용 서버는 같은 주소에서 바로 받는다. */
function endpoint() {
  return import.meta.env.DEV ? `${location.origin}/colyseus` : location.origin;
}

export type Entry =
  | { role: 'student'; nickname: string; character: string; classGroup: string; code: string }
  | { role: 'teacher'; nickname: string; character: string; password: string; code: string };

export type ConnectionStatus = 'connected' | 'reconnecting' | 'closed';

export class Net {
  private lastSentAt = 0;
  private lastSent = { col: NaN, row: NaN, map: '' };
  private lastStatus = '';
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private readonly announceListeners = new Set<(message: AnnounceBroadcast) => void>();

  constructor(
    readonly room: Room<any, ClassState>,
    readonly role: Role,
    readonly nickname: string,
    /** 고른 캐릭터(서버가 받은 값은 me().character) */
    readonly character: string,
  ) {
    room.onDrop(() => this.emit('reconnecting'));
    room.onReconnect(() => this.emit('connected'));
    room.onLeave(() => this.emit('closed'));
    room.onMessage('announce', (message: AnnounceBroadcast) => {
      if (typeof message?.text !== 'string') return;
      for (const l of this.announceListeners) l(message);
    });
  }

  /** 방 코드(= 서버의 방 id) */
  get code() {
    return this.room.roomId;
  }

  get sessionId() {
    return this.room.sessionId;
  }

  /** 서버가 맞춰 준 내 상태 */
  me(): Player | undefined {
    return this.room.state.players?.get(this.room.sessionId);
  }

  get goldenbell(): GoldenBell {
    return this.room.state.goldenbell;
  }

  /** 강당으로 모으기: 남은 시간(초, 0이면 모으는 중이 아님)과 골든벨 이름 */
  get gather(): { left: number; title: string } {
    return { left: this.room.state.gatherLeft ?? 0, title: this.room.state.gatherTitle ?? '' };
  }

  /** 지금 열린 방탈출 부(1·2) */
  get part(): number {
    return this.room.state.part ?? 1;
  }

  /** 나를 뺀 접속자. map을 주면 그 맵에 있는 사람만 */
  others(map?: MapId): [string, Player][] {
    const list: [string, Player][] = [];
    this.room.state.players.forEach((p, id) => {
      if (id !== this.room.sessionId && (!map || p.map === map)) list.push([id, p]);
    });
    return list;
  }

  /** 학생만(나를 빼고) */
  students(map?: MapId): [string, Player][] {
    return this.others(map).filter(([, p]) => p.role === 'student');
  }

  studentCount() {
    let n = 0;
    this.room.state.players.forEach((p) => {
      if (p.role === 'student') n++;
    });
    return n;
  }

  /** 위치가 바뀌었고 간격이 지났으면 보낸다. force면 간격을 따지지 않는다. */
  sendMove(map: MapId, col: number, row: number, force = false) {
    const now = performance.now();
    if (col === this.lastSent.col && row === this.lastSent.row && map === this.lastSent.map) return;
    if (!force && now - this.lastSentAt < MOVE_INTERVAL_MS) return;
    const message: MoveMessage = { col, row, map };
    this.room.send('move', message);
    this.lastSentAt = now;
    this.lastSent = { col, row, map };
  }

  /** 지금 하는 일이 바뀌었으면 보낸다. 연결이 끊긴 동안 보낸 것은 다시 붙으면 SDK가 보낸다. */
  sendStatus(status: StatusMessage) {
    const key = JSON.stringify(status);
    if (key === this.lastStatus) return;
    this.room.send('status', status);
    this.lastStatus = key;
  }

  // ---- 방탈출. 미션 채점과 진행(물건, 마친 미션, 힌트 카드)은 서버가 맡는다. ----

  /** 선생님이 고른 방탈출 자료에서 모두에게 보이는 것(미션 id, 잠긴 문, 아이템 이름, 힌트 카드 수) */
  get escape(): Escape {
    return this.room.state.escape;
  }

  /** 선생님: 고를 수 있는 방탈출 자료 파일 */
  escapeFiles(): Promise<EscapeFileInfo[]> {
    return this.room.request('escapeFiles');
  }

  /** 선생님: 방탈출 자료를 고른다(모든 사람의 방탈출 진행이 처음으로 돌아간다). */
  escapeLoad(file: string): Promise<GbReply> {
    return this.room.request('escapeLoad', { file });
  }

  /** 미션을 단 사물(object: 사물 id)을 살펴본다. 단서·줍기·가져다주기는 이때 채점한다(순서 맞추기는 글만 받고 missionPress로 누른다). */
  missionOpen(object: string): Promise<MissionView> {
    return this.room.request('missionOpen', { object });
  }

  /** 미션 문제·숫자 자물쇠의 답을 낸다(객관식은 1부터의 보기 번호, 숫자 자물쇠는 번호). */
  missionAnswer(object: string, answer: string): Promise<MissionAnswerReply> {
    const message: MissionAnswerMessage = { object, answer };
    return this.room.request('missionAnswer', message);
  }

  /** 순서 맞추기: 사물(object: 사물 id)을 누른다. 서버가 순서를 채점한다. */
  missionPress(object: string): Promise<MissionPressReply> {
    return this.room.request('missionPress', { object });
  }

  /** 내가 얻은 힌트 카드(글 포함) */
  myHints(): Promise<HintCard[]> {
    return this.room.request('myHints');
  }

  // ---- 골든벨(선생님). 서버가 돌려준 값을 답으로 받는다. ----

  gbFiles(): Promise<GbFileInfo[]> {
    return this.room.request('gbFiles');
  }

  gbStart(file: string): Promise<GbReply> {
    return this.room.request('gbStart', { file });
  }

  /** 선생님: 강당으로 모으기(seconds초 뒤, 0이면 바로 골든벨 맵으로 옮김) */
  gbGather(file: string, seconds: number): Promise<GbReply> {
    const message: GatherMessage = { file, seconds };
    return this.room.request('gbGather', message);
  }

  gbGatherCancel(): Promise<GbReply> {
    return this.room.request('gbGatherCancel');
  }

  /** 선생님: 2부 열기 */
  openPart(part: number): Promise<GbReply> {
    return this.room.request('openPart', { part });
  }

  gbNext(): Promise<GbReply> {
    return this.room.request('gbNext');
  }

  /** 선생님: 마감(남은 시간을 0으로 하고 정답 공개) */
  gbClose(): Promise<GbReply> {
    return this.room.request('gbClose');
  }

  /** 선생님: 골든벨 합산 순위를 처음으로 */
  gbResetTotal(): Promise<GbReply> {
    return this.room.request('gbResetTotal');
  }

  gbEnd(): Promise<GbReply> {
    return this.room.request('gbEnd');
  }

  /** 학생: 단답형 답을 낸다(다시 내면 바뀐다). */
  gbSubmit(text: string): Promise<GbReply> {
    const message: GbSubmitMessage = { text };
    return this.room.request('gbSubmit', message);
  }

  /** 선생님: 단답형 낸 답(고른 꼴)을 정답으로 인정하거나 인정을 거둔다. */
  gbAccept(key: string, accept: boolean): Promise<GbReply> {
    const message: GbAcceptMessage = { key, accept };
    return this.room.request('gbAccept', message);
  }

  // ---- 미니게임(shared/minigame.ts) ----

  /** 서버 시계 - 이 화면 시계(ms). 공 피하기 공을 서버 시각에 맞춰 그릴 때 쓴다(syncClock()으로 잰다). */
  private clockOffset = 0;

  /** 서버 시계를 잰다: 요청을 보낸 때와 받은 때의 가운데를 서버 시각으로 본다(가장 빠른 답 세 번 가운데). */
  async syncClock() {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      const server: number = await this.room.request('clock');
      const t1 = Date.now();
      if (t1 - t0 < best) {
        best = t1 - t0;
        this.clockOffset = server - (t0 + t1) / 2;
      }
    }
  }

  /** 지금 서버 시각(ms, 잰 차이로 고친 값) */
  serverNow() {
    return Date.now() + this.clockOffset;
  }

  get mini(): MiniGame {
    return this.room.state.mini;
  }

  /** 선생님: 미니게임 시작(3초 세기 뒤 시작) */
  miniStart(kind: MiniKind): Promise<GbReply> {
    const message: MiniStartMessage = { kind };
    return this.room.request('miniStart', message);
  }

  /** 선생님: 미니게임 그만두기(결과 없이 닫는다) */
  miniStop(): Promise<GbReply> {
    return this.room.request('miniStop');
  }

  /** 보물을 줍는다(서버가 먼저 온 요청에 준다) */
  miniPick(id: string) {
    const message: MiniPickMessage = { id };
    this.room.send('miniPick', message);
  }

  /** 공 피하기: 내 캐릭터가 공에 맞았다 */
  miniHit() {
    this.room.send('miniHit');
  }

  /** 줄다리기: 한 번 당긴다 */
  miniTug() {
    this.room.send('miniTug');
  }

  /** 선생님: 전체 공지를 보낸다. 서버가 받으면 보낸 선생님을 포함한 모두에게 공지가 온다(onAnnounce). */
  announce(text: string): Promise<GbReply> {
    const message: AnnounceMessage = { text };
    return this.room.request('announce', message);
  }

  /** 전체 공지가 오면 listener를 부른다. 장면을 옮겨도 이어지게 main.ts에서 한 번 건다. */
  onAnnounce(listener: (message: AnnounceBroadcast) => void) {
    this.announceListeners.add(listener);
    return () => this.announceListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emit(status: ConnectionStatus) {
    for (const l of this.statusListeners) l(status);
  }
}

/** 처음 상태(내 접속자 포함)를 받을 때까지 기다린다. 어느 맵으로 들어갈지 알아야 하므로 */
function firstState(room: Room<any, ClassState>): Promise<void> {
  const ready = () => !!room.state?.players?.get(room.sessionId);
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new TypeError('처음 상태를 받지 못했습니다.')), STATE_TIMEOUT_MS);
    const check = () => {
      if (!ready()) return room.onStateChange.once(check);
      clearTimeout(timeout);
      resolve();
    };
    room.onStateChange.once(check);
  });
}

const STATE_TIMEOUT_MS = 5000;

/** 학생은 방 코드로 들어오고, 선생님은 코드가 없으면 새 방을 만든다. */
export async function connect(entry: Entry): Promise<Net> {
  const client = new Client(endpoint());
  let room: Room<any, ClassState>;
  if (entry.role === 'student') {
    const options: JoinOptions = { nickname: entry.nickname, character: entry.character, classGroup: entry.classGroup };
    room = await client.joinById<ClassState>(entry.code, options);
  } else {
    const options: JoinOptions = { nickname: entry.nickname, character: entry.character, password: entry.password };
    room = entry.code
      ? await client.joinById<ClassState>(entry.code, options)
      : await client.create<ClassState>(ROOM_NAME, options);
  }
  await firstState(room);
  return new Net(room, entry.role, entry.nickname, entry.character);
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
