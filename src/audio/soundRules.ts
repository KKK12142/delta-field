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
  score: number;
  out: boolean;
}

export function miniSounds(prev: MiniSnapshot | null, next: MiniSnapshot): SoundName[] {
  if (!prev) return [];
  const out: SoundName[] = [];
  if ((next.phase === 'count' || next.phase === 'play') && prev.phase !== 'count' && prev.phase !== 'play') out.push('miniStart');
  if (next.phase === 'play' && next.score > prev.score) {
    // 보물찾기는 주운 점수, 줄다리기는 누른 수가 오른다(공 피하기의 점수는 버틴 시간이라 소리를 내지 않는다).
    if (next.kind === 'treasure') out.push('pick');
    else if (next.kind === 'tug') out.push('pop');
  }
  if (next.out && !prev.out) out.push('hit');
  if (next.phase === 'result' && prev.phase !== 'result') out.push('fanfare');
  return out;
}

