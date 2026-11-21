// 3D 학교 맵의 안내와 선생님 단추. 2D(RoomScene)의 위쪽 안내(Hud)를 그대로 쓰고, 3D에서 되는 것만 보인다.
// 되는 것: 장소 이름, 방 코드, 강당으로 모으기(남은 시간 안내 포함), 전체 공지, 미니게임 시작·그만두기(minigame3d.ts). 방 닫기는 첫 화면(선생님 방 목록)에 있다.
// 3D에 아직 없는 것(감춤): 살펴보기·힌트 수첩·방탈출 자료·2부 열기·CCTV. 2D(?view=2d)에서 한다.
import { GATHER_SECONDS } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import { formatDuration } from '../game/state';
import { askAnnounce } from '../ui/announce';
import { openQuickSet } from '../ui/quickQuestions';
import { QUICK_FILE } from '../../shared/quickQuestions.ts';
import { Hud } from '../ui/hud';
import type { Character } from './characters';
import { askMiniStart, askMiniStop, MiniGame3D } from './minigame3d';
import type { MapMode, ModeContext } from './mode';

export class SchoolMode implements MapMode {
  private readonly hud: Hud;
  private busy = false;
  private gatherShown = -1;
  private place = '';
  private readonly mini: MiniGame3D;

  constructor(private readonly ctx: ModeContext) {
    const teacher = ctx.net.role === 'teacher';
    const hud = new Hud(ctx.room.goal, ctx.touch, teacher);
    for (const b of [hud.action, hud.notebook, hud.cctv, hud.part, hud.escapeFile]) b.hidden = true;
    hud.setHelp(ctx.touch ? '화면을 누른 채 끌어 움직입니다.' : '방향키나 WASD로 움직입니다.');
    hud.setRoomCode(ctx.net.code);
    if (teacher) {
      hud.goldenbell.addEventListener('click', this.onGoldenBellButton);
      hud.announce.addEventListener('click', this.onAnnounceButton);
      hud.mini.addEventListener('click', this.onMiniButton);
    }
    this.hud = hud;
    this.mini = new MiniGame3D({
      net: ctx.net,
      dialog: ctx.dialog,
      scene: ctx.scene,
      pos: () => ctx.me.pos(),
      teleport: (col, row) => ctx.me.teleport(col, row),
      // 미니게임이 시작되면 떠 있던 창을 거둔다(답을 기다리던 일은 버린다).
      onStart: () => {
        if (ctx.dialog.isOpen()) ctx.dialog.abandon();
        this.busy = false;
      },
    });
  }

  get overMap() {
    return this.hud.overMap;
  }

  update(time: number, place: string) {
    this.mini.update(time);
    const playing = this.mini.playing;
    const key = `${place}|${playing}`;
    if (key !== this.place) {
      this.place = key;
      this.hud.setPlace(playing ? `${place} · 미니게임 중` : place);
    }
    if (this.ctx.net.role === 'teacher') this.hud.setMini(!!this.ctx.net.mini?.phase);
    this.updateGather();
  }

  decorate(ch: Character, p: Player, _id: string, _me: boolean) {
    ch.setLives(null);
    // 공 피하기에서 맞아 구경하는 학생은 흐리게
    ch.setOpacity(this.mini.opacityOf(p));
  }

  allows(col: number, row: number) {
    return this.mini.allows(col, row);
  }

  frozen() {
    return this.mini.frozen;
  }

  reserved() {
    return { top: 0, right: 0 };
  }

  overview() {
    return null;
  }

  viewTiles() {
    return null;
  }

  setStatus(text: string | null) {
    this.hud.setStatus(text);
  }

  devHooks() {
    return this.mini.devHooks();
  }

  dispose() {
    this.mini.dispose();
    this.hud.destroy();
  }

  /** 강당으로 모으는 중이면 남은 시간을 모두에게 보인다(2D RoomScene.updateGather와 같다). */
  private updateGather() {
    const { left, title } = this.ctx.net.gather;
    if (left === this.gatherShown) return;
    this.gatherShown = left;
    this.hud.setGathering(left > 0);
    this.hud.setNotice(
      left > 0
        ? `강당으로 모입니다 · 남은 시간 ${formatDuration(left * 1000)}\n시간이 되면 모두 강당으로 옮겨 가 골든벨(${title})을 합니다.`
        : null,
    );
  }

  private readonly onAnnounceButton = () => {
    this.hud.announce.blur();
    if (this.ctx.dialog.isOpen() || this.busy) return;
    this.busy = true;
    void askAnnounce(this.ctx.dialog, this.ctx.net).finally(() => {
      this.busy = false;
    });
  };

  private readonly onMiniButton = () => {
    this.hud.mini.blur();
    const { dialog, net } = this.ctx;
    if (dialog.isOpen() || this.busy) return;
    this.busy = true;
    void (net.mini?.phase ? askMiniStop(dialog, net) : askMiniStart(dialog, net)).finally(() => {
      this.busy = false;
    });
  };

  private readonly onGoldenBellButton = () => {
    this.hud.goldenbell.blur();
    void (this.ctx.net.gather.left > 0 ? this.cancelGather() : this.gather());
  };

  /** 문제 파일과 남은 시간(바로, 1·3·5분)을 고르면 서버가 0이 될 때 모두를 골든벨 맵으로 옮긴다(2D RoomScene.gather와 같다). */
  private async gather() {
    const { dialog, net } = this.ctx;
    if (dialog.isOpen() || this.busy) return;
    this.busy = true;
    try {
      const files = await net.gbFiles();
      // 맨 위는 바로 내기(선생님 창에서 쓰거나 붙여 넣은 문제, src/ui/quickQuestions.ts)
      const picked = await dialog.choose(
        '강당으로 모으기',
        files.length ? '골든벨 문제 파일을 고르거나 바로 냅니다.' : '문제 파일이 없습니다(서버의 goldenbell 폴더). 바로 내기로 문제를 써서 낼 수 있습니다.',
        [
          { label: '바로 내기(직접 쓰기·붙여넣기)', detail: '이 창에서 문제를 쓰거나 여러 줄을 붙여 넣습니다.' },
          ...files.map((f) => ({ label: f.error ? f.file : `${f.title} (${f.count}문제)`, detail: f.error ?? f.file, disabled: f.error !== null })),
        ],
      );
      if (picked === null) return;
      let file: { file: string; title: string };
      if (picked === 0) {
        const quick = await openQuickSet(net);
        if (!quick) return;
        file = { file: QUICK_FILE, title: `${quick.title} (${quick.count}문제)` };
      } else file = files[picked - 1];
      const when = await dialog.choose(
        '강당으로 모으기',
        `${file.title}: 언제 모을지 고릅니다. 남은 시간이 모든 학생 화면에 보이고, 0이 되면 모두 강당(골든벨 맵)으로 옮겨 갑니다.`,
        GATHER_SECONDS.map((sec) => ({ label: sec === 0 ? '지금 바로 옮기기' : `${sec / 60}분 뒤` })),
      );
      if (when === null) return;
      const reply = await net.gbGather(file.file, GATHER_SECONDS[when]);
      if (reply.error) await dialog.message('강당으로 모으기', reply.error);
    } catch {
      await dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private async cancelGather() {
    const { dialog, net } = this.ctx;
    if (dialog.isOpen() || this.busy) return;
    this.busy = true;
    try {
      const reply = await net.gbGatherCancel();
      if (reply.error) await dialog.message('강당으로 모으기', reply.error);
    } catch {
      await dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }
}
