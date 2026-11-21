// 미니게임 효과음(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md). 미니게임 3D 화면(src/three/minigame3d.ts)이 만들어
// 매 프레임 update()를 부르고, 줄다리기를 당길 때 pulled()를 부른다. 소리 규칙은 soundRules.ts의 miniSounds.
import { GOLD_POINTS } from '../../shared/minigame.ts';
import type { Net } from '../net/connection';
import { sfx as defaultSfx, type Sfx } from './sfx';
import { miniSounds, type MiniSnapshot } from './soundRules.ts';

export class MiniSounds {
  private last: MiniSnapshot | null = null;
  private readonly net: Net;
  private readonly sfx: Sfx;

  constructor(net: Net, sfx: Sfx = defaultSfx) {
    this.net = net;
    this.sfx = sfx;
  }

  /** 매 프레임: 서버 상태(세기·시작·내 점수·탈락·결과)가 바뀌었으면 울린다. 처음 본 상태는 울리지 않는다. */
  update() {
    const m = this.net.mini;
    const me = this.net.me();
    const student = this.net.role === 'student';
    const next: MiniSnapshot = { kind: m.kind, phase: m.phase, timeLeft: m.timeLeft, score: student ? (me?.miniScore ?? 0) : 0, out: student && !!me?.miniOut };
    const prev = this.last;
    this.last = next;
    for (const s of miniSounds(prev, next, GOLD_POINTS)) this.sfx.play(s);
  }

  /** 줄다리기를 한 번 당겼다(누를 때 바로 울림. 너무 잦지 않게 sfx.json의 tug.gap 간격) */
  pulled() {
    this.sfx.play('tug');
  }
}
