// 이모트 약속(2026-11-22 교사 요청, design/quick-specs/emote-sfx-quick-questions-2026-11-22.md). 서버와 3D 화면이 함께 쓴다.
// 상태에 남기지 않는 한 번 메시지: 화면이 'emote' {id}를 보내면 서버가 같은 맵의 접속자 가운데 'emoteListen'을 보낸 화면(3D)에 'emote' {from, id}를 보낸다.

/**
 * 이모트 하나. text는 말풍선에 쓰는 도트 글꼴 글자, icon은 말풍선에 그리는 도트 그림(public/sprites/ui/<icon>.png, 없으면 글자만),
 * action은 캐릭터 동작: 모델에 있는 동작(jump·wave)이나 몸을 움직여 흉내 내는 것(bow 숙이기·sway 흔들기·bounce 들썩이기).
 */
export interface EmoteDef {
  id: string;
  label: string;
  text: string;
  icon: string;
  action: '' | 'jump' | 'wave' | 'bow' | 'sway' | 'bounce';
}

/** 단추 순서 = 키보드 1~8 */
export const EMOTES: readonly EmoteDef[] = [
  { id: 'wave', label: '손인사', text: '안녕!', icon: '', action: 'wave' },
  { id: 'bow', label: '꾸벅', text: '꾸벅', icon: '', action: 'bow' },
  { id: 'clap', label: '박수', text: '짝짝짝', icon: '', action: 'bounce' },
  { id: 'cheer', label: '응원', text: '힘내!', icon: 'sparkle', action: 'jump' },
  { id: 'dance', label: '춤', text: '♪♬', icon: '', action: 'sway' },
  { id: 'jump', label: '점프', text: '점프!', icon: '', action: 'jump' },
  { id: 'heart', label: '하트', text: '', icon: 'heart', action: '' },
  { id: 'laugh', label: '웃음', text: 'ㅋㅋㅋ', icon: '', action: 'bounce' },
];

export const EMOTE_IDS: ReadonlySet<string> = new Set(EMOTES.map((e) => e.id));

/** 한 사람이 다시 보낼 수 있을 때까지(ms). 화면도 이 시간 동안 단추를 흐리게 한다. */
export const EMOTE_COOLDOWN_MS = 1500;
/** 한 사람이 1분에 보낼 수 있는 수 */
export const EMOTE_PER_MINUTE = 20;

/** 화면 → 서버 */
export interface EmoteMessage {
  id: string;
}

/** 서버 → 같은 맵의 화면. from은 보낸 사람의 접속 id */
export interface EmoteBroadcast {
  from: string;
  id: string;
}
