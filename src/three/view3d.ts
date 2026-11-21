// three.js 3D 화면(시제품, 주소의 ?view=3d). 첫 화면과 서버 연결(src/net/connection.ts)은 2D와 같고, 화면만 3D로 그린다.
// 서버가 알려 준 지금 맵을 src/data의 맵 데이터로 그리고(world.ts), 고정 시점 카메라가 나를 따라간다.
// 움직임·충돌·서버에 보내는 move(moveSeq 규칙 포함)는 2D(MapScene)와 같다. 다른 사람은 서버 위치로 부드럽게 따라간다.
// 골든벨·미니게임의 3D 화면, CCTV, 사물 살펴보기는 아직 없다(다음 단계).
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { MapId } from '../../shared/protocol.ts';
import type { Player } from '../../shared/schema.ts';
import school from '../data/school.json';
import goldenbell from '../data/goldenbell.json';
import { areaAt, loadRoom, type Room } from '../data/room';
import type { Net } from '../net/connection';
import { motion, three } from '../theme';
import { el, uiRoot } from '../ui/dom';
import { Hud } from '../ui/hud';
import { Joystick } from '../ui/joystick';
import { Character, ModelBank } from './characters';
import { MapRules, type ObjectLook } from './rules';
import { World } from './world';

/** 방향키·WASD(KeyboardEvent.code) → (dx, dy) */
const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};
/** 사물 모습(문 열림 등)을 다시 따지는 간격(ms) */
const LOOK_INTERVAL = 200;

interface Remote {
  ch: Character;
  x: number;
  z: number;
  /** 마지막으로 서버 상태에서 본 프레임 번호(나간 사람을 지울 때 쓴다) */
  seen: number;
}

export async function start3d(options: { net: Net; touch: boolean; resumed: boolean }) {
  new View3D(options.net, options.touch, options.resumed);
}

class View3D {
  private readonly rooms: Record<MapId, Room> = { school: loadRoom(school), goldenbell: loadRoom(goldenbell) };
  private readonly parent: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(three.fov, 1, 0.5, 300);
  private readonly bank = new ModelBank();
  private readonly me: Character;
  private readonly remotes = new Map<string, Remote>();
  private readonly keys = new Set<string>();
  private readonly joystick: Joystick | null;
  private mapId: MapId = 'school';
  private room!: Room;
  private rules!: MapRules;
  private world: World | null = null;
  private hud: Hud | null = null;
  private looks: ObjectLook[] = [];
  private lookAt = 0;
  private place = '';
  private status: string | null = null;
  /** 발밑 위치(칸). 칸 (c, r)은 [c, c+1) × [r, r+1) */
  private pos = { col: 0, row: 0 };
  /** 학교 맵을 떠날 때 서 있던 자리(돌아오면 그 자리에 선다) */
  private schoolPos: { col: number; row: number } | null = null;
  /** 카메라가 바라보는 점(나를 부드럽게 따라간다)과 카메라까지의 거리 벡터 */
  private readonly focus = new Vector3();
  private readonly offset = new Vector3();
  private last = 0;
  private frame = 0;
  private readonly fps = { frames: 0, since: 0, value: 0 };
  /** 확인용: 최근 프레임마다 tick이 쓴 시간(ms, 메인 스레드. 그리기 명령을 보내는 데까지) */
  private readonly work = new Float32Array(120);
  private readonly info: HTMLElement | null;

  constructor(
    private readonly net: Net,
    touch: boolean,
    resumed: boolean,
  ) {
    const parent = document.getElementById('game');
    if (!parent) throw new Error('화면 요소 #game을 찾지 못했습니다.');
    this.parent = parent;
    this.renderer = new WebGLRenderer({ antialias: three.antialias, powerPreference: 'high-performance' });
    this.renderer.domElement.style.display = 'block';
    parent.append(this.renderer.domElement);

    this.scene.background = new Color(three.background);
    this.scene.add(new HemisphereLight(three.skyLight, three.groundLight, three.hemiIntensity));
    const sun = new DirectionalLight(three.sunLight, three.sunIntensity);
    sun.position.set(three.sunFrom.x, three.sunFrom.y, three.sunFrom.z);
    this.scene.add(sun);
    // 카메라는 돌리지 않는다: 늘 같은 각도로 내려다본다(위치만 나를 따라간다).
    this.camera.rotation.set((-three.pitch * Math.PI) / 180, 0, 0);

    this.me = new Character(this.bank, net.me()?.character ?? net.character, net.nickname, true);
    this.scene.add(this.me.root);

    this.joystick = touch ? new Joystick() : null;
    window.addEventListener('keydown', (e) => {
      if (!(e.code in KEY_DIRS) || isTyping(e.target)) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    net.onStatus((s) => {
      this.status = s === 'reconnecting' ? '연결이 끊겨 다시 연결하는 중입니다.' : null;
      this.hud?.setStatus(this.status);
    });

    this.info = new URLSearchParams(location.search).get('fps') === '1' ? el('div', 'df-render-info') : null;
    if (this.info) uiRoot().append(this.info);

    const first: MapId = net.me()?.map === 'goldenbell' ? 'goldenbell' : 'school';
    this.enterMap(first, resumed);
    new ResizeObserver(() => this.fit()).observe(parent);
    // DPR만 바뀌면 요소 크기는 그대로라 ResizeObserver가 부르지 않는다.
    window.addEventListener('resize', () => this.fit());
    this.fit();
    this.exposeDevHooks();
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  // ---- 맵 ----

  /** 맵을 (다시) 그리고 처음 자리에 선다. 서버가 나를 다른 맵으로 옮기면(골든벨 시작·끝) 다시 부른다. */
  private enterMap(mapId: MapId, resumed: boolean) {
    if (this.world && this.mapId === 'school') this.schoolPos = { ...this.pos };
    this.world?.dispose();
    this.hud?.destroy();
    for (const r of this.remotes.values()) r.ch.dispose();
    this.remotes.clear();

    this.mapId = mapId;
    this.room = this.rooms[mapId];
    this.rules = new MapRules(mapId, this.room, this.net);
    this.looks = this.room.objects.map((o) => this.rules.look(o));
    this.world = new World(this.room);
    this.world.setLooks(this.looks);
    this.scene.add(this.world.group);

    const hud = new Hud(this.room.goal, this.joystick !== null, false);
    // 3D 시제품에는 살펴보기·힌트 수첩이 아직 없다.
    hud.action.hidden = true;
    hud.notebook.hidden = true;
    hud.setRoomCode(this.net.code);
    hud.setStatus(this.status);
    this.hud = hud;
    this.place = '';

    this.pos = this.startPoint(resumed);
    // 처음 자리를 서버에 알린다. 지금 서버의 옮김 번호를 붙인다(맵을 옮긴 뒤의 자리).
    this.net.moveSeq = this.net.me()?.moveSeq ?? 0;
    this.net.sendMove(this.mapId, this.pos.col, this.pos.row, true);
    this.placeMe();
    this.focus.set(this.pos.col, three.lookHeight, this.pos.row);
  }

  /** 서버가 세운 자리(골든벨, 이어 하기)나 학교 맵에서 떠났던 자리, 아니면 시작 위치 둘레 */
  private startPoint(resumed: boolean) {
    const me = this.net.me();
    const back = this.mapId === 'school' ? this.schoolPos : null;
    this.schoolPos = null;
    if (back && this.rules.free(back.col, back.row, this.looks)) return back;
    if (me && (resumed || this.mapId === 'goldenbell') && this.rules.free(me.col, me.row, this.looks)) return { col: me.col, row: me.row };
    return this.rules.spawnPoint(this.looks);
  }

  // ---- 매 프레임 ----

  private tick(time: number) {
    const started = performance.now();
    const dt = this.last ? Math.min(100, time - this.last) : 16;
    this.last = time;
    this.frame++;
    const me = this.net.me();
    if (me && me.map !== this.mapId && me.map in this.rooms) this.enterMap(me.map as MapId, false);
    else if (me && me.moveSeq !== this.net.moveSeq) this.takeServerPos(me);

    if (time - this.lookAt > LOOK_INTERVAL) {
      this.lookAt = time;
      const objects = this.room.objects;
      for (let i = 0; i < objects.length; i++) this.looks[i] = this.rules.look(objects[i]);
      this.world?.setLooks(this.looks);
    }

    this.moveByInput(dt);
    this.syncRemotes(dt);
    this.me.update(dt);
    this.follow(dt);
    this.renderer.render(this.scene, this.camera);
    this.updatePlace();
    this.countFps(time);
    this.work[this.frame % this.work.length] = performance.now() - started;
  }

  /** 서버가 내 자리를 옮겼으면(옮김 번호가 바뀜) 그 자리에 서고 새 번호로 보낸다. */
  private takeServerPos(me: Player) {
    this.pos = { col: me.col, row: me.row };
    this.net.moveSeq = me.moveSeq;
    this.net.sendMove(this.mapId, this.pos.col, this.pos.row, true);
    this.placeMe();
  }

  /** 방향키·WASD(없으면 조이스틱)대로 움직이고 서버에 알린다(2D MapScene.moveByInput과 같다). */
  private moveByInput(dt: number) {
    let dx = 0;
    let dy = 0;
    for (const code of this.keys) {
      const d = KEY_DIRS[code];
      if (!d) continue;
      dx += d[0];
      dy += d[1];
    }
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (dx !== 0 || dy !== 0) {
      // 대각선으로 갈 때도 같은 빠르기가 되게 한다.
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    } else if (this.joystick) {
      dx = this.joystick.vector.x;
      dy = this.joystick.vector.y;
    }
    const col0 = this.pos.col;
    const row0 = this.pos.row;
    if (dx !== 0 || dy !== 0) {
      // 가로, 세로를 따로 옮겨 벽에 닿으면 벽을 따라 미끄러지게 한다.
      const step = (motion.speed * dt) / 1000;
      const nextCol = this.pos.col + dx * step;
      if (this.rules.free(nextCol, this.pos.row, this.looks)) this.pos.col = nextCol;
      const nextRow = this.pos.row + dy * step;
      if (this.rules.free(this.pos.col, nextRow, this.looks)) this.pos.row = nextRow;
      this.placeMe();
    }
    // 누른 쪽을 보고, 실제로 움직였을 때만 걷는다(벽을 밀면 그쪽을 보고 선다).
    this.me.setMotion(dx, dy, this.pos.col !== col0 || this.pos.row !== row0);
    this.net.sendMove(this.mapId, this.pos.col, this.pos.row);
  }

  private placeMe() {
    this.me.root.position.set(this.pos.col, 0, this.pos.row);
  }

  // ---- 다른 사람(같은 맵에 있는 사람만) ----

  private smoothK = 0;
  private dtNow = 0;

  private syncRemotes(dt: number) {
    // 프레임 빠르기와 상관없이 같은 정도로 따라가게 한다.
    this.smoothK = 1 - Math.exp(-dt / motion.remoteSmoothing);
    this.dtNow = dt;
    this.net.room.state.players.forEach(this.syncOne);
    for (const [id, r] of this.remotes) {
      if (r.seen === this.frame) continue;
      r.ch.dispose();
      this.remotes.delete(id);
    }
  }

  /** 매 프레임 새 함수를 만들지 않게 한 번 만들어 둔다. */
  private readonly syncOne = (p: Player, id: string) => {
    if (id === this.net.sessionId || p.map !== this.mapId) return;
    let r = this.remotes.get(id);
    if (r && r.ch.characterId !== p.character) {
      r.ch.dispose();
      r = undefined;
    }
    if (!r) {
      const ch = new Character(this.bank, p.character, p.nickname, false);
      this.scene.add(ch.root);
      r = { ch, x: p.col, z: p.row, seen: this.frame };
      this.remotes.set(id, r);
    }
    r.seen = this.frame;
    const dx = p.col - r.x;
    const dz = p.row - r.z;
    // 서버 위치와 떨어져 있는 동안 그쪽으로 걷는다.
    r.ch.setMotion(dx, dz, Math.hypot(dx, dz) > three.remoteWalkGap);
    r.x += dx * this.smoothK;
    r.z += dz * this.smoothK;
    r.ch.root.position.set(r.x, 0, r.z);
    r.ch.update(this.dtNow);
  };

  // ---- 카메라 ----

  /** 화면 크기가 바뀌면 캔버스와 카메라 거리를 맞춘다: 화면 짧은 쪽에 viewTilesMin~Max칸이 보이게 한다. */
  private fit() {
    const w = Math.max(1, this.parent.clientWidth);
    const h = Math.max(1, this.parent.clientHeight);
    // 기기 픽셀 비율은 상한을 둔다(브라우저 확대나 다른 화면으로 옮기면 바뀌므로 여기서 맞춘다).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, three.pixelRatioMax));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const tiles = Math.min(three.viewTilesMax, Math.max(three.viewTilesMin, Math.min(w, h) / three.tilePx));
    const half = Math.tan((three.fov * Math.PI) / 360);
    const distance = tiles / (2 * half * Math.min(1, this.camera.aspect));
    const pitch = (three.pitch * Math.PI) / 180;
    this.offset.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
  }

  private follow(dt: number) {
    const k = 1 - Math.exp(-dt / three.followSmoothing);
    this.focus.x += (this.pos.col - this.focus.x) * k;
    this.focus.z += (this.pos.row - this.focus.z) * k;
    this.focus.y = three.lookHeight;
    this.camera.position.copy(this.focus).add(this.offset);
  }

  // ---- 안내 ----

  /** 위쪽 안내의 지금 장소. 바뀌었을 때만 고친다. */
  private updatePlace() {
    const place = areaAt(this.room, this.pos.col, this.pos.row)?.name ?? this.room.name;
    if (place === this.place) return;
    this.place = place;
    this.hud?.setPlace(`${place} · 3D 시제품`);
  }

  private countFps(time: number) {
    if (!this.info) return;
    this.fps.frames++;
    if (time - this.fps.since < 500) return;
    this.fps.value = (this.fps.frames * 1000) / (time - this.fps.since);
    this.fps.frames = 0;
    this.fps.since = time;
    const r = this.renderer;
    const c = r.domElement;
    this.info.textContent =
      `3D · DPR ${(window.devicePixelRatio || 1).toFixed(2)} · 픽셀 비율 ${r.getPixelRatio().toFixed(2)} · 캔버스 ${c.width}×${c.height}` +
      ` · 그리기 ${r.info.render.calls}번 · 사람 ${this.remotes.size + 1}명 · ${Math.round(this.fps.value)}fps`;
  }

  // ---- 개발 중 자동 확인용(헤드리스 크롬). 빌드에는 들어가지 않는다. ----

  private exposeDevHooks() {
    if (!import.meta.env.DEV) return;
    const screenOf = (x: number, z: number) => {
      const v = new Vector3(x, three.charHeight / 2, z).project(this.camera);
      return { x: ((v.x + 1) / 2) * this.parent.clientWidth, y: ((1 - v.y) / 2) * this.parent.clientHeight };
    };
    Object.assign(window, {
      __df: {
        view: () => '3d',
        map: () => this.mapId,
        pos: () => ({ ...this.pos }),
        code: () => this.net.code,
        role: () => this.net.role,
        teleport: (col: number, row: number) => {
          this.pos = { col, row };
          this.placeMe();
        },
        others: () => this.net.others().map(([, p]) => ({ nickname: p.nickname, role: p.role, map: p.map, col: p.col, row: p.row, character: p.character })),
        /** 3D: 그리기 호출 수, 삼각형 수, 그린 다른 사람 수, 내 캐릭터·다른 사람의 화면 좌표(CSS 픽셀) */
        three: () => ({
          onScreen: [...this.remotes.values()].filter((r) => {
            const p = screenOf(r.x, r.z);
            return p.x >= 0 && p.y >= 0 && p.x <= this.parent.clientWidth && p.y <= this.parent.clientHeight;
          }).length,
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          pixelRatio: this.renderer.getPixelRatio(),
          /** 최근 120프레임의 tick 시간(ms): 평균, 95%, 가장 김 */
          frameMs: (() => {
            const list = [...this.work].filter((v) => v > 0).sort((a, b) => a - b);
            const avg = list.reduce((n, v) => n + v, 0) / Math.max(1, list.length);
            return { avg, p95: list[Math.floor(list.length * 0.95)] ?? 0, max: list[list.length - 1] ?? 0 };
          })(),
          remotes: this.remotes.size,
          me: screenOf(this.pos.col, this.pos.row),
          others: [...this.remotes.values()].map((r) => screenOf(r.x, r.z)),
        }),
      },
    });
  }
}

/** 글을 입력하는 중이면 방향키를 움직임으로 쓰지 않는다. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
