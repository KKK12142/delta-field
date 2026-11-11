import { activeZones, type Zone, type Zones } from '../../shared/goldenbell.ts';
import type { Player } from '../../shared/schema.ts';
import { cardView, livesTag, mineView, panelView } from '../game/goldenbell';
import { GbHud, GbPanel } from '../ui/goldenbell';
import { alpha, color, fontFamily, motion, size } from '../theme';
import type { TagStyle } from './avatar';
import { MapScene, type MapContext, type Remote, type Reserved } from './MapScene';

/** 구역을 그리는 깊이: 바닥(0) 위, 사물·아바타(깊이 = y 픽셀) 아래 */
const ZONE_DEPTH = 1;

/** 골든벨 맵: 선생님이 낸 문제의 답 구역으로 걸어가 선다. 채점은 서버가 한다. */
export class GoldenBellScene extends MapScene {
  readonly mapId = 'goldenbell';
  private hud!: GbHud;
  private panel: GbPanel | null = null;
  private zones!: Zones;
  private zoneLayer!: Phaser.GameObjects.Graphics;
  private zoneTexts: Phaser.GameObjects.Text[] = [];
  /** 구역을 마지막으로 그린 상태(바뀌었을 때만 다시 그린다) */
  private zoneKey = '';
  private hudBottom = 0;
  /** 선생님이 보낸 요청의 답을 기다리는 중 */
  private waiting = false;
  /** 흐려지기를 시작한 문제 번호와 그 시각 */
  private fade = { index: -1, startedAt: 0 };

  constructor() {
    super('goldenbell');
  }

  init(ctx: MapContext) {
    super.init(ctx);
    const zones = ctx.rooms.goldenbell.zones;
    if (!zones) throw new Error('골든벨 맵 데이터에 답 구역(zones)이 없습니다.');
    this.zones = zones;
    this.zoneTexts = [];
    this.zoneKey = '';
    this.hudBottom = 0;
    this.waiting = false;
    this.panel = null;
    this.fade = { index: -1, startedAt: 0 };
  }

  create() {
    super.create();
    this.zoneLayer = this.add.graphics().setDepth(ZONE_DEPTH);
    const teacher = this.net.role === 'teacher';
    this.hud = new GbHud(teacher);
    if (teacher) {
      this.panel = new GbPanel({ next: () => void this.ask(() => this.net.gbNext()), end: () => void this.ask(() => this.net.gbEnd()) });
    }
    this.events.once('shutdown', () => {
      this.hud.destroy();
      this.panel?.destroy();
      this.panel = null;
    });
    this.syncView();
    this.fitCamera();

    this.exposeDevHooks({
      gb: () => {
        const gb = this.net.goldenbell;
        return { phase: gb.phase, index: gb.index, total: gb.total, type: gb.type, timeLeft: gb.timeLeft, answer: gb.answer };
      },
      /** 보이는 모습: 내 아바타와 다른 사람 아바타의 투명도와 머리 위 글 */
      looks: () => ({
        me: { alpha: this.avatar.alpha, tag: this.avatar.tag?.visible ? this.avatar.tag.text : null },
        others: Object.fromEntries(
          [...this.remotes].map(([id, r]) => [
            this.net.room.state.players.get(id)?.nickname ?? id,
            { alpha: r.avatar.alpha, tag: r.avatar.tag?.visible ? r.avatar.tag.text : null },
          ]),
        ),
      }),
    });
  }

  /** 서버가 세워 준 자리(출발 자리)에 선다. 막혀 있으면 시작 위치 둘레에 선다. */
  protected startPoint() {
    const me = this.net.me();
    if (me && this.free(me.col, me.row)) return { col: me.col, row: me.row };
    return this.spawnPoint();
  }

  protected setConnectionText(text: string | null) {
    this.hud.setStatus(text);
  }

  protected tick(delta: number) {
    if (!this.dialog.isOpen()) this.moveByInput(delta);
    this.syncView();
    // 문제 카드의 높이가 바뀌면(문제 글 길이) 지도를 그 아래로 다시 맞춘다.
    const bottom = this.hud.bottom;
    if (Math.abs(bottom - this.hudBottom) > 1) {
      this.hudBottom = bottom;
      this.fitCamera();
    }
  }

  /** 학생은 모두 머리 위에 목숨을 띄운다(선생님은 띄우지 않는다). */
  protected wantsTag(p: Player): TagStyle | null {
    return p.role === 'student' ? 'lives' : null;
  }

  protected ownTagStyle(): TagStyle | null {
    return this.net.role === 'student' ? 'lives' : null;
  }

  /** 탈락한 학생은 흐리게, 문제를 푸는 동안(학생 화면)은 점점 사라지게 보인다. */
  protected decorateRemote(r: Remote, p: Player) {
    r.avatar.setAlpha((p.gbOut ? alpha.outAvatar : 1) * this.othersVisibility());
    if (r.avatar.tag) setTag(r.avatar.tag, livesTag(p));
  }

  /**
   * 다른 사람이 보이는 정도(0~1). 학생 화면에서는 문제가 시작되면 gbFadeMs 동안 흐려지다 사라져
   * 다른 학생을 따라 움직이지 못하게 한다. 정답을 공개하면 다시 모두 보인다. 선생님 화면은 늘 보인다.
   */
  private othersVisibility() {
    const gb = this.net.goldenbell;
    if (this.net.role === 'teacher' || gb.phase !== 'question') return 1;
    if (this.fade.index !== gb.index) this.fade = { index: gb.index, startedAt: performance.now() };
    return Math.max(0, 1 - (performance.now() - this.fade.startedAt) / motion.gbFadeMs);
  }

  protected reserved(): Reserved {
    const cam = this.cameras.main;
    return {
      top: this.css(Math.max(size.reserveTop, this.hud.bottom + size.reserveGap)),
      bottom: 0,
      right: this.panel ? Math.max(0, cam.width - this.css(this.panel.left)) : 0,
    };
  }

  /** 서버 상태에 맞춰 구역, 문제 카드, 내 상태, 선생님 창을 고친다. 바뀐 것만 다시 그린다. */
  private syncView() {
    const gb = this.net.goldenbell;
    const me = this.net.me();
    const players = [...this.net.room.state.players.values()];
    const teacher = this.net.role === 'teacher';
    this.hud.showCard(cardView(gb, me, players, teacher));
    if (me && !teacher) this.hud.showMine(mineView(gb, me, this.zones));
    this.panel?.show(panelView(gb, players, this.zones), this.waiting);
    this.avatar.setAlpha(me?.gbOut ? alpha.outAvatar : 1);
    if (me && this.avatar.tag) setTag(this.avatar.tag, livesTag(me));

    const showZones = gb.phase === 'question' || gb.phase === 'reveal';
    const key = showZones ? `${gb.type}|${gb.choices.join('|')}|${gb.answer}` : '';
    if (key !== this.zoneKey) {
      this.zoneKey = key;
      this.drawZones(showZones ? activeZones(this.zones, gb.type, gb.choices.length) : [], gb.choices, gb.answer);
    }
  }

  /** 답 구역을 칠하고 이름(O·X, 1~4)과 보기 글을 적는다. 정답을 공개하면 정답 구역만 진하게 한다. */
  private drawZones(list: Zone[], choices: string[], answer: string) {
    const t = size.tile;
    this.zoneLayer.clear();
    for (const text of this.zoneTexts) text.destroy();
    this.zoneTexts = [];
    for (const z of list) {
      const a = answer === '' ? alpha.zone : z.label === answer ? alpha.zoneCorrect : alpha.zoneDim;
      this.zoneLayer.fillStyle(color.zone[z.label as keyof typeof color.zone] ?? color.zone.O, a);
      this.zoneLayer.fillRect(z.col * t, z.row * t, z.w * t, z.h * t);
      const cx = (z.col + z.w / 2) * t;
      const label = this.add
        .text(cx, z.row * t + size.zoneTextPad, z.label, {
          fontFamily,
          fontSize: size.zoneLabelFont,
          fontStyle: 'bold',
          color: color.zoneLabel,
          resolution: size.textResolution,
        })
        .setOrigin(0.5, 0)
        .setDepth(ZONE_DEPTH);
      this.zoneTexts.push(label);
      const choice = /^\d$/.test(z.label) ? choices[Number(z.label) - 1] : undefined;
      if (choice) {
        this.zoneTexts.push(
          this.add
            .text(cx, label.y + label.height, choice, {
              fontFamily,
              fontSize: size.zoneTextFont,
              color: color.zoneLabel,
              align: 'center',
              wordWrap: { width: z.w * t - 2 * size.zoneTextPad, useAdvancedWrap: true },
              resolution: size.textResolution,
            })
            .setOrigin(0.5, 0)
            .setDepth(ZONE_DEPTH),
        );
      }
    }
  }

  /** 선생님 요청을 보내고, 거절되면 그 까닭을 보인다. 답을 받을 때까지 단추를 잠근다. */
  private async ask(send: () => Promise<{ error: string | null }>) {
    if (this.waiting) return;
    this.waiting = true;
    try {
      const reply = await send();
      if (reply.error) await this.dialog.message('골든벨', reply.error);
    } catch {
      await this.dialog.message('골든벨', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.waiting = false;
    }
  }
}

/** 머리 위 글을 바뀌었을 때만 고쳐 보인다. */
function setTag(tag: Phaser.GameObjects.Text, text: string) {
  if (tag.text !== text) tag.setText(text);
  tag.setVisible(true);
}
