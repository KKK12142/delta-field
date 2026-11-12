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
    // 아래는 학생의 방탈출 진행 상태. 지금 하는 일(activity)은 화면이 알리고(StatusMessage),
    // 가진 물건·마친 미션·1부 완료·힌트 카드는 서버가 채점하며 바꾼다(shared/escape.ts). 선생님의 CCTV 모드에 쓴다.
    /** ActivityKind: '' | 'look' | 'quiz' */
    activity: t.string().default(''),
    /** activity의 사물 id */
    activityObject: t.string().default(''),
    /** 가진 아이템 id */
    items: t.array('string'),
    /** 마친 미션 id(맵 사물의 mission) */
    done: t.array('string'),
    /** 1부를 마침(exit 미션, 예: 교문) */
    finished: t.boolean().default(false),
    /** 순서 맞추기: 지금 시도에서 맞게 누른 사물 id(누른 순서, 미션마다 섞여 있다). 사물 위 번호 표시에 쓴다. */
    pressed: t.array('string'),
    /** 얻은 힌트 카드 id(글은 서버가 그 학생에게만 보낸다) */
    hints: t.array('string'),
    /** 미션 id → 그 자물쇠(quiz·code·문제 있는 문)에서 틀린 수. 3번 틀리면 실마리가 보이고, 선생님 CCTV의 막힌 학생에 쓴다. */
    wrongs: t.map('uint8'),
    /** 마지막으로 미션을 마친(또는 2부가 열리거나 골든벨에서 돌아온) 때. 방의 시계(ClassState.now, 초) */
    lastProgressAt: t.uint32().default(0),
    /** 보너스 미션을 마쳐 다음 골든벨 시작 때 받을 하트 +1이 남아 있으면 true(받으면 false) */
    bonusHeart: t.boolean().default(false),
    // 미니게임(shared/minigame.ts)
    /** 이번 미니게임 점수: 보물찾기는 모은 점수, 공 피하기는 버틴 시간(초), 줄다리기는 센 누른 수 */
    miniScore: t.float32().default(0),
    /** 공 피하기에서 맞아 탈락함(구경) */
    miniOut: t.boolean().default(false),
    /** 줄다리기에서 이긴 반이라 다음 골든벨 시작 때 받을 하트 +1이 남아 있으면 true(받으면 false) */
    miniHeart: t.boolean().default(false),
    // 골든벨(규칙은 shared/goldenbell.ts)
    gbLives: t.uint8().default(GB_LIVES),
    gbScore: t.uint16().default(0),
    /** 이 방에서 앞서 한 골든벨 판들의 점수 합(합산 순위 = gbTotal + gbScore). 선생님이 처음으로 돌릴 수 있다. */
    gbTotal: t.uint16().default(0),
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
    /** 넌센스 문제(점수에 넣지 않고, 맞히면 하트 +1 또는 부활 1개. shared/goldenbell.ts의 judgeNonsense) */
    nonsense: t.boolean().default(false),
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

/** 보물찾기의 보물 하나(주우면 지운다) */
export const Treasure = schema(
  {
    col: t.float32(),
    row: t.float32(),
    gold: t.boolean().default(false),
  },
  'Treasure',
);
export type Treasure = SchemaType<typeof Treasure>;

/** 미니게임 결과 한 줄(점수 높은 순, 같은 점수는 같은 등수) */
export const MiniResult = schema(
  {
    nickname: t.string(),
    character: t.string(),
    classGroup: t.string(),
    score: t.float32(),
    rank: t.uint8(),
  },
  'MiniResult',
);
export type MiniResult = SchemaType<typeof MiniResult>;

/** 미니게임 진행(shared/minigame.ts) */
export const MiniGame = schema(
  {
    /** MiniKind 또는 ''(하지 않음) */
    kind: t.string().default(''),
    /** MiniPhase */
    phase: t.string().default(''),
    /** 남은 시간(초): 세는 중이면 3·2·1, 하는 중이면 판의 남은 시간, 결과면 창을 닫을 때까지 */
    timeLeft: t.uint16().default(0),
    /** 한 판 시간(초) */
    duration: t.uint16().default(0),
    /** 공 피하기: 공 일정 seed */
    seed: t.uint32().default(0),
    /** 판을 시작한 서버 시각(Date.now(), ms). 공 피하기 화면은 서버 시계에 맞춰 공을 그린다. */
    startedAt: t.float64().default(0),
    /** 보물찾기: 보물 id → 보물(주우면 지운다) */
    treasures: t.map(Treasure),
    /** 줄다리기: 반마다 학생 한 명이 누른 수의 평균, 줄 위치(수과학반 − AI.SW반), 끝 선 */
    tugScience: t.float32().default(0),
    tugAisw: t.float32().default(0),
    tugPos: t.float32().default(0),
    tugGoal: t.float32().default(0),
    /** 줄다리기: 이긴 반 id(비기면 '') */
    winner: t.string().default(''),
    /** 결과(결과 단계에서 채운다) */
    results: t.array(MiniResult),
  },
  'MiniGame',
);
export type MiniGame = SchemaType<typeof MiniGame>;

/** 방탈출 자료(선생님이 고른 escape/*.yaml)에서 모두에게 보여도 되는 것. 문제·정답·힌트 글은 넣지 않는다. */
export const Escape = schema(
  {
    /** 고른 파일 이름. ''이면 아직 고르지 않았다. */
    file: t.string().default(''),
    title: t.string().default(''),
    /** 파일을 바꿀 때마다 1씩 는다(화면이 진행을 처음으로 돌린다). */
    version: t.uint16().default(0),
    /** 자료 파일에 있는 미션 id(이 미션을 단 사물만 살펴볼 수 있다) */
    missions: t.array('string'),
    /** 잠긴 문(open 미션) id. 여기에 없는 문은 처음부터 열려 있다. */
    doors: t.array('string'),
    /** 줍기(pickup) 미션 id. 주운 학생의 화면에서는 그 사물이 사라진다. */
    pickups: t.array('string'),
    /** 아이템 id → 이름 */
    items: t.map('string'),
    /** 사물 id → 이름표(자료 파일의 labels). 맵(school.json)의 name 대신 쓴다. 순서 맞추기 사물을 나눠 보일 때 쓴다. */
    labels: t.map('string'),
    /** 힌트 카드 수 */
    hintTotal: t.uint8().default(0),
    /** 힌트 카드 id → 그 카드를 주는 미션 사물의 부(1·2). 힌트 수첩의 "1부 3/8 · 2부 0/8"에 쓴다. */
    hintParts: t.map('uint8'),
    /** 보너스 미션 id(bonus: true). 장소의 미션 수에서 뺀다. */
    bonus: t.array('string'),
    /** 입장 직후 보이는 이야기 카드 글(자료 파일의 intro). 없으면 '' */
    intro: t.string().default(''),
  },
  'Escape',
);
export type Escape = SchemaType<typeof Escape>;

export const ClassState = schema(
  {
    /** 방 코드(학생이 입력하는 4자리 숫자) */
    code: t.string(),
    /** 접속 id → 접속자 */
    players: t.map(Player),
    goldenbell: t.ref(GoldenBell).default(() => new GoldenBell()),
    escape: t.ref(Escape).default(() => new Escape()),
    mini: t.ref(MiniGame).default(() => new MiniGame()),
    /** 지금 열린 방탈출 부(shared/protocol.ts의 PARTS). 2부 장소의 문 잇기는 맵을 넓힐 때 한다. */
    part: t.uint8().default(1),
    /** 강당으로 모으기: 골든벨로 옮길 때까지 남은 시간(초). 0이면 모으는 중이 아니다. */
    gatherLeft: t.uint16().default(0),
    /** 강당으로 모으기: 시작할 골든벨 이름 */
    gatherTitle: t.string().default(''),
    /** 방의 시계: 방을 만든 뒤 지난 초. 막힌 학생(Player.lastProgressAt)을 셀 때 쓴다. */
    now: t.uint32().default(0),
    /** 합산 순위에 든 골든벨 판 수(시작할 때 1씩 는다. 선생님이 합계를 처음으로 돌리면 다시 센다) */
    gbRounds: t.uint8().default(0),
  },
  'ClassState',
);
export type ClassState = SchemaType<typeof ClassState>;
