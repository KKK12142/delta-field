// 서버가 모든 접속자에게 맞춰 주는 상태. 바뀐 값만 자동으로 보낸다.
import { schema, t, type SchemaType } from '@colyseus/schema';

export const Player = schema(
  {
    nickname: t.string(),
    /** 'student' | 'teacher' */
    role: t.string(),
    /** 발밑 위치(칸 단위) */
    col: t.float32(),
    row: t.float32(),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;

export const ClassState = schema(
  {
    /** 방 코드(학생이 입력하는 4자리 숫자) */
    code: t.string(),
    /** 접속 id → 접속자 */
    players: t.map(Player),
  },
  'ClassState',
);
export type ClassState = SchemaType<typeof ClassState>;
