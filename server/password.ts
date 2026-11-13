// 선생님 비밀번호 비교. 방 만들기·들어가기와 열린 방 목록·닫기가 같은 기준을 쓴다.
import { createHash, timingSafeEqual } from 'node:crypto';

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
