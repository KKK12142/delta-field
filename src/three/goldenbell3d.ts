// 3D 골든벨 경기장(design/gdd/goldenbell-3d.md). 규칙·채점은 서버(shared/goldenbell.ts, server/ClassRoom.ts) 그대로이고, 여기서는 보이는 모습만 정한다.
// - 넓은 운동장(44×28칸, 바닥 무늬·나무·건물은 playground3d.ts, design/quick-specs/goldenbell-playground.md).
// - 답 구역 판(OX: O 파랑·X 빨강, 객관식 1~4: 2×2, 2D와 같은 자리·색)과 구역 이름 그림(2D의 zone-O 등)·객관식 보기 글.
//   판·글자는 바닥 바로 위에 깔아 캐릭터가 위에 보인다(2026-11-22 교사 요청: 발판이 캐릭터를 가리지 않게).
// - 단계별 모습: 대기(흐린 판) → 문제(이번 종류 구역이 켜짐) → 마감 3초(테두리가 안쪽으로 닫힘) → 정답 공개(정답 구역 번쩍·나머지 어둡게).
// - 머리 위 목숨(♥·♡, 탈락이면 💀), 정답이면 jump·틀리면 그대로, 탈락은 반투명, 문제 중 다른 학생은 gbFadeMs 동안 흐려져 사라짐(학생 화면).
// - 안내(문제 카드·내 상태·단답형 칸·순위·선생님 창)는 2D와 같은 HTML(src/ui/goldenbell.ts)을 얹는다.
import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { activeZones, type Zone, type Zones } from '../../shared/goldenbell.ts';
import type { Player } from '../../shared/schema.ts';
import { mapSize } from '../data/room';
import { cardView, livesTag, mineView, panelView, ranking } from '../game/goldenbell';
import { hintSummary } from '../game/progress';
import { alpha, color, fontFamily, motion, playground, size, three } from '../theme';
import { askAnnounce } from '../ui/announce';
import { GbHud, GbPanel } from '../ui/goldenbell';
import type { Character } from './characters';
import type { MapMode, ModeContext, TileRect } from './mode';
import { Playground } from './playground3d';

/** 느린 기기 설정(?lite=1): 번쩍임·테두리 닫힘 효과를 끈다 */
const effects = new URLSearchParams(location.search).get('lite') === '1' ? three.lite.effects : true;
/** 맞힌 것으로 보고 jump하는 채점 결과 */
const JUMP_RESULTS = new Set(['correct', 'revived', 'heart']);
/** 바닥에 눕힌 1×1 판(구역 판·테두리·글이 함께 쓴다) */
const FLAT = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/**
 * 바닥에 까는 것의 그리는 순서와 높이(칸). 모두 깊이 검사를 하므로 먼저 그린 캐릭터(불투명)가 가린다.
 * 순서: 바닥 무늬 → 구역 판 → 이름 그림·보기 글 → 마감 테두리 → 발밑 그림자(characters.ts, -1) → 흐린 캐릭터 → 이름표·하트(늘 위)
 */
const ORDER = { plate: -3, label: -2.5, choice: -2.4, frame: -2 };
const LIFT = { plate: 0.012, label: 0.016, choice: 0.016, frame: 0.02 };

interface ZoneView {
  zone: Zone;
  kind: 'ox' | 'choice';
  plate: Mesh<PlaneGeometry, MeshBasicMaterial>;
  frame: Group;
  label: Mesh<PlaneGeometry, MeshBasicMaterial> | null;
  choice: { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; text: string } | null;
}

export class GoldenBellMode implements MapMode {
  private readonly group = new Group();
  private readonly field: Playground;
  private readonly hud: GbHud;
  private readonly panel: GbPanel | null;
  private readonly zones: Zones;
  private readonly views: ZoneView[] = [];
  private readonly frameMaterial = new MeshBasicMaterial({
    color: three.gbFrameColor,
    transparent: true,
    opacity: three.gbFrameOpacity,
    depthWrite: false,
  });
  private readonly textures: Texture[] = [];
  private readonly teacher: boolean;
  /** 선생님이 보낸 요청의 답을 기다리는 중 */
  private waiting = false;
  /** 답 칸에 글자를 쓰게 한(focus) 단답형 문제 번호 */
  private focusedIndex = -1;
  /** 이번 단계가 시작된 시각(문제 번호·단계가 바뀔 때 다시 잰다): 판 켜짐·번쩍임·흐려짐에 쓴다 */
  private stage = { key: '', since: 0 };
  /** 남은 시간(초)이 마지막으로 바뀐 시각: 테두리가 초 사이에도 부드럽게 닫히게 */
  private tickAt = { left: -1, at: 0 };
  /** 사람 id → 마지막으로 jump한 단계(같은 공개에 한 번만) */
  private readonly jumped = new Map<string, string>();

  constructor(private readonly ctx: ModeContext) {
    const zones = ctx.room.zones;
    if (!zones) throw new Error('골든벨 맵 데이터에 답 구역(zones)이 없습니다.');
    this.zones = zones;
    this.teacher = ctx.net.role === 'teacher';
    this.hud = new GbHud(
      this.teacher,
      (text) => void this.submit(text),
      () => void this.openNotebook(),
    );
    this.panel = this.teacher
      ? new GbPanel({
          next: () => void this.ask(() => ctx.net.gbNext()),
          end: () => void this.confirmEnd(),
          accept: (key, accept) => void this.ask(() => ctx.net.gbAccept(key, accept)),
          close: () => void this.ask(() => ctx.net.gbClose()),
          resetTotal: () => void this.confirmResetTotal(),
          announce: () => {
            if (!ctx.dialog.isOpen()) void askAnnounce(ctx.dialog, ctx.net);
          },
        })
      : null;
    this.field = new Playground(ctx.room);
    ctx.scene.add(this.field.group);
    for (const z of zones.ox) this.views.push(this.makeZone(z, 'ox'));
    for (const z of zones.choice) this.views.push(this.makeZone(z, 'choice'));
    ctx.scene.add(this.group);
  }

  get overMap() {
    // 선생님 화면(경기장 전체 보기, 나를 따라가지 않음)은 뚫지 않는다.
    return this.teacher ? [] : this.hud.overMap;
  }

  // ---- 구역 그림 ----

  private makeZone(zone: Zone, kind: 'ox' | 'choice'): ZoneView {
    const plate = new Mesh(
      FLAT,
      new MeshBasicMaterial({
        color: color.zone[zone.label as keyof typeof color.zone] ?? color.zone.O,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    plate.scale.set(zone.w, 1, zone.h);
    plate.position.set(zone.col + zone.w / 2, LIFT.plate, zone.row + zone.h / 2);
    plate.renderOrder = ORDER.plate;
    plate.visible = false;
    // 테두리: 네 변(위·아래·왼쪽·오른쪽). 두께는 마감 때 update에서 정한다.
    const frame = new Group();
    for (let i = 0; i < 4; i++) {
      const strip = new Mesh(FLAT, this.frameMaterial);
      strip.renderOrder = ORDER.frame;
      frame.add(strip);
    }
    frame.visible = false;
    // 구역 이름: 2D와 같은 판 그림(objects/zone-O 등)을 같은 자리(pad-O 사물)에 눕힌다.
    const pad = this.ctx.room.objects.find((o) => o.id === `pad-${zone.label}`);
    let label: ZoneView['label'] = null;
    if (pad) {
      const texture = new TextureLoader().load(`${import.meta.env.BASE_URL}sprites/objects/zone-${zone.label}.png`);
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = texture.minFilter = NearestFilter;
      texture.generateMipmaps = false;
      this.textures.push(texture);
      label = new Mesh(FLAT, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      // 2D 그림 크기(2×2칸)의 판 가운데에 넓은 구역에 맞게 키워 눕힌다.
      label.scale.set(pad.w * playground.labelScale, 1, pad.h * playground.labelScale);
      label.position.set(pad.col + pad.w / 2, LIFT.label, pad.row + pad.h / 2);
      label.renderOrder = ORDER.label;
      label.visible = false;
    }
    this.group.add(plate, frame);
    if (label) this.group.add(label);
    return { zone, kind, plate, frame, label, choice: null };
  }

  /** 객관식 보기 글을 판 아래(구역 안)에 눕혀 적는다. 글이 바뀔 때만 다시 그린다. */
  private setChoiceText(v: ZoneView, text: string) {
    if (v.choice?.text === text) return;
    if (v.choice) {
      v.choice.mesh.material.map?.dispose();
      v.choice.mesh.material.dispose();
      v.choice.mesh.removeFromParent();
      v.choice = null;
    }
    if (!text) return;
    const pad = this.ctx.room.objects.find((o) => o.id === `pad-${v.zone.label}`);
    const z = v.zone;
    const widthTiles = z.w - three.gbChoicePad * 2;
    const pxPerTile = three.gbChoiceFont / playground.choiceLine;
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d');
    if (!g) return;
    const font = `${three.gbChoiceFont}px ${fontFamily}`;
    g.font = font;
    const maxW = widthTiles * pxPerTile - three.gbChoiceFont;
    const lines = wrap(g, text, maxW);
    const w = Math.ceil(Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)))) + three.gbChoiceFont;
    const lineH = three.gbChoiceFont * 1.25;
    const h = Math.ceil(lines.length * lineH + three.gbChoiceFont * 0.5);
    canvas.width = w;
    canvas.height = h;
    g.font = font;
    g.fillStyle = three.gbChoiceBack;
    g.beginPath();
    g.roundRect(0, 0, w, h, three.gbChoiceFont * 0.3);
    g.fill();
    g.fillStyle = three.gbChoiceText;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, w / 2, three.gbChoiceFont * 0.25 + lineH * (i + 0.5)));
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    const mesh = new Mesh(FLAT, new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.scale.set(w / pxPerTile, 1, h / pxPerTile);
    const top = pad ? pad.row + pad.h / 2 + (pad.h * playground.labelScale) / 2 + three.gbChoicePad : z.row + three.gbChoicePad;
    mesh.position.set(z.col + z.w / 2, LIFT.choice, top + h / pxPerTile / 2);
    mesh.renderOrder = ORDER.choice;
    this.group.add(mesh);
    v.choice = { mesh, text };
  }

  /** 지금 단계의 구역 모습(design/gdd/goldenbell-3d.md 8번). 매 프레임 투명도만 고친다. */
  private updateZones(time: number) {
    const gb = this.ctx.net.goldenbell;
    const active = new Set(gb.phase === 'question' || gb.phase === 'reveal' ? activeZones(this.zones, gb.type, gb.choices.length) : []);
    const since = time - this.stage.since;
    // 마감: 남은 시간이 gbCloseSeconds 이하이면 테두리가 닫혀 들어온다(초 사이는 시계로 채운다).
    if (gb.timeLeft !== this.tickAt.left) this.tickAt = { left: gb.timeLeft, at: time };
    const remaining = Math.max(0, gb.timeLeft - (time - this.tickAt.at) / 1000);
    const closing = effects && gb.phase === 'question' && remaining <= three.gbCloseSeconds;
    const close = closing ? 1 - remaining / three.gbCloseSeconds : 0;
    for (const v of this.views) {
      const on = active.has(v.zone);
      // 대기(문제가 없거나 단답형): 객관식 4구역을 흐리게 깔아 둔다.
      const waiting = active.size === 0 && v.kind === 'choice';
      let opacity = 0;
      if (on && gb.phase === 'question') {
        const k = Math.min(1, since / three.gbZoneOnMs);
        opacity = three.gbZoneWait + (three.gbZoneQuestion - three.gbZoneWait) * k;
      } else if (on && gb.phase === 'reveal') {
        const correct = v.zone.label === gb.answer;
        opacity = correct ? three.gbZoneCorrect : three.gbZoneDim;
        if (correct && effects && since < three.gbGlowMs) {
          opacity += three.gbGlowBoost * (0.5 + 0.5 * Math.cos((since / three.gbGlowPeriod) * Math.PI * 2));
        }
      } else if (waiting) opacity = three.gbZoneWait;
      v.plate.visible = opacity > 0;
      v.plate.material.opacity = Math.min(1, opacity);
      if (v.label) v.label.visible = on;
      const choice = on && v.kind === 'choice' ? (gb.choices[Number(v.zone.label) - 1] ?? '') : '';
      this.setChoiceText(v, choice);
      v.frame.visible = on && closing;
      if (v.frame.visible) this.placeFrame(v, three.gbFrameMin + (three.gbFrameMax - three.gbFrameMin) * close);
    }
  }

  /** 테두리 네 변을 구역 안쪽 가장자리에 두께 t(칸)로 놓는다. */
  private placeFrame(v: ZoneView, t: number) {
    const { col, row, w, h } = v.zone;
    const y = LIFT.frame;
    const [top, bottom, left, right] = v.frame.children;
    top.scale.set(w, 1, t);
    top.position.set(col + w / 2, y, row + t / 2);
    bottom.scale.set(w, 1, t);
    bottom.position.set(col + w / 2, y, row + h - t / 2);
    left.scale.set(t, 1, h - 2 * t);
    left.position.set(col + t / 2, y, row + h / 2);
    right.scale.set(t, 1, h - 2 * t);
    right.position.set(col + w - t / 2, y, row + h / 2);
  }

  // ---- 매 프레임 ----

  update(time: number) {
    const { net } = this.ctx;
    const gb = net.goldenbell;
    const key = `${gb.phase}|${gb.index}`;
    if (key !== this.stage.key) this.stage = { key, since: time };
    const me = net.me();
    const players = [...net.room.state.players.values()];
    const rounds = net.room.state.gbRounds ?? 0;
    this.hud.showCard(cardView(gb, me, players, this.teacher, rounds));
    // 키보드가 있는 기기에서는 단답형 문제가 시작되면 답 칸에 바로 쓸 수 있게 한다(터치 기기는 화면 키보드가 지도를 가려 하지 않는다).
    if (!this.teacher && !this.ctx.touch && gb.phase === 'question' && gb.type === 'short' && this.focusedIndex !== gb.index) {
      this.focusedIndex = gb.index;
      this.hud.focusAnswer();
    }
    if (me && !this.teacher) {
      this.hud.showMine(mineView(gb, me, this.zones, players));
      this.hud.setHints(hintSummary(net.escape, [...me.hints]));
    }
    this.panel?.show(panelView(gb, players, this.zones, rounds), this.waiting);
    this.updateZones(time);
  }

  /**
   * 다른 사람이 보이는 정도(0~1). 학생 화면에서는 문제가 시작되면 gbFadeMs 동안 흐려지다 사라져 다른 학생을 따라 움직이지 못하게 한다.
   * 정답을 공개하면 다시 모두 보인다. 선생님 화면은 늘 보인다(2D GoldenBellScene과 같다).
   */
  private othersVisibility(time: number) {
    const gb = this.ctx.net.goldenbell;
    if (this.teacher || gb.phase !== 'question') return 1;
    return Math.max(0, 1 - (time - this.stage.since) / motion.gbFadeMs);
  }

  decorate(ch: Character, p: Player, id: string, me: boolean, time: number) {
    const gb = this.ctx.net.goldenbell;
    ch.setLives(p.role === 'student' ? livesTag(p) : null);
    const body = p.gbOut ? alpha.outAvatar : 1;
    ch.setOpacity(me ? body : body * this.othersVisibility(time));
    // 정답 공개: 맞힌 학생(탈락 중 맞힘·부활·넌센스 하트 포함)은 한 번 jump, 틀린 학생은 그대로 선다.
    if (p.role !== 'student') return;
    let jumpKey = '';
    if (gb.phase === 'reveal' && JUMP_RESULTS.has(p.gbResult)) jumpKey = `reveal|${gb.index}|${p.gbResult}`;
    // 결과(모든 문제 끝): 1~3등이 jump한다.
    if (gb.phase === 'end' && this.topRanks().has(p.nickname)) jumpKey = `end|${gb.title}`;
    if (jumpKey && this.jumped.get(id) !== jumpKey && ch.act('jump')) this.jumped.set(id, jumpKey);
  }

  private ranksKey = '';
  private ranks = new Set<string>();
  /** 결과에서 jump할 학생(1~gbJumpRanks등) 닉네임. 단계가 바뀔 때만 다시 센다. */
  private topRanks() {
    if (this.ranksKey !== this.stage.key) {
      this.ranksKey = this.stage.key;
      const list = ranking([...this.ctx.net.room.state.players.values()]);
      this.ranks = new Set(list.filter((r) => r.rank <= three.gbJumpRanks && r.score > 0).map((r) => r.nickname));
    }
    return this.ranks;
  }

  /** 문제 카드 아래(학생)·카드 아래 왼쪽(선생님, 오른쪽은 선생님 창)을 지도로 쓴다. */
  reserved() {
    return {
      top: Math.max(size.reserveTop, this.hud.bottom + size.reserveGap),
      right: this.panel ? Math.max(0, document.documentElement.clientWidth - this.panel.left) : 0,
    };
  }

  /** 선생님(프로젝터): 경기장 전체를 한 화면에. 학생은 나를 따라간다. */
  overview(): TileRect | null {
    if (!this.teacher) return null;
    const m = three.gbTeacherMargin;
    const { cols, rows } = mapSize(this.ctx.room);
    return { col: -m, row: -m, w: cols + 2 * m, h: rows + 2 * m };
  }

  viewTiles() {
    return three.gbStudentTiles;
  }

  setStatus(text: string | null) {
    this.hud.setStatus(text);
  }

  devHooks() {
    return {
      gb: () => {
        const gb = this.ctx.net.goldenbell;
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
      /** 구역 판: 보이는 구역 이름 → 투명도, 이름 그림·보기 글·테두리가 보이는지 */
      zones: () =>
        Object.fromEntries(
          this.views
            .filter((v) => v.plate.visible)
            .map((v) => [`${v.kind}:${v.zone.label}`, { opacity: +v.plate.material.opacity.toFixed(3), label: !!v.label?.visible, choice: v.choice?.text ?? null, frame: v.frame.visible }]),
        ),
    };
  }

  dispose() {
    this.hud.destroy();
    this.panel?.destroy();
    for (const v of this.views) {
      v.plate.material.dispose();
      v.label?.material.dispose();
      this.setChoiceText(v, '');
    }
    for (const t of this.textures) t.dispose();
    this.frameMaterial.dispose();
    this.field.dispose();
    this.group.removeFromParent();
  }

  // ---- 학생·선생님 요청(2D GoldenBellScene과 같다) ----

  /** 학생이 단답형 답을 낸다. 서버가 받으면 낸 답을 보이고, 거절하면 그 까닭을 보인다. */
  private async submit(text: string) {
    this.hud.setSending(true);
    try {
      const reply = await this.ctx.net.gbSubmit(text);
      if (reply.error) this.hud.setSent('', reply.error);
      else this.hud.setSent(text);
    } catch {
      this.hud.setSent('', '서버에서 답을 받지 못했습니다. 다시 냅니다.');
    } finally {
      this.hud.setSending(false);
    }
  }

  /** 힌트 수첩: 방탈출에서 얻은 힌트 카드를 본다. */
  private async openNotebook() {
    const { dialog, net } = this.ctx;
    if (dialog.isOpen()) return;
    try {
      const cards = await net.myHints();
      if (!dialog.isOpen()) await dialog.notebook(cards, net.escape.hintTotal);
    } catch {
      await dialog.message('힌트 수첩', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    }
  }

  /** 골든벨 끝내기는 되돌릴 수 없으니 한 번 더 묻는다. */
  private async confirmEnd() {
    const { dialog, net } = this.ctx;
    if (this.waiting || dialog.isOpen()) return;
    const gb = net.goldenbell;
    const left = gb.phase === 'end' ? '' : ` 아직 ${Math.max(0, gb.total - gb.index - 1)}문제가 남아 있습니다.`;
    const sure = await dialog.confirm('골든벨 끝내기', `골든벨을 끝내고 모두 학교로 돌려보냅니다.${left}`, '끝내기');
    if (sure) await this.ask(() => net.gbEnd());
  }

  /** 합산 순위를 처음으로 돌리기 전에 묻는다. */
  private async confirmResetTotal() {
    const { dialog, net } = this.ctx;
    if (this.waiting || dialog.isOpen()) return;
    const sure = await dialog.confirm(
      '합계 처음으로',
      '앞서 한 골든벨 판들의 합계 점수를 지웁니다. 지금 판 점수부터 다시 셉니다. 되돌릴 수 없습니다.',
      '처음으로',
    );
    if (sure) await this.ask(() => net.gbResetTotal());
  }

  /** 선생님 요청을 보내고, 거절되면 그 까닭을 보인다. 답을 받을 때까지 단추를 잠근다. */
  private async ask(send: () => Promise<{ error: string | null }>) {
    if (this.waiting) return;
    this.waiting = true;
    try {
      const reply = await send();
      if (reply.error) await this.ctx.dialog.message('골든벨', reply.error);
    } catch {
      await this.ctx.dialog.message('골든벨', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.waiting = false;
    }
  }
}

/** 글을 maxW(px) 안에 들게 줄을 나눈다(낱말 사이, 낱말이 길면 글자 단위). */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = '';
  for (const ch of [...text]) {
    const next = line + ch;
    if (g.measureText(next).width > maxW && line) {
      const cut = line.lastIndexOf(' ');
      if (ch !== ' ' && cut > 0) {
        lines.push(line.slice(0, cut));
        line = line.slice(cut + 1) + ch;
      } else {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      }
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
