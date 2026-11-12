// 한 판의 진행 상태 가운데 화면이 들고 있는 것(걸린 시간, 지금 하는 일).
// 가진 물건·마친 미션·힌트 카드는 서버가 채점하며 정한다(Player.items, done, hints).
import type { ActivityKind, StatusMessage } from '../../shared/protocol.ts';

export class RunState {
  readonly nickname: string;
  readonly startedAt = performance.now();
  /** 1부를 마친 시각(걸린 시간을 멈춘다) */
  finishedAt: number | null = null;
  /** 지금 하는 일과 그 사물 id */
  activity: { kind: ActivityKind; object: string } = { kind: '', object: '' };

  constructor(nickname: string) {
    this.nickname = nickname;
  }

  elapsedMs() {
    return (this.finishedAt ?? performance.now()) - this.startedAt;
  }

  /** 서버에 보낼 모양 */
  toStatus(): StatusMessage {
    return { activity: this.activity.kind, object: this.activity.object };
  }
}

/** 걸린 시간을 "2분 13초"처럼 적는다. */
export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
