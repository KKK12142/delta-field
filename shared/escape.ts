// 방탈출 미션 약속. 서버와 화면이 함께 쓴다.
// 미션의 문제·정답·단서·힌트 카드 글은 서버만 읽는 자료 파일(escape/*.yaml, 형식은 escape/example.yaml)에 있다.
// 맵(src/data/school.json)에는 사물 자리와 그 사물의 미션 id(mission)만 둔다.

/**
 * 미션 종류
 * - clue: 글(단서)을 보인다. 살펴보면 바로 마친다.
 * - quiz: 문제(객관식이나 단답형)를 맞히면 마친다. 반마다 다른 문제(반 자물쇠)를 낼 수 있다.
 * - open: 문. (문제를 맞히면) 열려 지나갈 수 있다. 학생마다 따로 열린다.
 * - exit: 출구. (문제를 맞히면) 탈출한다.
 */
export const MISSION_TYPES = ['clue', 'quiz', 'open', 'exit'] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

/** 열린 문처럼 지나갈 수 있게 되는 사물 종류(open 미션은 이 사물에만 둔다) */
export const DOOR_KINDS = ['door', 'entrance'] as const;

/** 선생님이 고를 수 있는 방탈출 자료 파일(서버의 escape/ 폴더) */
export interface EscapeFileInfo {
  file: string;
  title: string;
  missions: number;
  hints: number;
  /** 형식이 틀렸으면 그 까닭 */
  error: string | null;
}

/** 힌트 카드. 미션을 마친 학생에게만 글을 보낸다. */
export interface HintCard {
  id: string;
  title: string;
  text: string;
}

/** 문제를 맞혔거나 단서를 읽어 미션을 마쳤을 때 얻은 것 */
export interface MissionReward {
  /** 얻은 아이템 이름(없으면 '') */
  item: string;
  /** 얻은 힌트 카드(없으면 null) */
  hint: HintCard | null;
  /** 문을 열었으면 true */
  opened: boolean;
  /** 탈출했으면 true */
  escaped: boolean;
}

/**
 * 학생이 사물을 살펴볼 때 서버가 돌려주는 것(missionOpen의 답)
 * - none: 미션이 없음(자료 파일을 고르지 않았거나 그 사물의 미션이 파일에 없음)
 * - locked: 필요한 아이템이 없음. done: 이미 마침. 둘 다 text를 보인다.
 * - clue: 단서 글. 살펴보는 순간 마친 것으로 치고 reward를 준다.
 * - quiz: 문제. choices가 비어 있으면 단답형이다. 답은 missionAnswer로 낸다.
 */
export type MissionView =
  | { kind: 'none' | 'locked' | 'done'; text: string }
  | { kind: 'clue'; text: string; reward: MissionReward }
  | { kind: 'quiz'; question: string; choices: string[]; example: boolean; mission: MissionType };

/** 학생이 미션 문제의 답을 낸다. 객관식은 보기 번호(1부터)를 글로, 단답형은 쓴 글 */
export interface MissionAnswerMessage {
  id: string;
  answer: string;
}

/** missionAnswer의 답. 틀리면 correct가 false이고 다시 낼 수 있다. */
export interface MissionAnswerReply {
  correct: boolean;
  reward: MissionReward | null;
  /** 낼 수 없으면 그 까닭 */
  error: string | null;
}
