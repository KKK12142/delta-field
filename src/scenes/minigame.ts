// 학교 맵 위의 미니게임(shared/minigame.ts): 보물·공 그리기, 내 캐릭터의 보물 줍기·공 맞음 알리기, 줄다리기 창, 결과 창.
// 점수·시간·결과는 서버가 정한다. RoomScene이 매 프레임 update()를 부른다. 그림은 public/sprites/mini(docs/art.md "미니게임").
import { GameObjects, Textures, type Scene } from 'phaser';
import {
  DODGE_ARENA,
  MINI_NAMES,
  PICK_REACH,
  ballSchedule,
  ballsAt,
  hitAt,
  type Ball,
  type MiniKind,
} from '../../shared/minigame.ts';
import { CLASS_GROUPS, classGroupName } from '../../shared/protocol.ts';
import type { Net } from '../net/connection';
import { alpha, color, motion, size } from '../theme';
import type { Dialog, ResultView } from '../ui/dialog';
import { MiniHud, TugPanel } from '../ui/minigame';

/** 미니게임 그림(없으면 도형으로 그린다) */
const SHEETS = { shine: 'mini/treasure-shine', ball: 'mini/ball' } as const;
const IMAGES = ['mini/treasure', 'mini/treasure-gold', 'mini/ball-shadow'] as const;
/** 그림 한 칸(도트) */
const FRAME = 30;

/** 미니게임 그림을 불러오게 건다(장면의 preload에서). */
export function loadMiniSprites(scene: Scene) {
  const base = `${import.meta.env.BASE_URL}sprites/`;
  for (const key of IMAGES) if (!scene.textures.exists(key)) scene.load.image(key, `${base}${key}.png`);
  for (const key of Object.values(SHEETS)) {
    if (!scene.textures.exists(key)) scene.load.spritesheet(key, `${base}${key}.png`, { frameWidth: FRAME, frameHeight: FRAME });
  }
}

/** 미니게임 그림에 도트가 흐려지지 않게 NEAREST를 걸고 애니메이션을 만든다. */
export function prepareMiniSprites(scene: Scene) {
  for (const key of [...IMAGES, ...Object.values(SHEETS)]) {
    if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Textures.FilterMode.NEAREST);
  }
  const anim = (key: string, sheet: string, fps: number) => {
    if (scene.anims.exists(key) || !scene.textures.exists(sheet)) return;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(sheet), frameRate: fps, repeat: -1 });
  };
  anim('mini-shine', SHEETS.shine, motion.shineFps);
  anim('mini-roll', SHEETS.ball, motion.ballFps);
}

/** RoomScene이 넘겨주는 것 */
export interface MiniHost {
  scene: Scene;
  net: Net;
  dialog: Dialog;
  /** 내 발 위치(칸) */
  pos(): { col: number; row: number };
  /** 내 캐릭터를 옮긴다(칸) */
  teleport(col: number, row: number): void;
  /** 내 캐릭터의 투명도 */
  setMyAlpha(a: number): void;
  /** 미니게임이 시작될 때(살펴보기 창을 거두고 대상 강조를 지운다) */
  onStart(): void;
}

/** 학교 맵의 미니게임 화면 */
export class MiniGameView {
  private readonly host: MiniHost;
  private readonly hud = new MiniHud();
  private tug: TugPanel | null = null;
  private treasures = new Map<string, GameObjects.Image | GameObjects.Sprite | GameObjects.Arc>();
  /** 공 그림(번호 → 그림, 그림자) */
  private balls = new Map<number, { ball: GameObjects.Sprite | GameObjects.Arc; shadow: GameObjects.Image | null }>();
  private schedule: { seed: number; balls: Ball[] } | null = null;
  /** 이번 판(kind+seed)을 화면이 맞춰 둔 것 */
  private shown = '';
  private phase = '';
  /** 시작 전 자리(끝나면 되돌린다) */
  private before: { col: number; row: number } | null = null;
  /** 보물 줍기를 보낸 때(같은 보물을 자주 보내지 않게) */
  private asked = new Map<string, number>();
  private hitSent = false;
  private outShown = false;
  private resultOpen = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.tug && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      this.pull();
    }
  };

  constructor(host: MiniHost) {
    this.host = host;
    window.addEventListener('keydown', this.onKey);
  }

  private get mini() {
    return this.host.net.mini;
  }

  private get student() {
    return this.host.net.role === 'student';
  }

  /** 하는 중(세기 포함)인 미니게임. 없으면 '' */
  get playing(): MiniKind | '' {
    const m = this.mini;
    return m && (m.phase === 'count' || m.phase === 'play') ? (m.kind as MiniKind) : '';
  }

  /** 걷지 못하게 막는지: 줄다리기 중, 공 피하기에서 탈락해 구경하는 중 */
  get frozen() {
    const k = this.playing;
    return k === 'tug' || (k === 'dodge' && !!this.host.net.me()?.miniOut);
  }

  /** 공 피하기 중 내 발이 (col, row)에 설 수 있는지(운동장 밖으로 못 나간다) */
  allows(col: number, row: number) {
    if (this.playing !== 'dodge' || !this.student) return true;
    const a = DODGE_ARENA;
    return col >= a.col && col <= a.col + a.w && row >= a.row && row <= a.row + a.h;
  }

  /** 보물찾기 중에는 열린 부의 문을 모두 열어 둔다(방탈출 진행과 따로) */
  get doorsOpen() {
    return this.playing === 'treasure';
  }

  update() {
    const m = this.mini;
    if (!m) return;
    const key = m.kind ? `${m.kind}|${m.seed}` : '';
    if (key !== this.shown) this.begin(key);
    if (m.phase !== this.phase) this.changePhase(m.phase);
    if (!m.kind) return;
    this.hud.showCount(m.phase === 'count' ? m.timeLeft : 0);
    this.showHud();
    if (m.kind === 'treasure') this.updateTreasures();
    if (m.kind === 'dodge') this.updateDodge();
    if (m.kind === 'tug') this.updateTug();
  }

  /** 새 판이 시작됐거나 끝났다. */
  private begin(key: string) {
    this.shown = key;
    this.clearSprites();
    this.asked.clear();
    this.hitSent = false;
    this.outShown = false;
    this.schedule = null;
    if (!key) return;
    const m = this.mini;
    this.host.onStart();
    this.before = { ...this.host.pos() };
    void this.host.net.syncClock().catch(() => {});
    // 공 피하기는 서버가 세운 운동장 안 자리로 옮긴다.
    const me = this.host.net.me();
    if (m.kind === 'dodge' && this.student && me) this.host.teleport(me.col, me.row);
    if (m.kind === 'dodge') this.schedule = { seed: m.seed, balls: ballSchedule(m.seed, m.duration) };
    if (m.kind === 'tug') this.tug = new TugPanel(() => this.pull());
  }

  private changePhase(phase: string) {
    const was = this.phase;
    this.phase = phase;
    if (phase === 'result') {
      // 끝나면 시작 전 자리로 돌아가고 결과 창을 띄운다.
      this.restore();
      this.tug?.destroy();
      this.tug = null;
      this.clearSprites();
      void this.showResult();
    }
    if (phase === '' && was !== '') {
      if (was !== 'result') this.restore();
      this.tug?.destroy();
      this.tug = null;
      this.hud.show(null);
      this.hud.showCount(0);
      if (this.resultOpen) this.host.dialog.abandon();
      this.resultOpen = false;
    }
  }

  private restore() {
    this.host.setMyAlpha(1);
    if (this.before && this.student) this.host.teleport(this.before.col, this.before.row);
    this.before = null;
  }

  /** 위쪽 진행 칸 */
  private showHud() {
    const m = this.mini;
    const me = this.host.net.me();
    if (m.phase === 'result' || m.phase === '') {
      this.hud.show(null);
      return;
    }
    const kind = m.kind as MiniKind;
    const time = m.phase === 'count' ? '곧 시작합니다' : `남은 시간 ${m.timeLeft}초`;
    let score = '';
    let help = '';
    if (kind === 'treasure') {
      score = this.student ? `내 점수 ${me?.miniScore ?? 0}점 · 남은 보물 ${m.treasures.size}개` : `남은 보물 ${m.treasures.size}개`;
      help = '보물에 닿으면 줍습니다. 금 보물은 3점입니다.';
    } else if (kind === 'dodge') {
      const alive = this.host.net.students('school').filter(([, p]) => !p.miniOut).length + (this.student && !me?.miniOut ? 1 : 0);
      score = this.student && me?.miniOut ? `맞아서 구경합니다 · 버틴 시간 ${me.miniScore.toFixed(1)}초` : `남은 학생 ${alive}명`;
      help = '굴러오는 공을 피합니다. 운동장 밖으로는 나갈 수 없습니다.';
    }
    this.hud.show({ title: MINI_NAMES[kind], time, score, help });
  }

  // ---- 보물찾기 ----

  private updateTreasures() {
    const m = this.mini;
    const scene = this.host.scene;
    const t = size.tile;
    for (const [id, view] of this.treasures) {
      if (!m.treasures.has(id)) {
        view.destroy();
        this.treasures.delete(id);
      }
    }
    m.treasures.forEach((tr, id) => {
      if (this.treasures.has(id)) return;
      const key = tr.gold ? 'mini/treasure-gold' : 'mini/treasure';
      const x = tr.col * t;
      const y = tr.row * t;
      const view = scene.textures.exists(key)
        ? scene.add.image(x, y, key).setScale(size.dotScale).setOrigin(0.5, 0.75)
        : scene.add.circle(x, y, size.treasureRadius, tr.gold ? color.treasureGold : color.treasure);
      view.setDepth(y);
      this.treasures.set(id, view);
      // 금 보물은 반짝임을 겹친다.
      if (tr.gold && scene.anims.exists('mini-shine')) {
        const shine = scene.add.sprite(x, y, SHEETS.shine).setScale(size.dotScale).setOrigin(0.5, 0.75).setDepth(y + 1).play('mini-shine');
        view.once('destroy', () => shine.destroy());
      }
    });
    if (m.phase !== 'play' || !this.student) return;
    // 내 발이 닿은 보물은 줍기를 보낸다(서버가 먼저 온 학생에게 준다). 같은 보물은 0.5초에 한 번만 보낸다.
    const me = this.host.pos();
    const now = performance.now();
    m.treasures.forEach((tr, id) => {
      if (Math.hypot(tr.col - me.col, tr.row - me.row) > PICK_REACH) return;
      if (now - (this.asked.get(id) ?? -Infinity) < 500) return;
      this.asked.set(id, now);
      this.host.net.miniPick(id);
    });
  }

  // ---- 공 피하기 ----

  /** 판 시작부터 지난 시간(초, 서버 시계). 하는 중이 아니면 -1 */
  private dodgeTime() {
    const m = this.mini;
    if (m.phase !== 'play' || !m.startedAt) return -1;
    return (this.host.net.serverNow() - m.startedAt) / 1000;
  }

  private updateDodge() {
    const me = this.host.net.me();
    // 갇히지 않게: 이번 판 학생인데 내 자리가 운동장 밖이면(옛 자리를 받았을 때) 서버가 세운 운동장 안 자리로 다시 선다.
    const here = this.host.pos();
    if (this.student && me && !me.miniOut && this.playing === 'dodge' && !this.allows(here.col, here.row) && this.allows(me.col, me.row)) {
      this.host.teleport(me.col, me.row);
    }
    if (me?.miniOut && !this.outShown && this.student && this.mini.phase === 'play') {
      // 맞으면 서버가 세운 구경 자리로 옮기고 흐리게 보인다.
      this.outShown = true;
      this.host.teleport(me.col, me.row);
      this.host.setMyAlpha(alpha.outAvatar);
    }
    const time = this.dodgeTime();
    const live = new Set<number>();
    if (this.schedule && time >= 0) {
      for (const [x, y, i] of ballsAt(this.schedule.balls, time)) {
        live.add(i);
        this.drawBall(i, x, y);
      }
      if (this.student && me && !me.miniOut && !this.hitSent) {
        const pos = this.host.pos();
        if (hitAt(this.schedule.balls, time, pos.col, pos.row, size.avatarFeet)) {
          this.hitSent = true;
          this.host.net.miniHit();
        }
      }
    }
    for (const [i, b] of this.balls) {
      if (live.has(i)) continue;
      b.ball.destroy();
      b.shadow?.destroy();
      this.balls.delete(i);
    }
  }

  private drawBall(i: number, col: number, row: number) {
    const scene = this.host.scene;
    const t = size.tile;
    let b = this.balls.get(i);
    if (!b) {
      const ball = scene.textures.exists(SHEETS.ball)
        ? scene.add.sprite(0, 0, SHEETS.ball).setScale(size.dotScale).setOrigin(0.5, 0.75)
        : scene.add.circle(0, 0, size.ballRadius, color.ball);
      if (ball instanceof GameObjects.Sprite && scene.anims.exists('mini-roll')) ball.play('mini-roll');
      const shadow = scene.textures.exists('mini/ball-shadow')
        ? scene.add.image(0, 0, 'mini/ball-shadow').setScale(size.dotScale).setOrigin(0.5, 0.75).setDepth(1)
        : null;
      b = { ball, shadow };
      this.balls.set(i, b);
    }
    b.ball.setPosition(col * t, row * t).setDepth(row * t);
    b.shadow?.setPosition(col * t, row * t);
  }

  // ---- 줄다리기 ----

  private pull() {
    const me = this.host.net.me();
    if (this.mini.kind !== 'tug' || this.mini.phase !== 'play' || !this.student || !me?.classGroup) return;
    this.host.net.miniTug();
  }

  private updateTug() {
    const m = this.mini;
    const me = this.host.net.me();
    if (!this.tug) return;
    this.tug.show({
      time: m.phase === 'count' ? `${m.timeLeft}초 뒤 시작합니다` : `남은 시간 ${m.timeLeft}초`,
      avg: { science: m.tugScience, aisw: m.tugAisw },
      pos: m.tugGoal ? m.tugPos / m.tugGoal : 0,
      canPull: m.phase === 'play' && this.student && !!me?.classGroup,
      myClass: this.student ? (me?.classGroup ?? '') : '',
      mine: Math.round(me?.miniScore ?? 0),
    });
  }

  // ---- 결과 ----

  private async showResult() {
    const m = this.mini;
    const kind = m.kind as MiniKind;
    const myName = this.host.net.nickname;
    const unit = (s: number) => (kind === 'dodge' ? `${s.toFixed(1)}초` : kind === 'tug' ? `${Math.round(s)}번` : `${s}점`);
    const results = [...m.results];
    const rows = results.map((r) => ({ rank: r.rank, nickname: r.nickname, character: r.character, score: unit(r.score), me: r.nickname === myName }));
    // 학생은 1~5등과 내 줄, 선생님은 모두
    const top = this.student ? rows.filter((r) => r.rank <= 5 || r.me) : rows;
    const mine = rows.find((r) => r.me);
    const lines: string[] = [];
    if (kind === 'tug') {
      lines.push(m.winner ? `${classGroupName(m.winner)}이 이겼습니다. 이긴 반 학생은 다음 골든벨을 하트 하나 더 들고 시작합니다.` : '비겼습니다.');
      lines.push(CLASS_GROUPS.map((g) => `${g.name} 평균 ${(g.id === 'science' ? m.tugScience : m.tugAisw).toFixed(1)}번`).join(' · '));
    }
    if (kind === 'dodge' && results.length && results.every((r) => r.rank === 1)) lines.push('모두 끝까지 버텼습니다. 모두 1등입니다.');
    const view: ResultView = {
      title: `${MINI_NAMES[kind]} 결과`,
      lines,
      rows: top,
      mine: this.student ? (mine ? `내 등수 ${mine.rank}위 · ${mine.score}` : '이번 판에는 들지 않았습니다.') : '',
    };
    // 다른 창(살펴보기 등)이 떠 있으면 거두고 띄운다.
    if (this.host.dialog.isOpen()) this.host.dialog.abandon();
    this.resultOpen = true;
    await this.host.dialog.result(view);
    this.resultOpen = false;
  }

  private clearSprites() {
    for (const v of this.treasures.values()) v.destroy();
    this.treasures.clear();
    for (const b of this.balls.values()) {
      b.ball.destroy();
      b.shadow?.destroy();
    }
    this.balls.clear();
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.clearSprites();
    this.tug?.destroy();
    this.hud.destroy();
  }
}
