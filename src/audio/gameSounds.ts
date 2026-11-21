// 서버 상태가 바뀌면 효과음을 울린다(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// 상태를 0.1초마다 보고 바뀐 것에만 소리를 낸다: 골든벨(문제 시작, 마감 3초 째깍, 내 채점 결과, 결과 팡파르),
// 공지·강당으로 모으기. 미니게임 소리는 미니게임 3D 화면(src/three/minigame3d.ts)이 MiniSounds(src/audio/miniSounds.ts)로 건다.
import type { Net } from '../net/connection';
import { sfx as defaultSfx, type Sfx } from './sfx';
import { gbSounds, type GbSnapshot } from './soundRules.ts';

const POLL_MS = 100;

/** 이 화면의 연결에 효과음을 건다. 그만둘 때 부를 함수를 돌려준다. */
export function startGameSounds(net: Net, sfx: Sfx = defaultSfx) {
  let gb: GbSnapshot | null = null;
  let gathering = false;
  const timer = setInterval(() => {
    const me = net.me();
    const g = net.goldenbell;
    const student = net.role === 'student';
    const gbNext: GbSnapshot = {
      phase: me?.map === 'goldenbell' ? g.phase : '',
      index: g.index,
      timeLeft: g.timeLeft,
      result: student ? (me?.gbResult ?? '') : '',
      student,
    };
    for (const s of gbSounds(gb, gbNext)) sfx.play(s);
    gb = gbNext;
    const g2 = net.gather.left > 0;
    if (g2 && !gathering) sfx.play('notice');
    gathering = g2;
  }, POLL_MS);
  const off = net.onAnnounce(() => sfx.play('notice'));
  return () => {
    clearInterval(timer);
    off();
  };
}
