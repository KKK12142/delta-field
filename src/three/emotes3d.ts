// 3D 이모트(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// 단추 줄(src/ui/emoteBar.ts)이나 키보드 1~8로 고르면 서버에 'emote'를 보내고, 서버가 같은 맵에 보낸 'emote'를 받아
// 그 사람 머리 위(이름표 위)에 말풍선을 emoteUi.showMs 동안 띄우고 동작을 한다. 내 것도 서버가 돌려준 것만 띄운다.
// 말풍선 그림은 이모트마다 한 장(캔버스)을 만들어 모두가 함께 쓴다. 골든벨 문제 중에는 흐려진 다른 학생의 말풍선을 그리지 않는다.
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import { EMOTES, type EmoteBroadcast, type EmoteDef, type EmoteMessage } from '../../shared/emotes.ts';
import type { MapId } from '../../shared/protocol.ts';
import { sfx as defaultSfx, type Sfx } from '../audio/sfx';
import type { Net } from '../net/connection';
import { emoteUi, fontFamilySmall, three } from '../theme';
import { EmoteBar } from '../ui/emoteBar';
import type { Character } from './characters';

const EMOTE_OF = new Map(EMOTES.map((e) => [e.id, e]));
/** 키(KeyboardEvent.code) → 이모트 순서 */
const KEY_INDEX: Record<string, number> = Object.fromEntries(
  EMOTES.flatMap((_, i) => [
    [`Digit${i + 1}`, i],
    [`Numpad${i + 1}`, i],
  ]),
);

interface Bubble {
  emote: EmoteDef;
  /** 받은 시각(performance.now) */
  since: number;
  sprite: Sprite;
  material: SpriteMaterial;
  /** 말풍선을 붙인 캐릭터(맵을 옮기면 캐릭터가 새로 생기므로 다시 붙인다) */
  on: Character | null;
  /** 몸으로 흉내 내는 동작을 하는 중이면 그 캐릭터(끝나면 몸을 되돌린다) */
  moved: Character | null;
}

/** 이모트마다 한 장씩 그린 말풍선 그림 */
const textures = new Map<string, { texture: CanvasTexture; aspect: number }>();
const images = new Map<string, HTMLImageElement>();

function iconImage(name: string): HTMLImageElement | null {
  if (!name) return null;
  let img = images.get(name);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}sprites/ui/${name}.png`;
    images.set(name, img);
    // 그림이 말풍선을 그린 뒤에 오면 그 말풍선 그림을 버려 다음에 다시 그리게 한다.
    img.onload = () => {
      for (const e of EMOTES) {
        if (e.icon !== name) continue;
        textures.get(e.id)?.texture.dispose();
        textures.delete(e.id);
      }
    };
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 그림 한 프레임(여러 프레임 그림은 높이만큼 정사각 첫 프레임)의 크기 */
function frameSize(img: HTMLImageElement) {
  const h = img.naturalHeight;
  const w = img.naturalWidth > h * 2 ? h : img.naturalWidth;
  return { w, h };
}

/** 말풍선을 캔버스에 그린다(테두리, 꼬리, 그림과 글). 캔버스 크기도 여기서 정한다. */
function drawBubble(e: EmoteDef, canvas: HTMLCanvasElement) {
  const u = emoteUi;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const font = `${u.font}px ${fontFamilySmall}`;
  ctx.font = font;
  const img = iconImage(e.icon);
  const frame = img ? frameSize(img) : null;
  const iconW = frame ? frame.w * u.dot : 0;
  const iconH = frame ? frame.h * u.dot : 0;
  const textW = e.text ? Math.ceil(ctx.measureText(e.text).width) : 0;
  const innerW = iconW + textW + (iconW && textW ? u.iconGap : 0);
  const innerH = Math.max(iconH, e.text ? u.font : 0, u.font);
  const w = Math.max(innerW + u.padX * 2, innerH + u.padY * 2) + u.lineWidth * 2;
  const bodyH = innerH + u.padY * 2 + u.lineWidth * 2;
  canvas.width = w;
  canvas.height = bodyH + u.tail;
  ctx.font = font;
  ctx.imageSmoothingEnabled = false;
  const half = u.lineWidth / 2;
  // 몸통과 꼬리(아래 가운데)를 한 길로 그린다.
  const r = u.padY;
  const x0 = half;
  const y0 = half;
  const x1 = w - half;
  const y1 = bodyH - half;
  const cx = w / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
  ctx.lineTo(x1, y1 - r);
  ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
  ctx.lineTo(cx + u.tail, y1);
  ctx.lineTo(cx, y1 + u.tail - half);
  ctx.lineTo(cx - u.tail, y1);
  ctx.lineTo(x0 + r, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
  ctx.fillStyle = u.background;
  ctx.fill();
  ctx.lineWidth = u.lineWidth;
  ctx.strokeStyle = u.line;
  ctx.stroke();
  let x = (w - innerW) / 2;
  const mid = bodyH / 2;
  if (img && frame) {
    ctx.drawImage(img, 0, 0, frame.w, frame.h, Math.round(x), Math.round(mid - iconH / 2), iconW, iconH);
    x += iconW + (textW ? u.iconGap : 0);
  }
  if (e.text) {
    ctx.fillStyle = u.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.text, Math.round(x), Math.round(mid) + 1);
  }
}

function bubbleTexture(e: EmoteDef) {
  let t = textures.get(e.id);
  if (!t) {
    const canvas = document.createElement('canvas');
    drawBubble(e, canvas);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    t = { texture, aspect: canvas.width / canvas.height };
    textures.set(e.id, t);
  }
  return t;
}

/** 키 1~8을 이모트로 받지 않을 때: 글을 쓰는 중, 대화상자·창이 떠 있음, 다른 키와 함께 누름 */
function ignoreKey(e: KeyboardEvent) {
  const t = e.target;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return true;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLElement && t.isContentEditable) return true;
  return document.querySelector('#ui .df-dialog') !== null;
}

export class Emotes3D {
  private readonly bubbles = new Map<string, Bubble>();
  /** 확인용: 받은 이모트(최근 20개)와 받을 때의 골든벨 단계 */
  private readonly log: { from: string; id: string; phase: string }[] = [];
  /** 확인용(캡처): 말풍선을 이만큼(ms) 붙잡아 둔다. 0이면 emoteUi.showMs */
  private holdMs = 0;
  private readonly bar: EmoteBar;
  private readonly onKey = (e: KeyboardEvent) => {
    const i = KEY_INDEX[e.code];
    if (i === undefined || ignoreKey(e)) return;
    e.preventDefault();
    this.send(EMOTES[i].id);
  };

  /**
   * characterOf: 접속 id → 지금 그 사람의 3D 캐릭터(같은 맵에 없으면 null), mapOf: 내가 지금 보는 맵
   */
  constructor(
    private readonly net: Net,
    private readonly characterOf: (id: string) => Character | null,
    private readonly mapOf: () => MapId,
    private readonly sfx: Sfx = defaultSfx,
  ) {
    for (const e of EMOTES) iconImage(e.icon);
    this.bar = new EmoteBar(sfx, (id) => this.send(id), net.role === 'teacher');
    window.addEventListener('keydown', this.onKey);
    net.room.onMessage('emote', (m: EmoteBroadcast) => this.receive(m));
    // 서버는 받겠다고 알린 화면에만 이모트를 보낸다(2D 화면·봇에는 보내지 않음). 다시 붙어도 같은 접속 id라 이어진다.
    net.room.send('emoteListen');
    this.exposeDevHooks();
  }

  /** 이모트를 보낸다(재사용 대기 중이면 보내지 않는다. 서버도 다시 막는다). */
  send(id: string) {
    if (this.bar.cooling || !EMOTE_OF.has(id)) return;
    const message: EmoteMessage = { id };
    this.net.room.send('emote', message);
    this.bar.cooldown();
  }

  private receive(m: EmoteBroadcast) {
    const emote = typeof m?.id === 'string' ? EMOTE_OF.get(m.id) : undefined;
    if (!emote || typeof m.from !== 'string') return;
    this.log.push({ from: this.net.room.state.players.get(m.from)?.nickname ?? m.from, id: emote.id, phase: this.net.goldenbell.phase });
    if (this.log.length > 20) this.log.shift();
    this.remove(m.from);
    const t = bubbleTexture(emote);
    const material = new SpriteMaterial({ map: t.texture, depthTest: false, depthWrite: false, transparent: true });
    const sprite = new Sprite(material);
    sprite.center.set(0.5, 0);
    sprite.scale.set(emoteUi.height * t.aspect, emoteUi.height, 1);
    sprite.renderOrder = 3;
    this.bubbles.set(m.from, { emote, since: performance.now(), sprite, material, on: null, moved: null });
    if (!this.hushed(m.from)) {
      this.sfx.play('pop');
      const ch = this.characterOf(m.from);
      if (ch) this.startAction(ch, emote, m.from);
    }
  }

  /** 골든벨 문제를 푸는 중이면 학생 화면에서 다른 학생의 말풍선을 그리지 않는다(서버도 보내지 않는다). */
  private hushed(id: string) {
    if (id === this.net.sessionId || this.net.role !== 'student' || this.mapOf() !== 'goldenbell') return false;
    if (this.net.goldenbell.phase !== 'question') return false;
    return this.net.room.state.players.get(id)?.role === 'student';
  }

  private startAction(ch: Character, e: EmoteDef, id: string) {
    const b = this.bubbles.get(id);
    if (e.action === 'jump' || e.action === 'wave') {
      if (ch.act(e.action)) return;
    }
    if (e.action && b) b.moved = ch;
  }

  /** 매 프레임: 말풍선 자리·투명도와 몸으로 하는 동작. 시간이 지난 말풍선은 지운다. */
  update(now = performance.now()) {
    this.placeBar();
    for (const [id, b] of this.bubbles) {
      const showMs = this.holdMs || emoteUi.showMs;
      const age = now - b.since;
      if (age >= showMs) {
        this.remove(id);
        continue;
      }
      const ch = this.characterOf(id);
      if (b.on !== ch) {
        b.sprite.removeFromParent();
        b.on = ch;
        ch?.root.add(b.sprite);
      }
      if (!ch) continue;
      const lives = ch.livesText !== null ? three.livesHeight + three.livesGap : 0;
      b.sprite.position.y = three.charHeight + three.tagGap + three.tagHeight + emoteUi.gap + lives;
      const fade = Math.min(1, (showMs - age) / emoteUi.fadeMs);
      b.material.opacity = fade * Math.min(1, ch.shownOpacity || 0);
      b.sprite.visible = !this.hushed(id) && ch.shownOpacity > 0;
      if (b.moved === ch) this.pose(ch, b.emote, age);
    }
  }

  /**
   * 단추 줄의 자리: 선생님 골든벨 화면이면 선생님 창(.df-gb-panel) 맨 아래(경기장을 가리지 않게), 아니면 화면 아래 왼쪽.
   * 맵을 옮기면 선생님 창이 줄과 함께 지워지므로 매 프레임 확인해 다시 붙인다.
   */
  private placeBar() {
    const node = this.bar.node;
    const panel = this.net.role === 'teacher' && this.mapOf() === 'goldenbell' ? document.querySelector('#ui .df-gb-panel') : null;
    const parent = panel ?? document.getElementById('ui');
    if (parent && node.parentElement !== parent) parent.append(node);
  }

  /** 몸으로 흉내 내는 동작: 숙이기(앞으로 기울였다 돌아옴), 흔들기(좌우), 들썩이기(위아래) */
  private pose(ch: Character, e: EmoteDef, age: number) {
    const u = emoteUi;
    const k = Math.min(1, age / u.motionMs);
    const body = ch.body;
    if (k >= 1) {
      this.resetPose(ch);
      return;
    }
    if (e.action === 'bow') {
      body.rotation.order = 'YXZ';
      body.rotation.x = u.bowAngle * Math.sin(Math.PI * k);
    } else if (e.action === 'sway') {
      body.rotation.order = 'YXZ';
      body.rotation.z = u.swayAngle * Math.sin(k * Math.PI * 4) * (1 - k);
    } else {
      // jump·wave 동작이 없는 모델도 들썩이기로
      body.position.y = u.bounceHeight * Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k * 0.5);
    }
  }

  private resetPose(ch: Character) {
    ch.body.rotation.x = 0;
    ch.body.rotation.z = 0;
    ch.body.position.y = 0;
  }

  private remove(id: string) {
    const b = this.bubbles.get(id);
    if (!b) return;
    if (b.moved) this.resetPose(b.moved);
    b.sprite.removeFromParent();
    b.material.dispose();
    this.bubbles.delete(id);
  }

  dispose() {
    for (const id of [...this.bubbles.keys()]) this.remove(id);
    window.removeEventListener('keydown', this.onKey);
    this.bar.destroy();
  }

  /** 개발 중 자동 확인용(헤드리스 크롬): 지금 보이는 말풍선과 보내기 */
  private exposeDevHooks() {
    if (!import.meta.env.DEV) return;
    const df = (window as unknown as { __df?: Record<string, unknown> }).__df;
    if (!df) return;
    Object.assign(df, {
      emotes: () =>
        [...this.bubbles].map(([id, b]) => ({
          nickname: this.net.room.state.players.get(id)?.nickname ?? id,
          emote: b.emote.id,
          visible: b.sprite.visible && b.on !== null && b.material.opacity > 0,
        })),
      emote: (id: string) => this.send(id),
      emoteLog: () => [...this.log],
      /** 캡처용: 말풍선을 ms 동안 붙잡아 둔다(0이면 되돌림) */
      emoteHold: (ms: number) => {
        this.holdMs = ms;
      },
      sounds: () => ({ enabled: this.sfx.enabled, started: this.sfx.started, played: [...this.sfx.played], requested: [...this.sfx.requested] }),
      /** 확인용: 울린·울리려 한 소리 목록을 비운다 */
      soundsReset: () => {
        this.sfx.played.length = 0;
        this.sfx.requested.length = 0;
      },
    });
  }
}
