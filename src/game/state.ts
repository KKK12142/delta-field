// 한 판의 진행 상태. 서버로 보내 선생님의 CCTV 모드에 쓴다.
import type { ActivityKind, StatusMessage } from '../../shared/protocol.ts';

export class RunState {
  readonly nickname: string;
  readonly items = new Set<string>();
  /** action을 마친 사물 id */
  readonly done = new Set<string>();
  readonly startedAt = performance.now();
  escapedAt: number | null = null;
  /** 지금 하는 일과 그 사물 id */
  activity: { kind: ActivityKind; object: string } = { kind: '', object: '' };

  constructor(nickname: string) {
    this.nickname = nickname;
  }

  elapsedMs() {
    return (this.escapedAt ?? performance.now()) - this.startedAt;
  }

  /** 서버에 보낼 모양 */
  toStatus(): StatusMessage {
    return {
      activity: this.activity.kind,
      object: this.activity.object,
      items: [...this.items],
      done: [...this.done],
      escaped: this.escapedAt !== null,
    };
  }
}

/** 걸린 시간을 "2분 13초"처럼 적는다. */
export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
