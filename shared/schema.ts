// 서버가 모든 접속자에게 맞춰 주는 상태. 바뀐 값만 자동으로 보낸다.
import { schema, t, type SchemaType } from '@colyseus/schema';
import { GB_LIVES } from './goldenbell.ts';
import { DEFAULT_CHARACTER } from './protocol.ts';

export const Player = schema(
  {
    nickname: t.string(),
    /** 'student' | 'teacher' */
    role: t.string(),
    /** 캐릭터 id(src/data/characters.json) */
    character: t.string().default(DEFAULT_CHARACTER),
    /** 학생의 반 id(shared/protocol.ts CLASS_GROUPS). 선생님이나 반을 모르면 '' */
    classGroup: t.string().default(''),
    /** 발밑 위치(칸 단위) */
    col: t.float32(),
    row: t.float32(),
    /** 지금 있는 맵(MapId) */
    map: t.string().default('school'),
    /** 연결이 끊겨 다시 붙기를 기다리는 동안 false */
    online: t.boolean().default(true),
    // 아래는 학생의 방탈출 진행 상태(shared/protocol.ts의 StatusMessage). 선생님의 CCTV 모드에 쓴다.
    /** ActivityKind: '' | 'look' | 'quiz' */
    activity: t.string().default(''),
    /** activity의 사물 id */
    activityObject: t.string().default(''),
    /** 가진 아이템 id */
    items: t.array('string'),
    /** 마친 사물 id */
    done: t.array('string'),
    escaped: t.boolean().default(false),
    // 골든벨(규칙은 shared/goldenbell.ts)
    gbLives: t.uint8().default(GB_LIVES),
    gbScore: t.uint16().default(0),
    gbOut: t.boolean().default(false),
    /** 탈락한 뒤 맞힌 수 */
    gbRevive: t.uint8().default(0),
    /** 이번 문제의 채점 결과(GbResult) */
    gbResult: t.string().default(''),
    /**
     * 이번 문제의 내 답: OX·객관식은 서 있던 구역 이름(''은 구역 밖), 단답형은 낸 글(''은 내지 않음).
     * 정답을 공개할 때 채운다(단답형 답이 공개 전에 다른 학생에게 가지 않게 서버가 따로 들고 있다).
     */
    gbAnswer: t.string().default(''),
  },
  'Player',
);
export type Player = SchemaType<typeof Player>;

/** 골든벨 진행. 문제와 제한 시간은 모두에게 보이고, 정답은 공개할 때만 채운다(학생 화면에 미리 가지 않게). */
export const GoldenBell = schema(
  {
    /** GbPhase */
    phase: t.string().default(''),
    title: t.string().default(''),
    /** 지금 문제 번호(0부터). 첫 문제 전이면 -1 */
    index: t.int16().default(-1),
    total: t.uint16().default(0),
    /** GbQuestionType */
    type: t.string().default(''),
    question: t.string().default(''),
    choices: t.array('string'),
    /** 남은 시간(초) */
    timeLeft: t.uint16().default(0),
    /** 정답 공개 때만 채운다. OX·객관식은 정답 구역 이름, 단답형은 정답 표현들(같은 꼴은 하나만, answerDisplay)을 ' / '로 이은 글 */
    answer: t.string().default(''),
    /** 해설. 정답 공개 때만 채운다(문제 파일에 없으면 '') */
    explain: t.string().default(''),
    /** 단답형: 답을 낸 학생 수(누가 무엇을 냈는지는 공개 전에 보내지 않는다) */
    submitted: t.uint16().default(0),
    /** 단답형 정답 공개 뒤 선생님이 정답으로 인정한 답(answerKey) */
    accepted: t.array('string'),
  },
  'GoldenBell',
);
export type GoldenBell = SchemaType<typeof GoldenBell>;

export const ClassState = schema(
  {
    /** 방 코드(학생이 입력하는 4자리 숫자) */
    code: t.string(),
    /** 접속 id → 접속자 */
    players: t.map(Player),
    goldenbell: t.ref(GoldenBell).default(() => new GoldenBell()),
  },
  'ClassState',
);
export type ClassState = SchemaType<typeof ClassState>;
