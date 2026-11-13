// 선생님 비밀번호 비교와 잦은 실패 막기. 방 만들기·들어가기(ClassRoom.onAuth)와 열린 방 목록·닫기(rooms.ts)가 같은 기준과 같은 셈을 쓴다.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** 서버에 비밀번호가 있으면 true */
export function hasTeacherPassword(): boolean {
  return !!process.env.DF_TEACHER_PASSWORD;
}

/** 넣은 비밀번호가 맞는지. 길이와 내용에 따라 걸리는 시간이 달라지지 않게 해시를 같은 길이로 맞춰 비교한다. */
export function teacherPasswordMatches(password: unknown): boolean {
  const expected = process.env.DF_TEACHER_PASSWORD;
  if (!expected || typeof password !== 'string') return false;
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(password), digest(expected));
}

// ---- 잦은 실패 막기: 같은 IP에서 1분에 5번 틀리면 1분 동안 맞는 비밀번호도 받지 않는다. ----

const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 5;
/** IP → 비밀번호가 틀린 시각들(최근 1분). 목록·닫기와 방 만들기·들어가기를 합쳐 센다. */
const failures = new Map<string, number[]>();

export const BLOCKED_TEXT = '비밀번호를 여러 번 틀려 1분 동안 막았습니다. 잠시 뒤 다시 합니다.';

/**
 * HTTP 요청을 받은 연결의 실제 주소를 넣어 두는 머리글. 서버가 모든 요청에 덮어써 넣으므로(tagPeer) 밖에서 꾸며 보낼 수 없다.
 * Colyseus의 방 만들기·들어가기(matchmake)는 소켓 주소를 넘기지 않아 이 머리글로 onAuth까지 가져간다.
 */
export const PEER_HEADER = 'x-df-peer';

/** 서버의 첫 'request' 처리로 건다. */
export function tagPeer(req: IncomingMessage) {
  req.headers[PEER_HEADER] = req.socket.remoteAddress ?? '';
}

/**
 * 요청한 곳. 이 컴퓨터를 거쳐 온 연결(Caddy·Tailscale serve·Vite)이면 X-Forwarded-For의 마지막 값을 쓰고,
 * 밖에서 바로 온 연결이면 그 주소를 쓴다(밖에서 꾸민 X-Forwarded-For는 믿지 않는다).
 */
export function clientIp(peer: string | null | undefined, forwarded: string | string[] | null | undefined): string {
  const remote = peer ?? '';
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return local && list.length ? list[list.length - 1] : remote || 'unknown';
}

function recentFailures(ip: string, now: number): number[] {
  const list = (failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failures.set(ip, list);
  else failures.delete(ip);
  return list;
}

/** 선생님 비밀번호를 본다. 막혔으면 비밀번호를 보지 않는다. 틀리면 그 IP의 셈을 하나 늘린다. 기록에는 비밀번호를 남기지 않는다. */
export function checkTeacherAttempt(ip: string, password: unknown, where: string): 'ok' | 'unset' | 'blocked' | 'wrong' {
  if (!hasTeacherPassword()) return 'unset';
  const now = Date.now();
  const recent = recentFailures(ip, now);
  if (recent.length >= FAIL_LIMIT) return 'blocked';
  if (teacherPasswordMatches(password)) return 'ok';
  recent.push(now);
  failures.set(ip, recent);
  console.log(`${where}: 선생님 비밀번호가 틀렸습니다(${ip}, 1분 안에 ${recent.length}번).`);
  return 'wrong';
}
