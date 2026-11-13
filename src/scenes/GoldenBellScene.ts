import { activeZones, type Zone, type Zones } from '../../shared/goldenbell.ts';
import type { Player } from '../../shared/schema.ts';
import { cardView, livesTag, mineView, panelView } from '../game/goldenbell';
import { hintSummary } from '../game/progress';
import { askAnnounce } from '../ui/announce';
import { GbHud, GbPanel } from '../ui/goldenbell';
import { SeeThrough } from '../ui/seeThrough';
import { snapZoom } from '../render';
import { alpha, color, fontFamily, motion, size } from '../theme';
import type { TagStyle } from './avatar';
import { MapScene, type MapContext, type Remote, type Reserved } from './MapScene';

/** 구역을 칠하는 깊이: 바닥(0) 위, 사물·아바타(깊이 = y 픽셀) 아래 */
const ZONE_DEPTH = 1;
/** 구역 이름(O·X, 1~4)과 보기 글의 깊이: 앞에 선 캐릭터에 가려지지 않게 아바타(깊이 = y 픽셀)보다 위 */
const ZONE_TEXT_DEPTH = 1_000_000;

/** 골든벨 맵: 선생님이 낸 문제의 답 구역으로 걸어가 선다. 채점은 서버가 한다. */
export class GoldenBellScene extends MapScene {
  readonly mapId = 'goldenbell';
  private hud!: GbHud;
  /** 문제 카드·내 상태(순위 포함) 뒤에 들어간 내 캐릭터 자리를 뚫는다. */
  private seeThrough!: SeeThrough;
  private panel: GbPanel | null = null;
  private zones!: Zones;
  private zoneLayer!: Phaser.GameObjects.Graphics;
  private zoneTexts: Phaser.GameObjects.Text[] = [];
  /** 구역을 마지막으로 그린 상태(바뀌었을 때만 다시 그린다) */
  private zoneKey = '';
  private hudBottom = 0;
  /** 선생님이 보낸 요청의 답을 기다리는 중 */
  private waiting = false;
  /** 답 칸에 글자를 쓰게 한(focus) 단답형 문제 번호 */
  private focusedIndex = -1;
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
    // 처음 그릴 때 반드시 맞추게(구역 판 감추기 포함) 어떤 상태와도 다른 값으로 둔다.
    this.zoneKey = '-';
    this.hudBottom = 0;
    this.waiting = false;
    this.panel = null;
    this.fade = { index: -1, startedAt: 0 };
    this.focusedIndex = -1;
  }

  create() {
    super.create();
    this.zoneLayer = this.add.graphics().setDepth(ZONE_DEPTH);
    const teacher = this.net.role === 'teacher';
    this.hud = new GbHud(
      teacher,
      (text) => void this.submit(text),
      () => void this.openNotebook(),
    );
    this.seeThrough = new SeeThrough(() => this.hud.overMap);
    if (teacher) {
      this.panel = new GbPanel({
        next: () => void this.ask(() => this.net.gbNext()),
        end: () => void this.confirmEnd(),
        accept: (key, accept) => void this.ask(() => this.net.gbAccept(key, accept)),
        close: () => void this.ask(() => this.net.gbClose()),
        resetTotal: () => void this.confirmResetTotal(),
        announce: () => {
          if (!this.dialog.isOpen()) void askAnnounce(this.dialog, this.net);
        },
      });
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
        return {
          phase: gb.phase,
          index: gb.index,
          total: gb.total,
          type: gb.type,
          timeLeft: gb.timeLeft,
          answer: gb.answer,
          explain: gb.explain,
          submitted: gb.submitted,
          accepted: [...gb.accepted],
        };
      },
      /** 보이는 모습: 내 아바타와 다른 사람 아바타의 투명도와 머리 위 글 */
      looks: () => ({
        me: { alpha: this.avatar.shownAlpha, tag: this.avatar.tag?.visible ? this.avatar.tag.text : null },
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
    // 문제 카드의 높이가 바뀌면(문제 글 길이) 화면 맞추기를 다시 한다(선생님: 지도를 카드 아래에, 학생: 따라가는 자리와 범위).
    const bottom = this.hud.bottom;
    if (Math.abs(bottom - this.hudBottom) > 1) {
      this.hudBottom = bottom;
      this.fitCamera();
    }
    // 선생님 화면(맵 전체 보기, 나를 따라가지 않음)은 뚫지 않는다.
    this.seeThrough.update(this.net.role === 'teacher' ? [] : this.mySpot());
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

  /**
   * 학생(교사 요청 2026-11-13): 학교 맵처럼 지도를 화면 가득 그리고 내 아바타를 같은 배율(viewZoom)로 따라간다.
   * 문제 카드·내 상태는 지도 위에 얹고(뒤의 캐릭터는 안내 뚫기), 아바타는 카드 아래 빈 자리의 가운데에 둔다.
   * 따라가는 범위는 맵 위쪽을 카드 높이만큼 더 내려 보일 수 있게 해(reserved().top), 맨 윗줄 구역도 카드에 가리지 않고 보인다.
   * 선생님(프로젝터)은 지금처럼 맵 전체를 카드 아래·창 왼쪽에 맞춘다.
   */
  protected fitCamera() {
    if (this.net.role === 'teacher') super.fitCamera();
    else this.followCamera(this.avatar, true);
  }

  /**
   * 학생 따라가기 배율(교사 요청 2026-11-13 "태블릿에서도 좀 더 키울 수 있나"): 맵이 화면을 빈 곳 없이 채우는 배율(cover)을 쓰고,
   * 넘치는 쪽은 나를 따라 움직인다. 화면 짧은 쪽에 size.gbMinTiles칸 이상은 보이게 상한을 둔다(상한에 걸리면 한쪽에 빈 곳이 남는다).
   * 도트가 정수 픽셀이 되게 맞추는 그리기 방식이면 1/zoomSnap 단위로 올려 맞추되, 상한을 넘으면 맞추지 않는다. 학교 맵 배율보다 작아지지는 않는다.
   */
  protected viewZoom() {
    const base = super.viewZoom();
    if (this.net.role === 'teacher') return base;
    const cam = this.cameras.main;
    const map = this.mapPixels();
    const cap = Math.min(cam.width, cam.height) / (size.gbMinTiles * size.tile);
    let zoom = Math.min(Math.max(cam.width / map.w, cam.height / map.h), cap);
    if (snapZoom) {
      const up = Math.ceil(zoom * size.zoomSnap - 1e-6) / size.zoomSnap;
      if (up <= cap) zoom = up;
    }
    return Math.min(this.css(size.zoomMax), Math.max(base, zoom));
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
    const rounds = this.net.room.state.gbRounds ?? 0;
    this.hud.showCard(cardView(gb, me, players, teacher, rounds));
    // 키보드가 있는 기기에서는 단답형 문제가 시작되면 답 칸에 바로 쓸 수 있게 한다(터치 기기에서는 화면 키보드가 갑자기 떠 지도를 가리므로 하지 않는다).
    if (!teacher && !this.touch && gb.phase === 'question' && gb.type === 'short' && this.focusedIndex !== gb.index) {
      this.focusedIndex = gb.index;
      this.hud.focusAnswer();
    }
    if (me && !teacher) {
      this.hud.showMine(mineView(gb, me, this.zones, players));
      this.hud.setHints(hintSummary(this.net.escape, [...me.hints]));
    }
    this.panel?.show(panelView(gb, players, this.zones, rounds), this.waiting);
    this.avatar.setAlpha(me?.gbOut ? alpha.outAvatar : 1);
    if (me && this.avatar.tag) setTag(this.avatar.tag, livesTag(me));

    const showZones = gb.phase === 'question' || gb.phase === 'reveal';
    const key = showZones ? `${gb.type}|${gb.choices.join('|')}|${gb.answer}` : '';
    if (key !== this.zoneKey) {
      this.zoneKey = key;
      // 구역 판(pad-O·X, pad-1~4)은 이번 문제의 구역만 보인다(OX면 O·X 판, 객관식이면 보기 수만큼).
      const labels = new Set(showZones ? activeZones(this.zones, gb.type, gb.choices.length).map((z) => z.label) : []);
      for (const o of this.room.objects) {
        if (o.id.startsWith('pad-')) this.objectViews.get(o.id)?.setHidden(!labels.has(o.id.slice(4)));
      }
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
      // 구역 이름(O·X, 1~4)은 바닥의 구역 판(pad-*)이 보인다. 판이 없는 맵이면 글자로 적는다.
      const pad = this.room.objects.find((o) => o.id === `pad-${z.label}`);
      let below = z.row * t + size.zoneTextPad;
      if (pad) below = (pad.row + pad.h) * t + size.zoneTextPad;
      else {
        const label = this.add
          .text(cx, below, z.label, {
            fontFamily,
            fontSize: size.zoneLabelFont,
            color: color.zoneLabel,
            resolution: size.textResolution,
          })
          .setOrigin(0.5, 0)
          .setDepth(ZONE_TEXT_DEPTH);
        this.zoneTexts.push(label);
        below = label.y + label.height;
      }
      // 객관식 보기 글은 판 아래에 적는다(문제 카드에도 있다).
      const choice = /^\d$/.test(z.label) ? choices[Number(z.label) - 1] : undefined;
      if (choice) {
        this.zoneTexts.push(
          this.add
            .text(cx, below, choice, {
              fontFamily,
              fontSize: size.zoneTextFont,
              color: color.zoneLabel,
              align: 'center',
              wordWrap: { width: z.w * t - 2 * size.zoneTextPad, useAdvancedWrap: true },
              resolution: size.textResolution,
            })
            .setOrigin(0.5, 0)
            .setDepth(ZONE_TEXT_DEPTH),
        );
      }
    }
  }

  /** 학생이 단답형 답을 낸다. 서버가 받으면 낸 답을 보이고, 거절하면 그 까닭을 보인다. */
  private async submit(text: string) {
    this.hud.setSending(true);
    try {
      const reply = await this.net.gbSubmit(text);
      if (reply.error) this.hud.setSent('', reply.error);
      else this.hud.setSent(text);
    } catch {
      this.hud.setSent('', '서버에서 답을 받지 못했습니다. 다시 냅니다.');
    } finally {
      this.hud.setSending(false);
    }
  }

  /** 힌트 수첩: 방탈출에서 얻은 힌트 카드를 본다(여는 동안 걷지 않는다). */
  private async openNotebook() {
    if (this.dialog.isOpen()) return;
    try {
      const cards = await this.net.myHints();
      if (!this.dialog.isOpen()) await this.dialog.notebook(cards, this.net.escape.hintTotal);
    } catch {
      await this.dialog.message('힌트 수첩', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    }
  }

  /** 골든벨 끝내기는 되돌릴 수 없으니 한 번 더 묻는다(바로 옆 "다음 문제"와 헷갈려 누르지 않게). */
  private async confirmEnd() {
    if (this.waiting || this.dialog.isOpen()) return;
    const gb = this.net.goldenbell;
    const left = gb.phase === 'end' ? '' : ` 아직 ${Math.max(0, gb.total - gb.index - 1)}문제가 남아 있습니다.`;
    const sure = await this.dialog.confirm('골든벨 끝내기', `골든벨을 끝내고 모두 학교로 돌려보냅니다.${left}`, '끝내기');
    if (sure) await this.ask(() => this.net.gbEnd());
  }

  /** 합산 순위를 처음으로 돌리기 전에 묻는다. */
  private async confirmResetTotal() {
    if (this.waiting || this.dialog.isOpen()) return;
    const sure = await this.dialog.confirm(
      '합계 처음으로',
      '앞서 한 골든벨 판들의 합계 점수를 지웁니다. 지금 판 점수부터 다시 셉니다. 되돌릴 수 없습니다.',
      '처음으로',
    );
    if (sure) await this.ask(() => this.net.gbResetTotal());
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
function setTag(tag: { text: string; setText(t: string): unknown; setVisible(v: boolean): unknown }, text: string) {
  if (tag.text !== text) tag.setText(text);
  tag.setVisible(true);
}
