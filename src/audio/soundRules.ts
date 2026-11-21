// 서버 상태 변화 → 울릴 효과음(순수 함수). src/audio/gameSounds.ts가 쓰고, tests/unit/feature/가 Node로 확인한다.
import type { SoundName } from './sfx';

/** 골든벨 채점 결과 → 소리 */
const RESULT_SOUND: Record<string, SoundName> = { correct: 'correct', heart: 'correct', wrong: 'wrong', out: 'out', revived: 'revive' };

/** 골든벨 상태 변화로 울릴 소리(순수 함수, 확인하기 쉽게). prev가 null이면 처음 본 상태라 울리지 않는다. */
export interface GbSnapshot {
  phase: string;
  index: number;
  timeLeft: number;
  /** 내 채점 결과(선생님은 '') */
  result: string;
  student: boolean;
}

export function gbSounds(prev: GbSnapshot | null, next: GbSnapshot): SoundName[] {
  if (!prev) return [];
  const out: SoundName[] = [];
  if (next.phase === 'question' && (prev.phase !== 'question' || prev.index !== next.index)) out.push('question');
  else if (next.phase === 'question' && next.timeLeft !== prev.timeLeft && next.timeLeft >= 1 && next.timeLeft <= 3) out.push('tick');
  if (next.phase === 'reveal' && prev.phase !== 'reveal') out.push(next.student ? (RESULT_SOUND[next.result] ?? 'wrong') : 'reveal');
  // 선생님이 단답형 답을 정답으로 인정하면 그 학생의 결과가 바뀐다.
  else if (next.phase === 'reveal' && next.student && next.result !== prev.result && RESULT_SOUND[next.result]) out.push(RESULT_SOUND[next.result]);
  if (next.phase === 'end' && prev.phase !== 'end') out.push('fanfare');
  return out;
}

export interface MiniSnapshot {
  kind: string;
  phase: string;
  /** 남은 시간(초): 세는 중이면 3·2·1 */
  timeLeft: number;
  /** 내 점수(선생님은 0) */
  score: number;
  /** 공 피하기에서 내가 맞아 탈락함 */
  out: boolean;
}

/**
 * 미니게임 상태 변화 → 소리. 세기 3·2·1마다 삐, 시작(play)에 출발 소리, 보물찾기에서 내 점수가 오르면 줍기
 * (한 번에 goldPoints 넘게 오르면 금 보물), 공에 맞으면 맞음, 결과 창이 뜨면 팡파르.
 * 줄다리기 당기기는 점수(서버가 센 수)가 아니라 누를 때 화면이 바로 울린다(MiniSounds.pulled). 공 피하기 점수(버틴 시간)는 소리 없음.
 */
export function miniSounds(prev: MiniSnapshot | null, next: MiniSnapshot, goldPoints: number): SoundName[] {
  if (!prev) return [];
  const out: SoundName[] = [];
  if (next.phase === 'count' && next.timeLeft > 0 && (prev.phase !== 'count' || prev.timeLeft !== next.timeLeft)) out.push('countBeep');
  if (next.phase === 'play' && prev.phase !== 'play') out.push('miniStart');
  if (next.phase === 'play' && prev.phase === 'play' && next.kind === 'treasure' && next.score > prev.score) {
    out.push(next.score - prev.score >= goldPoints ? 'pickGold' : 'pick');
  }
  if (next.out && !prev.out) out.push('hit');
  if (next.phase === 'result' && prev.phase !== 'result') out.push('fanfare');
  return out;
}
