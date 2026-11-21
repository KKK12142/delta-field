// 3D 학교 맵의 미니게임(design/quick-specs/minigame-3d.md). 규칙·점수·시간·결과는 서버(server/MiniGame.ts)와 shared/minigame.ts 그대로이고,
// 흐름(세기·진행 칸·줍기·맞음 알리기·줄다리기 창·결과 창·시작 전 자리로 돌아가기)은 2D(src/scenes/minigame.ts)와 같다. 여기서는 3D 그림만 다르다.
// - 보물찾기: 보통 보물(상자)·금 보물(보석)을 종류마다 InstancedMesh 하나로, 떠서 돌고 반짝인다. 주운 보물은 서버 목록에서 빠지면 사라진다.
// - 공 피하기: shared/minigame.ts의 ballSchedule·ballsAt·hitAt(2D·봇과 같은 계산)으로 공(InstancedMesh)을 굴리고, 운동장 둘레에 반투명 울타리를 세운다.
// - 줄다리기·진행 칸·결과 창은 2D와 같은 HTML(src/ui/minigame.ts, Dialog.result).
// 선생님 단추(미니게임 시작·그만두기)의 창도 여기 있다(askMiniStart·askMiniStop). school3d.ts가 만들고 부른다.
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import {
  BALL_RADIUS,
  DODGE_ARENA,
  GOLD_COUNT,
  MINI_KINDS,
  MINI_NAMES,
  PICK_REACH,
  TREASURE_COUNT,
  ballSchedule,
  ballsAt,
  hitAt,
  type Ball,
  type MiniKind,
} from '../../shared/minigame.ts';
import { CLASS_GROUPS, classGroupName } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import type { Net } from '../net/connection';
import { alpha, mini3d, size } from '../theme';
import type { Dialog, ResultView } from '../ui/dialog';
import { MiniHud, TugPanel } from '../ui/minigame';

/** 선생님 고르기 창의 그림(public/sprites/ui/icon-*.png, 2D와 같음) */
const MINI_ICON: Record<MiniKind, string> = { treasure: 'treasure', dodge: 'ball', tug: 'rope' };
const MINI_HELP: Record<MiniKind, string> = {
  treasure: '열린 장소 곳곳에 보물이 나타납니다. 먼저 닿은 학생이 가져갑니다(3분).',
  dodge: '모두 운동장으로 옮겨 굴러오는 공을 피합니다. 맞으면 구경합니다(2분).',
  tug: '반 대항 줄다리기입니다. 이긴 반 학생은 다음 골든벨에서 하트 +1(30초).',
};

/** 하는 중(세기 포함)인 미니게임 종류. 없으면 '' */
export function playingMini(net: Net): MiniKind | '' {
  const m = net.mini;
  return m && (m.phase === 'count' || m.phase === 'play') ? (m.kind as MiniKind) : '';
}

/** 선생님: 미니게임 고르기 → 확인 → 시작(서버가 3초 센 뒤 시작한다). 2D RoomScene.startMini와 같다. */
export async function askMiniStart(dialog: Dialog, net: Net) {
  try {
    const picked = await dialog.choose(
      '미니게임',
      '할 미니게임을 고릅니다.',
      MINI_KINDS.map((k) => ({ label: MINI_NAMES[k], detail: MINI_HELP[k], icon: `${import.meta.env.BASE_URL}sprites/ui/icon-${MINI_ICON[k]}.png` })),
    );
    if (picked === null) return;
    const kind = MINI_KINDS[picked];
    const sure = await dialog.confirm('미니게임', `${MINI_NAMES[kind]}을(를) 시작합니다. 3초 뒤 모든 학생 화면에서 시작합니다.`, '시작하기');
    if (!sure) return;
    const reply = await net.miniStart(kind);
    if (reply.error) await dialog.message('미니게임', reply.error);
  } catch {
    await dialog.message('미니게임', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
  }
}

/** 선생님: 하는 중이면 결과 없이 그만두고, 결과를 보이는 중이면 결과 창을 닫는다(확인 창). 2D RoomScene.stopMini와 같다. */
export async function askMiniStop(dialog: Dialog, net: Net) {
  try {
    const playing = net.mini.phase !== 'result';
    const sure = await dialog.confirm('미니게임 그만두기', playing ? '지금 하는 미니게임을 결과 없이 그만둡니다.' : '결과 창을 닫습니다.', '그만두기');
    if (!sure) return;
    const reply = await net.miniStop();
    if (reply.error) await dialog.message('미니게임', reply.error);
  } catch {
    await dialog.message('미니게임', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
  }
}

/** school3d.ts가 넘겨주는 것 */
export interface Mini3DHost {
  net: Net;
  dialog: Dialog;
  scene: Scene;
  /** 내 발 위치(칸) */
  pos(): { col: number; row: number };
  /** 내 캐릭터를 옮기고 서버에 알린다(칸) */
  teleport(col: number, row: number): void;
  /** 미니게임이 시작될 때(떠 있는 창을 거둔다) */
  onStart(): void;
}

const UP = new Vector3(0, 1, 0);

export class MiniGame3D {
  private readonly hud = new MiniHud();
  private tug: TugPanel | null = null;
  private readonly group = new Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly boxes: InstancedMesh;
  private readonly gems: InstancedMesh;
  private readonly boxMaterial: MeshLambertMaterial;
  private readonly gemMaterial: MeshLambertMaterial;
  private readonly balls: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly fence: Group;
  private schedule: { seed: number; balls: Ball[] } | null = null;
  /** 이번 판(kind|seed)을 화면이 맞춰 둔 것 */
  private shown = '';
  private phase = '';
  /** 미니게임이 없을 때 마지막으로 서 있던 자리(서버가 공 피하기 자리로 옮기기 전 자리를 알려고 프레임마다 적는다) */
  private idle: { col: number; row: number } | null = null;
  /** 시작 전 자리(끝나면 되돌린다) */
  private before: { col: number; row: number } | null = null;
  /** 보물 줍기를 보낸 때(같은 보물을 자주 보내지 않게) */
  private readonly asked = new Map<string, number>();
  private hitSent = false;
  private resultOpen = false;
  /** 확인용: 이번 프레임에 그린 공 수와 그 시각의 공 일정 수 */
  private drawn = { balls: 0, expected: 0, time: -1 };
  private readonly m4 = new Matrix4();
  private readonly v3 = new Vector3();
  private readonly s3 = new Vector3();
  private readonly q4 = new Quaternion();
  private readonly axis = new Vector3();
  private readonly onKey = (e: KeyboardEvent) => {
    if (this.tug && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      this.pull();
    }
  };

  constructor(private readonly host: Mini3DHost) {
    const n = TREASURE_COUNT + GOLD_COUNT;
    const box = new BoxGeometry(mini3d.treasureSize, mini3d.treasureSize * 0.8, mini3d.treasureSize * 0.8);
    const gem = new OctahedronGeometry(mini3d.goldSize).scale(0.8, 1.1, 0.8);
    this.boxMaterial = new MeshLambertMaterial({ color: mini3d.treasureColor, emissive: mini3d.treasureColor, emissiveIntensity: mini3d.glow });
    this.gemMaterial = new MeshLambertMaterial({ color: mini3d.goldColor, emissive: mini3d.goldColor, emissiveIntensity: mini3d.glow });
    this.boxes = this.instanced(box, this.boxMaterial, n);
    this.gems = this.instanced(gem, this.gemMaterial, n);

    // 공: 빨간 공에 흰 띠(정점 색). 굴러가는 쪽으로 돌아 띠가 돌아가는 것이 보인다.
    const sphere = new SphereGeometry(BALL_RADIUS, mini3d.ballSegments, mini3d.ballSegments / 2);
    const red = new Color(mini3d.ballColor);
    const white = new Color(mini3d.ballStripe);
    const pos = sphere.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const c = Math.abs(pos.getY(i)) < BALL_RADIUS * mini3d.ballStripeWidth ? white : red;
      colors.push(c.r, c.g, c.b);
    }
    sphere.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.balls = this.instanced(sphere, new MeshLambertMaterial({ vertexColors: true }), mini3d.ballsMax);
    const shadow = new CircleGeometry(BALL_RADIUS * mini3d.shadowScale, 16).rotateX(-Math.PI / 2);
    this.shadows = this.instanced(
      shadow,
      new MeshBasicMaterial({ color: mini3d.shadowColor, transparent: true, opacity: mini3d.shadowOpacity, depthWrite: false }),
      mini3d.ballsMax,
    );
    this.shadows.renderOrder = -1;
    this.fence = this.makeFence();
    this.group.add(this.boxes, this.gems, this.balls, this.shadows, this.fence);
    host.scene.add(this.group);
    window.addEventListener('keydown', this.onKey);
  }

  private instanced(geometry: BufferGeometry, material: MeshLambertMaterial | MeshBasicMaterial, n: number) {
    const mesh = new InstancedMesh(geometry, material, n);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    // 자리가 매 프레임 바뀌므로 화면 밖 거르기를 하지 않는다(인스턴스가 맵 곳곳에 흩어져 있다).
    mesh.frustumCulled = false;
    this.disposables.push(geometry, material);
    return mesh;
  }

  /** 공 피하기 운동장(DODGE_ARENA) 둘레의 반투명 울타리 네 변 */
  private makeFence() {
    const a = DODGE_ARENA;
    const g = new Group();
    const material = new MeshBasicMaterial({ color: mini3d.fenceColor, transparent: true, opacity: mini3d.fenceOpacity, depthWrite: false });
    const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.disposables.push(material, geometry);
    const t = mini3d.fenceThick;
    const h = mini3d.fenceHeight;
    const sides: [number, number, number, number][] = [
      [a.col + a.w / 2, a.row, a.w + t, t],
      [a.col + a.w / 2, a.row + a.h, a.w + t, t],
      [a.col, a.row + a.h / 2, t, a.h],
      [a.col + a.w, a.row + a.h / 2, t, a.h],
    ];
    for (const [x, z, w, d] of sides) {
      const side = new Mesh(geometry, material);
      side.position.set(x, 0, z);
      side.scale.set(w, h, d);
      g.add(side);
    }
    g.visible = false;
    return g;
  }

  private get mini() {
    return this.host.net.mini;
  }

  private get student() {
    return this.host.net.role === 'student';
  }

  /** 하는 중(세기 포함)인 미니게임. 없으면 '' */
  get playing(): MiniKind | '' {
    return playingMini(this.host.net);
  }

  /** 걷지 못하게 막는지: 줄다리기 중, 공 피하기에서 탈락해 구경하는 중 */
  get frozen() {
    const k = this.playing;
    return k === 'tug' || (k === 'dodge' && !!this.host.net.me()?.miniOut);
  }

  /** 공 피하기 중 학생의 발이 (col, row)에 설 수 있는지(운동장 밖으로 못 나간다, 2D MiniGameView.allows와 같다) */
  allows(col: number, row: number) {
    if (this.playing !== 'dodge' || !this.student) return true;
    const a = DODGE_ARENA;
    return col >= a.col && col <= a.col + a.w && row >= a.row && row <= a.row + a.h;
  }

  /** 이 사람이 흐리게 보이는지(공 피하기에서 맞아 구경하는 중) */
  opacityOf(p: Player) {
    return p.miniOut && this.playing === 'dodge' ? alpha.outAvatar : 1;
  }

  /** 매 프레임(school3d.ts update) */
  update(time: number) {
    const m = this.mini;
    if (!m) return;
    const key = m.kind ? `${m.kind}|${m.seed}` : '';
    if (key !== this.shown) this.begin(key);
    else if (!key) this.idle = this.host.pos();
    if (m.phase !== this.phase) this.changePhase(m.phase);
    this.fence.visible = this.playing === 'dodge';
    if (!m.kind) return;
    this.hud.showCount(m.phase === 'count' ? m.timeLeft : 0);
    this.showHud();
    if (m.kind === 'treasure') this.updateTreasures(time);
    if (m.kind === 'dodge') this.updateDodge();
    if (m.kind === 'tug') this.updateTug();
  }

  /** 새 판이 시작됐거나 끝났다. */
  private begin(key: string) {
    this.shown = key;
    this.clearMeshes();
    this.asked.clear();
    this.hitSent = false;
    this.schedule = null;
    if (!key) return;
    const m = this.mini;
    this.host.onStart();
    // 서버가 공 피하기 자리로 옮긴 것은 이 프레임 앞에서 이미 받았으므로 지난 프레임까지의 자리를 시작 전 자리로 둔다.
    this.before = this.idle ?? this.host.pos();
    void this.host.net.syncClock().catch(() => {});
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
      this.clearMeshes();
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
    if (this.before && this.student) this.host.teleport(this.before.col, this.before.row);
    this.before = null;
  }

  /** 위쪽 진행 칸(2D와 같은 글) */
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

  private updateTreasures(time: number) {
    const m = this.mini;
    let nb = 0;
    let ng = 0;
    const spin = ((time % mini3d.spinMs) / mini3d.spinMs) * Math.PI * 2;
    let i = 0;
    m.treasures.forEach((tr) => {
      // 보물마다 조금씩 다르게 오르내리고 돈다.
      const phase = i++ * 0.9;
      const y = mini3d.treasureLift + Math.sin((time / mini3d.bobMs) * Math.PI * 2 + phase) * mini3d.bob;
      this.q4.setFromAxisAngle(UP, spin + phase);
      this.m4.compose(this.v3.set(tr.col, y, tr.row), this.q4, this.s3.set(1, 1, 1));
      if (tr.gold) this.gems.setMatrixAt(ng++, this.m4);
      else this.boxes.setMatrixAt(nb++, this.m4);
    });
    this.boxes.count = nb;
    this.gems.count = ng;
    this.boxes.instanceMatrix.needsUpdate = true;
    this.gems.instanceMatrix.needsUpdate = true;
    const glow = mini3d.glow + Math.sin((time / mini3d.glowMs) * Math.PI * 2) * mini3d.glowAmp;
    this.boxMaterial.emissiveIntensity = Math.max(0, glow);
    this.gemMaterial.emissiveIntensity = Math.max(0, glow + mini3d.goldGlowBoost);

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
    const time = this.dodgeTime();
    let n = 0;
    let expected = 0;
    if (this.schedule && time >= 0) {
      const live = ballsAt(this.schedule.balls, time);
      expected = live.length;
      for (const [x, z, i] of live) {
        if (n >= mini3d.ballsMax) break;
        const b = this.schedule.balls[i];
        const speed = Math.hypot(b.vx, b.vy);
        // 굴러간 거리만큼 돈다: 축은 위(y)와 가는 쪽의 외적, 각도는 거리 / 반지름
        this.axis.set(b.vy / speed, 0, -b.vx / speed);
        this.q4.setFromAxisAngle(this.axis, (speed * (time - b.t)) / BALL_RADIUS);
        this.m4.compose(this.v3.set(x, BALL_RADIUS, z), this.q4, this.s3.set(1, 1, 1));
        this.balls.setMatrixAt(n, this.m4);
        this.m4.makeTranslation(x, 0.01, z);
        this.shadows.setMatrixAt(n, this.m4);
        n++;
      }
      if (this.student && me && !me.miniOut && !this.hitSent) {
        const pos = this.host.pos();
        if (hitAt(this.schedule.balls, time, pos.col, pos.row, size.avatarFeet)) {
          this.hitSent = true;
          this.host.net.miniHit();
        }
      }
    }
    this.balls.count = n;
    this.shadows.count = n;
    this.balls.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.drawn = { balls: n, expected, time };
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

  // ---- 결과(2D와 같은 창) ----

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
    // 다른 창이 떠 있으면 거두고 띄운다.
    if (this.host.dialog.isOpen()) this.host.dialog.abandon();
    this.resultOpen = true;
    await this.host.dialog.result(view);
    this.resultOpen = false;
  }

  private clearMeshes() {
    this.boxes.count = this.gems.count = this.balls.count = this.shadows.count = 0;
    this.drawn = { balls: 0, expected: 0, time: -1 };
  }

  /** 개발 확인용(window.__df): 2D와 같은 이름의 mini·treasures와 3D 그림 상태 mini3d */
  devHooks(): Record<string, unknown> {
    return {
      mini: () => {
        const m = this.mini;
        const me = this.host.net.me();
        return { kind: m.kind, phase: m.phase, timeLeft: m.timeLeft, treasures: m.treasures.size, score: me?.miniScore ?? 0, out: me?.miniOut ?? false, heart: me?.miniHeart ?? false };
      },
      treasures: () => [...this.mini.treasures].map(([id, t]) => [id, t.col, t.row, t.gold]),
      /** 3D에 그린 것: 보물(보통·금) 수, 공 수와 그 시각 공 일정의 공 수, 울타리, 줄다리기 창, 걷지 못함 */
      mini3d: () => ({
        boxes: this.boxes.count,
        gems: this.gems.count,
        balls: this.drawn.balls,
        expectedBalls: this.drawn.expected,
        ballTime: this.drawn.time,
        fence: this.fence.visible,
        tug: !!document.querySelector('.df-tug'),
        frozen: this.frozen,
        before: this.before,
      }),
      /** 이 시각(판 시작부터 초)에 공 일정의 공 자리 [열, 행](맞기 확인용) */
      ballsAt: (time: number) => (this.schedule ? ballsAt(this.schedule.balls, time).map(([x, y]) => [x, y]) : []),
      /** 지금 판 시각(서버 시계, 초). 하는 중이 아니면 -1 */
      dodgeTime: () => this.dodgeTime(),
    };
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.tug?.destroy();
    this.hud.destroy();
    if (this.resultOpen) this.host.dialog.abandon();
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
