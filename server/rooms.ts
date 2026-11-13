// 선생님 첫 화면의 열린 방 목록과 방 닫기(HTTP). 수업 서버는 인터넷에 열려 있으므로 둘 다 선생님 비밀번호가 맞아야 하고,
// 같은 곳(IP)에서 비밀번호가 1분에 5번 넘게 틀리면 잠깐 받지 않는다. 비밀번호는 기록에 남기지 않는다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { ROOMS_CLOSE_PATH, ROOMS_PATH, ROOM_NAME, type RoomsReply, type RoomsRequest } from '../shared/protocol.ts';
import type { ClassRoom } from './ClassRoom.ts';
import { hasTeacherPassword, teacherPasswordMatches } from './password.ts';

const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 5;
/** IP → 비밀번호가 틀린 시각들(최근 1분) */
const failures = new Map<string, number[]>();

/** 요청한 곳. Caddy·Tailscale serve·Vite가 앞에서 넘겨 주면(이 컴퓨터에서 온 연결) X-Forwarded-For의 마지막 값을 쓴다. */
function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  return local && list.length ? list[list.length - 1] : remote;
}

function recentFailures(ip: string, now: number): number[] {
  const list = (failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failures.set(ip, list);
  else failures.delete(ip);
  return list;
}

/** 비밀번호를 본다. 맞으면 null, 아니면 [응답 번호, 까닭] */
function checkPassword(req: IncomingMessage, password: unknown): [number, string] | null {
  if (!hasTeacherPassword()) return [503, '서버에 선생님 비밀번호가 설정되어 있지 않습니다.'];
  const ip = clientIp(req);
  const now = Date.now();
  const recent = recentFailures(ip, now);
  if (recent.length >= FAIL_LIMIT) return [429, '비밀번호가 여러 번 틀렸습니다. 1분 뒤 다시 합니다.'];
  if (teacherPasswordMatches(password)) return null;
  recent.push(now);
  failures.set(ip, recent);
  console.log(`열린 방 목록: 선생님 비밀번호가 틀렸습니다(${ip}, 1분 안에 ${recent.length}번).`);
  return [403, '선생님 비밀번호가 맞지 않습니다.'];
}

function send(res: ServerResponse, status: number, body: RoomsReply) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** 이 서버에 있는 수업 방(만든 순서) */
async function classRooms(): Promise<ClassRoom[]> {
  const listings = await matchMaker.query({ name: ROOM_NAME });
  const rooms: ClassRoom[] = [];
  for (const l of listings) {
    const room = matchMaker.getLocalRoomById(l.roomId) as ClassRoom | undefined;
    if (room) rooms.push(room);
  }
  return rooms.sort((a, b) => a.openedAt - b.openedAt);
}

type Request = IncomingMessage & { body?: unknown };

const MAX_BODY = 4096;

/** 요청 본문(JSON). 앞에서 읽어 둔 것(req.body)이 있으면 그것을 쓰고, 없으면 읽는다. 알맞지 않으면 {} */
async function readBody(req: Request): Promise<Partial<RoomsRequest>> {
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const chunk of req) {
      raw += String(chunk);
      if (raw.length > MAX_BODY) return {};
    }
    body = raw;
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' && body !== null ? (body as Partial<RoomsRequest>) : {};
}

/** express 앞에 거는 처리. 두 주소(POST)만 받고 나머지는 넘긴다. */
export function roomsHandler(req: Request, res: ServerResponse, next: (err?: unknown) => void) {
  const path = (req.url ?? '').split('?')[0];
  if (path !== ROOMS_PATH && path !== ROOMS_CLOSE_PATH) return next();
  if (req.method !== 'POST') return send(res, 405, { error: 'POST로 요청합니다.' });
  void (async () => {
    const body = await readBody(req);
    const refused = checkPassword(req, body.password);
    if (refused) return send(res, refused[0], { error: refused[1] });
    const rooms = await classRooms();
    if (path === ROOMS_PATH) return send(res, 200, { error: null, rooms: rooms.map((r) => r.summary()) });
    const room = rooms.find((r) => r.roomId === body.code);
    if (!room) return send(res, 404, { error: '그 방이 없습니다. 이미 닫혔을 수 있습니다.' });
    room.closeByTeacher();
    send(res, 200, { error: null });
  })().catch((err) => {
    console.error('열린 방 목록 오류:', err);
    send(res, 500, { error: '서버에서 방 목록을 읽지 못했습니다.' });
  });
}
