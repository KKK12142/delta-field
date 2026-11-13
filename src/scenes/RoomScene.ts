import { Input } from 'phaser';
import { DOOR_KINDS, type MissionReward } from '../../shared/escape.ts';
import { GATHER_SECONDS, type ActivityKind } from '../../shared/protocol.ts';
import { areaAt, partOf, type RoomObject } from '../data/room';
import { byClassAndNickname, byProgress, classCounts, describeStudent, summaryLine } from '../game/cctv';
import { areaMissions, hintSummary } from '../game/progress';
import { formatDuration, RunState } from '../game/state';
import { askAnnounce } from '../ui/announce';
import { CctvPanel, type CctvSort } from '../ui/cctv';
import { objectParticle } from '../ui/dom';
import { Hud } from '../ui/hud';
import { Minimap, drawMinimap } from '../ui/minimap';
import { SeeThrough } from '../ui/seeThrough';
import { alpha, color, minimap, motion, size } from '../theme';
import { MapScene, type MapContext, type Remote, type Reserved } from './MapScene';
import { MiniGameView, loadMiniSprites, prepareMiniSprites } from './minigame';
import { MINI_KINDS, MINI_NAMES, type MiniKind } from '../../shared/minigame.ts';
import type { Player } from '../../shared/schema.ts';

/** 선생님의 CCTV 모드 */
interface Cctv {
  panel: CctvPanel;
  /** 따라가는 학생의 접속 id. 전체 보기면 null */
  following: string | null;
  /** 전체 보기에서 비추는 구역 id(맵의 views). null이면 맵 전체 */
  view: string | null;
  /** 학생 목록 정렬 */
  sort: CctvSort;
}

/** 미니게임 → 고르기 단추 그림(public/sprites/ui/icon-<이름>.png) */
const MINI_ICON: Record<MiniKind, string> = { treasure: 'treasure', dodge: 'ball', tug: 'rope' };

/** 미션을 마치면 열린 그림(-open)으로 바꾸는 사물(문이 아닌 것) */
const OPEN_WHEN_DONE: ReadonlySet<string> = new Set(['gate', 'timeCapsule']);

/** 닫은 키가 곧바로 다시 살펴보기로 이어지지 않게 두는 틈(ms) */
const REOPEN_GUARD = 250;

/**
 * 학교: 교실·복도·과학실·컴퓨터실·운동장(1부)과 수학실·도서관·옥상 천문대(2부)가 이어진 맵을 돌아다니며 사물을 살펴보는 방탈출. 장소 사이 문은 잠겨 있다가 열면 지나갈 수 있다.
 * 화면은 내 아바타를 따라간다. 선생님은 CCTV 모드로 학생을 지켜보고 골든벨을 시작한다.
 */
export class RoomScene extends MapScene {
  readonly mapId = 'school';
  private hud!: Hud;
  /** 학생 화면의 미니맵(선생님은 CCTV가 있어 두지 않는다) */
  private minimap: Minimap | null = null;
  /** 왼쪽 위 안내·미니맵 뒤에 들어간 캐릭터 자리를 뚫는다. */
  private seeThrough!: SeeThrough;
  private highlight!: Phaser.GameObjects.Graphics;
  private target: RoomObject | null = null;
  private busy = false;
  private studentCount = -1;
  private cctv: Cctv | null = null;
  /** 미니게임 화면(보물·공·줄다리기·결과) */
  private miniView: MiniGameView | null = null;
  /** 지금 서 있는 장소 이름(안내에 보인 것) */
  private place = '';
  /** 강당으로 모으기 안내에 보인 남은 시간(초). 바뀔 때만 고친다. */
  private gatherShown = -1;
  /** 화면에 맞춰 둔 방탈출 진행(자료 버전, 잠긴 문, 마친 미션, 물건, 힌트). 서버 값이 바뀌면 문 모양과 안내를 고친다. */
  private escapeShown = '';

  constructor() {
    super('school');
  }

  private get state(): RunState {
    return this.ctx.state;
  }

  init(ctx: MapContext) {
    super.init(ctx);
    this.target = null;
    this.busy = false;
    this.studentCount = -1;
    this.cctv = null;
    this.place = '';
    this.gatherShown = -1;
    this.escapeShown = '';
    // 단서·퀴즈 창을 띄운 채 맵을 옮겼으면 그때의 '하는 일'이 남아 있으므로 지운다.
    ctx.state.activity = { kind: '', object: '' };
  }

  preload() {
    super.preload();
    loadMiniSprites(this);
  }

  create() {
    super.create();
    prepareMiniSprites(this);
    this.highlight = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER);

    const teacher = this.net.role === 'teacher';
    this.hud = new Hud(this.room.goal, this.touch, teacher);
    this.hud.setRoomCode(this.net.code);
    this.updatePlace();
    // 연 문, 가진 물건, 힌트 카드 수는 서버의 진행을 따른다(골든벨에 다녀와도 그대로).
    this.syncEscape();
    this.hud.onAction(this.onActionButton);
    this.minimap = teacher ? null : new Minimap(this.room, () => void this.openMap());
    this.seeThrough = new SeeThrough(() => (this.minimap ? [this.hud.overMap, this.minimap.element] : [this.hud.overMap]));
    this.hud.notebook.addEventListener('click', this.onNotebookButton);
    this.hud.escapeFile.addEventListener('click', this.onEscapeFileButton);
    this.hud.cctv.addEventListener('click', this.onCctvButton);
    this.hud.goldenbell.addEventListener('click', this.onGoldenBellButton);
    this.hud.announce.addEventListener('click', this.onAnnounceButton);
    this.hud.part.addEventListener('click', this.onPartButton);
    this.hud.mini.addEventListener('click', this.onMiniButton);
    this.miniView = new MiniGameView({
      scene: this,
      net: this.net,
      dialog: this.dialog,
      pos: () => ({ ...this.pos }),
      teleport: (col, row) => {
        this.pos = { col, row };
        this.placeAvatar();
        this.net.sendMove(this.mapId, col, row, true);
      },
      setMyAlpha: (a) => this.avatar.setAlpha(a),
      onStart: () => {
        // 미니게임이 시작되면 살펴보던 창을 거두고(답을 기다리던 일은 버린다) 대상 강조를 지운다.
        if (this.dialog.isOpen()) this.dialog.abandon();
        this.busy = false;
        this.setActivity('', '');
        this.clearTarget();
      },
    });
    this.updateGather();
    if (teacher) {
      this.input.on('pointerdown', this.onPointerDown, this);
      this.input.on('pointermove', this.onPointerMove, this);
    }
    this.events.once('shutdown', () => {
      this.cctv?.panel.destroy();
      this.cctv = null;
      this.game.canvas.style.cursor = '';
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.hud.destroy();
      this.miniView?.destroy();
      this.miniView = null;
      this.minimap?.destroy();
      this.minimap = null;
    });
    this.fitCamera();
    // 선생님이 방을 만들었는데 방탈출 자료를 아직 고르지 않았으면 바로 고르게 한다(이 접속에서 한 번).
    if (teacher && !this.net.escape.file && !this.ctx.askedEscape) {
      this.ctx.askedEscape = true;
      void this.pickEscapeFile();
    }

    this.exposeDevHooks({
      items: () => [...(this.net.me()?.items ?? [])],
      hints: () => [...(this.net.me()?.hints ?? [])],
      /** 내 화면에서 감춘(주운) 사물 id */
      picked: () => this.room.objects.filter((o) => this.isPicked(o)).map((o) => o.id),
      /** 내 화면에서 감춘 사물 id(주운 물건, 아직 열리지 않은 2부 사물) */
      hidden: () => this.room.objects.filter((o) => this.isHidden(o)).map((o) => o.id),
      /** 켜 보이는 사물 id(순서 맞추기에서 맞게 누름, 마친 미션) */
      lit: () => this.room.objects.filter((o) => this.isLit(o)).map((o) => o.id),
      /** 순서 맞추기 번호: 사물 id → 몇째로 맞게 눌렀는지 */
      marks: () => Object.fromEntries(this.room.objects.map((o) => [o.id, this.markOf(o)]).filter(([, n]) => n)),
      /** 사물 이름표(자료 파일의 labels를 따른다) */
      nameOf: (id: string) => {
        const o = this.room.objects.find((x) => x.id === id);
        return o ? this.nameOf(o) : null;
      },
      /** 미니맵: 보이는지, 큰 지도가 열렸는지 */
      minimap: () => ({
        shown: !!document.querySelector('.df-minimap') && !document.querySelector<HTMLElement>('.df-minimap')!.hidden,
        big: !!document.querySelector('.df-map-big canvas'),
      }),
      escapeFile: () => this.net.escape.file,
      /** 미니게임: 종류, 단계, 남은 시간, 남은 보물 수, 내 점수, 탈락 */
      mini: () => {
        const m = this.net.mini;
        const me = this.net.me();
        return { kind: m.kind, phase: m.phase, timeLeft: m.timeLeft, treasures: m.treasures.size, score: me?.miniScore ?? 0, out: me?.miniOut ?? false, heart: me?.miniHeart ?? false };
      },
      /** 보물 자리 [id, 열, 행, 금] */
      treasures: () => [...this.net.mini.treasures].map(([id, t]) => [id, t.col, t.row, t.gold]),
      /** 미니맵에 표시한 곳(2부 문, 강당)의 id. 없으면 null */
      mapMark: () => {
        const m = this.mapMark();
        return m && 'id' in m ? m.id : null;
      },
      place: () => this.place.split('|')[0],
      target: () => this.target?.id ?? null,
      finished: () => this.state.finishedAt !== null,
      cctv: () => {
        if (!this.cctv) return null;
        const cam = this.cameras.main;
        const following = this.cctv.following ? this.net.room.state.players.get(this.cctv.following) : undefined;
        return {
          following: following?.nickname ?? null,
          view: this.cctv.view,
          zoom: cam.zoom / this.dpr,
          center: { col: cam.midPoint.x / size.tile, row: cam.midPoint.y / size.tile },
          tags: [...this.remotes.values()].filter((r) => r.avatar.tag?.visible).map((r) => r.avatar.tag!.text),
        };
      },
    });
  }

  /** 골든벨에서 돌아왔으면 떠날 때 서 있던 자리에, 아니면 시작 위치 둘레에 선다. */
  protected startPoint() {
    const back = this.ctx.schoolPos;
    this.ctx.schoolPos = null;
    if (back && this.free(back.col, back.row)) return back;
    return this.spawnPoint();
  }

  protected beforeLeave() {
    this.ctx.schoolPos = { ...this.pos };
  }

  /** 공 피하기 중에는 운동장 밖으로 나가지 못한다(보이지 않는 울타리). */
  protected free(col: number, row: number) {
    return super.free(col, row) && (this.miniView?.allows(col, row) ?? true);
  }

  /** 미니게임 공 피하기에서 탈락한 학생은 흐리게 보인다. */
  protected decorateRemote(r: Remote, p: Player) {
    r.avatar.setAlpha(p.miniOut && this.net.mini?.kind === 'dodge' ? alpha.outAvatar : 1);
  }

  /** 연 문과 감춘 사물(주운 물건, 아직 열리지 않은 2부 사물)은 지나갈 수 있다. */
  protected objectBlocks(o: RoomObject) {
    return !this.isOpenDoor(o) && !this.isHidden(o);
  }

  /** 아직 열리지 않은 부의 사물인지(선생님이 "2부 열기"를 누르면 모두에게 열린다) */
  private isClosedPart(o: RoomObject) {
    return partOf(this.room, o) > this.net.part;
  }

  /** 내가 주워 간 물건(줍기 미션을 마침)이면 화면에서 감춘다. */
  private isPicked(o: RoomObject) {
    return !!o.mission && this.net.escape.pickups.includes(o.mission) && this.hasDone(o.mission);
  }

  /** 켜 보일 사물: 순서 맞추기에서 맞게 눌렀거나, 미션을 마친 것 */
  private isLit(o: RoomObject) {
    return this.markOf(o) > 0 || (!!o.mission && this.hasDone(o.mission));
  }

  /** 순서 맞추기: 지금 시도에서 이 사물을 몇째로 맞게 눌렀는지(누르지 않았으면 0). 서버의 Player.pressed를 따른다. */
  private markOf(o: RoomObject) {
    const pressed = [...(this.net.me()?.pressed ?? [])];
    if (!o.mission || !pressed.includes(o.id)) return 0;
    const same = new Set(this.room.objects.filter((x) => x.mission === o.mission).map((x) => x.id));
    return pressed.filter((id) => same.has(id)).indexOf(o.id) + 1;
  }

  /** 사물 이름: 자료 파일에 이름표(labels)가 있으면 그것, 없으면 맵의 이름 */
  private nameOf(o: RoomObject) {
    return this.net.escape.labels.get(o.id) ?? o.name;
  }

  /** 화면에서 감춘 사물: 주운 물건, 아직 열리지 않은 2부의 문 아닌 사물 */
  private isHidden(o: RoomObject) {
    return this.isPicked(o) || (!this.isDoor(o) && (o.part ?? 1) > this.net.part);
  }

  private isDoor(o: RoomObject) {
    return (DOOR_KINDS as readonly string[]).includes(o.kind);
  }

  /** 문 사물이고, 열린 부의 문이며, 자료 파일에서 잠긴 문이 아니거나 내가 연 문이면 열려 있다. */
  private isOpenDoor(o: RoomObject) {
    if (!this.isDoor(o) || this.isClosedPart(o)) return false;
    // 보물찾기 중에는 열린 부의 문을 모두 연다(방탈출 진행과 따로).
    if (this.miniView?.doorsOpen) return true;
    if (!o.mission || !this.net.escape.doors.includes(o.mission)) return true;
    return this.hasDone(o.mission);
  }

  private hasDone(mission: string) {
    return this.net.me()?.done.includes(mission) ?? false;
  }

  /** 살펴볼 수 있는 사물: 자료 파일에 미션이 있고, 열린 부에 있으며, 연 문이나 감춘 사물이 아닌 것 */
  private canLook(o: RoomObject) {
    // 미니게임 중에는 사물을 살펴보지 않는다.
    if (this.miniView?.playing) return false;
    return (
      !!o.mission &&
      this.net.escape.missions.includes(o.mission) &&
      !this.isClosedPart(o) &&
      !this.isOpenDoor(o) &&
      !this.isHidden(o)
    );
  }

  /** 서버의 방탈출 진행이 바뀌었으면 문 모양, 가진 물건, 힌트 수첩 단추를 맞춘다. 매 프레임 부르고 바뀐 때만 고친다. */
  private syncEscape() {
    const e = this.net.escape;
    const me = this.net.me();
    const items = [...(me?.items ?? [])];
    const key = [
      this.net.part, e.version, me?.finished, this.miniView?.doorsOpen, [...e.doors], [...e.pickups], [...(me?.done ?? [])], items, [...(me?.pressed ?? [])], me?.hints.length ?? 0, e.hintTotal,
    ].join('|');
    if (key === this.escapeShown) return;
    this.escapeShown = key;
    for (const o of this.room.objects) {
      const view = this.objectViews.get(o.id);
      // 교문·타임캡슐은 그 미션을 마친 학생 화면에서 열린 모양(gate-open, timeCapsule-open)으로 보인다.
      view?.setOpen(this.isOpenDoor(o) || (OPEN_WHEN_DONE.has(o.kind) && !!o.mission && this.hasDone(o.mission)));
      view?.setDone(!!o.mission && this.hasDone(o.mission));
      view?.setHidden(this.isHidden(o));
      view?.setLit(this.isLit(o));
      view?.setMark(this.markOf(o));
      view?.setName(this.nameOf(o));
    }
    this.hud.setItems(items.map((id) => e.items.get(id) ?? id));
    this.hud.setHints(hintSummary(e, [...(me?.hints ?? [])]));
    this.place = '';
    this.updatePlace();
    // 연 문 위에 서 있던 사물 강조를 다시 고른다.
    this.clearTarget();
  }

  /** 지금 장소 이름과 그 장소의 미션 수(예: "과학실 · 미션 1/4")를 안내에 보인다(장소가 바뀌었거나 진행이 바뀌었을 때). */
  private updatePlace() {
    const area = areaAt(this.room, this.pos.col, this.pos.row);
    const name = area?.name ?? this.room.name;
    const mini = this.miniView?.playing ?? '';
    const key = `${name}|${mini}`;
    if (key === this.place) return;
    this.place = key;
    const count = area && this.net.role === 'student' ? areaMissions(this.room, this.net.escape, [...(this.net.me()?.done ?? [])], area.id) : null;
    if (mini) this.hud.setPlace(`${name} · 미니게임 중`);
    else this.hud.setPlace(count ? `${name} · 미션 ${count.done}/${count.total}` : name);
  }

  protected setConnectionText(text: string | null) {
    this.hud.setStatus(text);
  }

  protected tick(delta: number) {
    // 진행 상태가 바뀌었으면 서버로 보낸다(바뀌지 않았으면 보내지 않는다).
    if (this.net.role === 'student') this.net.sendStatus(this.state.toStatus());
    this.updateGather();
    this.syncEscape();
    this.notices();
    this.miniView?.update();
    if (this.net.role === 'teacher') this.hud.setMini(this.net.mini?.phase !== '' && this.net.mini?.phase !== undefined);
    this.minimap?.update(this.pos, this.net.part, this.mapMark());
    this.seeThrough.update(this.avatarSpots());
    if (this.net.role === 'teacher') {
      const n = this.net.studentCount();
      if (n !== this.studentCount) {
        this.studentCount = n;
        this.hud.setStudentCount(n);
      }
    }
    if (this.cctv) {
      this.updateCctv();
      return;
    }
    if (this.dialog.isOpen() || this.busy) return;

    // 줄다리기 중, 공 피하기에서 탈락해 구경하는 중에는 걷지 않는다.
    if (!this.miniView?.frozen) this.moveByInput(delta);
    this.updatePlace();
    this.updateTarget();

    // 두 키의 눌림 표시를 함께 지운다.
    const space = Input.Keyboard.JustDown(this.keys.SPACE);
    const e = Input.Keyboard.JustDown(this.keys.E);
    if ((space || e) && this.target && performance.now() - this.dialog.lastClosedAt > REOPEN_GUARD) {
      void this.interact(this.target);
    }
  }

  // ---- 화면 맞추기 ----

  /** CCTV 모드에서는 오른쪽을 CCTV 창이 쓴다. */
  protected reserved(): Reserved {
    const cam = this.cameras.main;
    return {
      // 위쪽 안내는 지도 위에 겹쳐 띄운다(빈 띠를 두지 않는다, U3).
      top: 0,
      bottom: 0,
      right: this.cctv ? Math.max(0, cam.width - this.css(this.cctv.panel.left)) : 0,
    };
  }

  /**
   * 평소에는 내 아바타를 따라간다(맵 밖은 비추지 않는다). CCTV 전체 보기는 고른 구역(views, 고르지 않으면 학교 맵 전체)을 맞추고,
   * 학생을 고르면 그 학생을 내 화면과 같은 배율로 따라간다(그 학생이 가운데에 오게, 맵 밖도 비춘다).
   */
  protected fitCamera() {
    if (!this.cctv) {
      this.followCamera(this.avatar, true);
      return;
    }
    const following = this.cctv.following ? this.remotes.get(this.cctv.following) : undefined;
    const view = this.room.views?.find((v) => v.id === this.cctv?.view);
    if (following) this.followCamera(following.avatar, false);
    else if (view) this.fitRect(view);
    else super.fitCamera();
  }

  /** CCTV 전체 보기에서는 작은 지도 위에서도 학생이 보이게 캐릭터와 글을 따로 키운다. */
  protected remoteScale() {
    if (!this.cctv || this.cctv.following) return { sprite: 1, text: 1 };
    const zoom = this.cameras.main.zoom / this.dpr;
    return { sprite: Math.max(1, size.cctvAvatarZoom / zoom), text: Math.max(1, size.cctvTextZoom / zoom) };
  }

  // ---- 알림: 이야기 카드, 2부 열림, 강당으로 모으기 ----

  /** 미니맵에 2부 문을 표시하기 시작한 때(2부가 열린 것을 본 때) */
  private partOpenedAt = -Infinity;

  /**
   * 학생 화면: 자료에 이야기 카드(intro)가 있으면 자료마다 한 번 띄운다. 2부가 열리거나 강당으로 모으기가 시작되면
   * 화면 가운데 큰 알림을 잠깐 띄운다(선생님 화면에도). 매 프레임 부르고 바뀐 때만 한다.
   */
  private notices() {
    const seen = this.ctx.seen;
    const part = this.net.part;
    const gathering = this.net.gather.left > 0;
    if (seen.part === 0) seen.part = part; // 처음 들어왔을 때는 지금 상태를 알림 없이 받아 둔다.
    if (part > seen.part) {
      seen.part = part;
      this.partOpenedAt = performance.now();
      this.hud.banner('2부가 열렸습니다', '복도 오른쪽 끝의 2부 문이 열렸습니다. 수학실·도서관·옥상 천문대로 갈 수 있습니다.');
    }
    if (gathering !== seen.gathering) {
      seen.gathering = gathering;
      if (gathering) this.hud.banner('강당으로 모입니다', `시간이 되면 모두 강당으로 옮겨 가 골든벨(${this.net.gather.title})을 합니다.`);
    }
    const e = this.net.escape;
    if (this.net.role === 'student' && e.intro && this.ctx.introVersion !== e.version && !this.dialog.isOpen() && !this.busy) {
      this.ctx.introVersion = e.version;
      this.busy = true;
      void this.dialog.story('intro', e.title, e.intro, '시작하기').finally(() => {
        this.busy = false;
      });
    }
  }

  /** 미니맵에 표시할 곳: 강당으로 모으는 중이면 강당, 2부가 막 열렸으면 2부 문. 없으면 null */
  private mapMark() {
    if (this.net.gather.left > 0) return this.room.landmarks?.[0] ?? null;
    if (performance.now() - this.partOpenedAt < motion.mapMarkMs) return this.room.objects.find((o) => o.kind === 'partDoor') ?? null;
    return null;
  }

  // ---- 강당으로 모으기·2부 열기(선생님) ----

  /** 강당으로 모으는 중이면 남은 시간과 안내를 모두에게 보인다. 선생님 단추는 "모으기 그만두기"가 된다. */
  private updateGather() {
    const { left, title } = this.net.gather;
    if (this.net.role === 'teacher') this.hud.setPart(this.net.part);
    if (left === this.gatherShown) return;
    this.gatherShown = left;
    this.hud.setGathering(left > 0);
    this.hud.setNotice(
      left > 0
        ? `강당으로 모입니다 · 남은 시간 ${formatDuration(left * 1000)}\n시간이 되면 모두 강당으로 옮겨 가 골든벨(${title})을 합니다.`
        : null,
    );
  }

  /** 선생님: 전체 공지를 쓰고 보낸다. 보내면 내 화면에도 같은 알림이 뜬다. */
  private onAnnounceButton = () => {
    this.hud.announce.blur();
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    void askAnnounce(this.dialog, this.net).finally(() => {
      this.busy = false;
    });
  };

  private onGoldenBellButton = () => {
    this.hud.goldenbell.blur();
    void (this.net.gather.left > 0 ? this.cancelGather() : this.gather());
  };

  /**
   * 문제 파일과 남은 시간(바로, 1·3·5분)을 고르면 서버가 남은 시간을 모두에게 띄우고,
   * 0이 되면 모두를 골든벨 맵으로 옮긴다(장면은 update()에서 바뀐다).
   */
  private async gather() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const files = await this.net.gbFiles();
      if (!files.length) {
        await this.dialog.message('강당으로 모으기', '문제 파일이 없습니다. 서버의 goldenbell 폴더에 .yaml 파일을 넣습니다.');
        return;
      }
      const picked = await this.dialog.choose(
        '강당으로 모으기',
        '골든벨 문제 파일을 고릅니다.',
        files.map((f) => ({
          label: f.error ? f.file : `${f.title} (${f.count}문제)`,
          detail: f.error ?? f.file,
          disabled: f.error !== null,
        })),
      );
      if (picked === null) return;
      const file = files[picked];
      const when = await this.dialog.choose(
        '강당으로 모으기',
        `${file.title}: 언제 모을지 고릅니다. 남은 시간이 모든 학생 화면에 보이고, 0이 되면 모두 강당(골든벨 맵)으로 옮겨 갑니다.`,
        GATHER_SECONDS.map((sec) => ({ label: sec === 0 ? '지금 바로 옮기기' : `${sec / 60}분 뒤` })),
      );
      if (when === null) return;
      const reply = await this.net.gbGather(file.file, GATHER_SECONDS[when]);
      if (reply.error) await this.dialog.message('강당으로 모으기', reply.error);
    } catch {
      await this.dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private async cancelGather() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const reply = await this.net.gbGatherCancel();
      if (reply.error) await this.dialog.message('강당으로 모으기', reply.error);
    } catch {
      await this.dialog.message('강당으로 모으기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  // ---- 미니게임(선생님) ----

  private onMiniButton = () => {
    this.hud.mini.blur();
    void (this.net.mini?.phase ? this.stopMini() : this.startMini());
  };

  /** 미니게임 고르기 → 확인 → 시작(서버가 3초 센 뒤 시작한다). */
  private async startMini() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const help: Record<MiniKind, string> = {
        treasure: '열린 장소 곳곳에 보물이 나타납니다. 먼저 닿은 학생이 가져갑니다(3분).',
        dodge: '모두 운동장으로 옮겨 굴러오는 공을 피합니다. 맞으면 구경합니다(2분).',
        tug: '반 대항 줄다리기입니다. 이긴 반 학생은 다음 골든벨에서 하트 +1(30초).',
      };
      const picked = await this.dialog.choose(
        '미니게임',
        '할 미니게임을 고릅니다.',
        MINI_KINDS.map((k) => ({ label: MINI_NAMES[k], detail: help[k], icon: `${import.meta.env.BASE_URL}sprites/ui/icon-${MINI_ICON[k]}.png` })),
      );
      if (picked === null) return;
      const kind = MINI_KINDS[picked];
      const sure = await this.dialog.confirm('미니게임', `${MINI_NAMES[kind]}을(를) 시작합니다. 3초 뒤 모든 학생 화면에서 시작합니다.`, '시작하기');
      if (!sure) return;
      const reply = await this.net.miniStart(kind);
      if (reply.error) await this.dialog.message('미니게임', reply.error);
    } catch {
      await this.dialog.message('미니게임', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private async stopMini() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const playing = this.net.mini.phase !== 'result';
      const sure = await this.dialog.confirm(
        '미니게임 그만두기',
        playing ? '지금 하는 미니게임을 결과 없이 그만둡니다.' : '결과 창을 닫습니다.',
        '그만두기',
      );
      if (!sure) return;
      const reply = await this.net.miniStop();
      if (reply.error) await this.dialog.message('미니게임', reply.error);
    } catch {
      await this.dialog.message('미니게임', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private onPartButton = () => {
    this.hud.part.blur();
    void this.openPart2();
  };

  /** 2부 열기. 지금은 서버 상태만 바뀐다(2부 장소의 문은 맵을 넓힐 때 잇는다). */
  private async openPart2() {
    if (this.dialog.isOpen() || this.busy || this.cctv || this.net.part >= 2) return;
    this.busy = true;
    try {
      const sure = await this.dialog.confirm(
        '2부 열기',
        '2부(수학실·도서관·옥상 천문대)를 모든 학생에게 엽니다. 연 뒤에는 다시 닫을 수 없습니다.',
        '2부 열기',
      );
      if (!sure) return;
      const reply = await this.net.openPart(2);
      if (reply.error) await this.dialog.message('2부 열기', reply.error);
    } catch {
      await this.dialog.message('2부 열기', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  // ---- CCTV 모드(선생님) ----

  private onCctvButton = () => {
    // 단추에 남은 포커스 때문에 스페이스바가 단추를 다시 누르지 않게 한다.
    this.hud.cctv.blur();
    this.enterCctv();
  };

  private enterCctv() {
    if (this.cctv || this.dialog.isOpen() || this.busy) return;
    const panel = new CctvPanel(
      {
        pick: (id) => this.follow(id),
        back: () => this.unfollow(),
        close: () => this.exitCctv(),
        view: (id) => this.showView(id),
        sort: () => {
          if (this.cctv) this.cctv.sort = this.cctv.sort === 'class' ? 'progress' : 'class';
        },
      },
      this.touch,
      this.room.views ?? [],
    );
    // 처음에는 학생이 가장 많은 구역을 비춘다(아무도 없으면 맵 전체).
    const counts = this.viewCounts();
    let best: string | null = null;
    let most = 0;
    for (const v of this.room.views ?? []) {
      const n = counts.get(v.id) ?? 0;
      if (n > most) [best, most] = [v.id, n];
    }
    this.cctv = { panel, following: null, view: best, sort: 'class' };
    this.hud.setCctv(true);
    this.joystick?.setHidden(true);
    this.clearTarget();
    this.updateCctv();
    this.fitCamera();
  }

  private exitCctv() {
    if (!this.cctv) return;
    this.cctv.panel.destroy();
    this.cctv = null;
    for (const r of this.remotes.values()) r.avatar.tag?.setVisible(false);
    this.game.canvas.style.cursor = '';
    this.hud.setCctv(false);
    this.joystick?.setHidden(false);
    this.fitCamera();
  }

  /** 구역 보기: 그 구역만 크게 비춘다(null은 맵 전체). 따라가던 학생이 있으면 전체 보기로 돌아온다. */
  private showView(id: string | null) {
    if (!this.cctv) return;
    this.cctv.view = id;
    this.cctv.following = null;
    this.updateCctv();
    this.fitCamera();
  }

  /** 구역마다(null은 전체) 들어 있는 학생 수 */
  private viewCounts() {
    const students = this.net.students(this.mapId);
    const counts = new Map<string | null, number>([[null, students.length]]);
    for (const v of this.room.views ?? []) {
      const n = students.filter(([, p]) => p.col >= v.col && p.col < v.col + v.w && p.row >= v.row && p.row < v.row + v.h).length;
      counts.set(v.id, n);
    }
    return counts;
  }

  private follow(id: string) {
    if (!this.cctv || !this.remotes.has(id)) return;
    this.cctv.following = id;
    this.updateCctv();
    this.fitCamera();
  }

  private unfollow() {
    if (!this.cctv) return;
    this.cctv.following = null;
    this.updateCctv();
    this.fitCamera();
  }

  /** 학생 목록·정보 창과 아바타 위 표시를 서버 상태에 맞춘다. 매 프레임 부르고, 바뀐 글만 고친다. */
  private updateCctv() {
    const cctv = this.cctv;
    if (!cctv) return;
    if (Input.Keyboard.JustDown(this.keys.ESC) && cctv.following) {
      this.unfollow();
      return;
    }
    const now = { part: this.net.part, now: this.net.room.state.now ?? 0 };
    const students = this.net
      .students(this.mapId)
      .map(([id, p]) => describeStudent(this.room, this.net.escape, id, p, now))
      .sort(cctv.sort === 'progress' ? byProgress : byClassAndNickname);
    for (const s of students) {
      const tag = this.remotes.get(s.id)?.avatar.tag;
      if (!tag) continue;
      if (s.tag !== null && tag.text !== s.tag) tag.setText(s.tag);
      tag.setVisible(s.tag !== null);
    }
    cctv.panel.setInfo(this.net.code, students.length, classCounts(students));
    cctv.panel.setSummary(summaryLine(students), students.filter((s) => s.stuck !== null).sort(byProgress), cctv.sort);
    cctv.panel.setViews(cctv.view, this.viewCounts());
    const followed = students.find((s) => s.id === cctv.following);
    if (cctv.following && !followed) {
      // 따라가던 학생이 나갔으면 전체 보기로 돌아간다.
      this.unfollow();
      return;
    }
    if (followed) cctv.panel.showDetail(followed);
    else cctv.panel.showList(students);
  }

  /**
   * 화면 좌표에 있는 학생. 아바타 몸(발에서 머리까지) 안이거나 몸통 가운데에서 pickRadius(화면 픽셀) 안이면 고른다.
   * 여럿이면 앞에 그려진(발이 아래인) 학생, 그다음 몸통 가운데가 가까운 학생
   */
  private pickStudent(screenX: number, screenY: number): string | null {
    const cam = this.cameras.main;
    const p = cam.getWorldPoint(screenX, screenY);
    let best: { id: string; hit: boolean; y: number; d: number } | null = null;
    for (const [id] of this.net.students(this.mapId)) {
      const a = this.remotes.get(id)?.avatar;
      if (!a) continue;
      const d = Math.hypot(p.x - a.x, p.y - (a.y - a.bodyOffset));
      const hit = a.hit(p.x, p.y);
      if (!hit && d > this.css(size.pickRadius) / cam.zoom) continue;
      const better = !best || (hit && !best.hit) || (hit === best.hit && (hit ? a.y > best.y : d < best.d));
      if (better) best = { id, hit, y: a.y, d };
    }
    return best?.id ?? null;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (!this.cctv) return;
    const id = this.pickStudent(pointer.x, pointer.y);
    if (id) this.follow(id);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.cctv) return;
    this.game.canvas.style.cursor = this.pickStudent(pointer.x, pointer.y) ? 'pointer' : '';
  }

  // ---- 살펴보기 ----

  /** 살펴볼 대상을 비운다(강조, 이름표 판, 살펴보기 단추). */
  private clearTarget() {
    if (this.target) this.objectViews.get(this.target.id)?.setNear(false);
    this.target = null;
    this.highlight.clear();
    this.hud.setTarget(null);
  }

  /** 손이 닿는 거리 안에서 가장 가까운, 살펴볼 수 있는 사물 */
  private updateTarget() {
    let best: RoomObject | null = null;
    let bestDist: number = size.reach;
    for (const o of this.room.objects) {
      // 연 문은 지나가는 길이므로 살펴볼 대상에서 뺀다.
      if (!this.canLook(o)) continue;
      const nx = Math.max(o.col, Math.min(this.pos.col, o.col + o.w));
      const ny = Math.max(o.row, Math.min(this.pos.row, o.row + o.h));
      const d = Math.hypot(this.pos.col - nx, this.pos.row - ny);
      if (d <= bestDist) {
        best = o;
        bestDist = d;
      }
    }
    if (best === this.target) return;
    // 가까이 온 사물은 "!" 대신 "이름 · 살펴보기" 판을 보인다.
    if (this.target) this.objectViews.get(this.target.id)?.setNear(false);
    if (best) this.objectViews.get(best.id)?.setNear(true);
    this.target = best;
    this.highlight.clear();
    if (best) {
      const t = size.tile;
      this.highlight
        .lineStyle(size.highlightLine, color.highlight, 1)
        .strokeRect(best.col * t, best.row * t, best.w * t, best.h * t);
    }
    this.hud.setTarget(best ? this.nameOf(best) : null);
  }

  private onActionButton = () => {
    if (this.target && !this.dialog.isOpen() && !this.busy) void this.interact(this.target);
  };

  /** 미션을 단 사물을 살펴본다. 서버가 단서·문제를 보내고, 답을 채점한다. */
  private async interact(o: RoomObject) {
    if (!o.mission) return;
    const name = this.nameOf(o);
    this.busy = true;
    this.setActivity('look', o.id);
    this.dialog.setSubject(o);
    let reward: MissionReward | null = null;
    /** 답을 서버에 내고 맞았는지 받는다(맞으면 얻은 것을 reward에 둔다). */
    const check = async (answer: string) => {
      const reply = await this.net.missionAnswer(o.id, answer);
      if (reply.error) return reply.error;
      reward = reply.reward;
      return reply.correct || (reply.clue ? { clue: reply.clue } : false);
    };
    try {
      const view = await this.net.missionOpen(o.id);
      switch (view.kind) {
        case 'none':
        case 'locked':
        case 'done':
          await this.dialog.message(name, view.text);
          break;
        case 'clue': {
          // 단서·줍기·가져다주기는 글과 얻은 것을 보상 카드 한 장에. 줍기는 글이 없으면 "○○을(를) 주웠습니다."이고 얻은 물건 줄을 따로 두지 않는다.
          const r = view.reward;
          const text = view.text || (r.picked && r.item ? `${r.item}${objectParticle(r.item)} 주웠습니다.` : '');
          await this.reward(o, r, text, r.picked);
          break;
        }
        case 'quiz':
          this.setActivity('quiz', o.id);
          if ((await this.dialog.quiz(name, view, check)) && reward) await this.reward(o, reward, '맞았습니다.');
          break;
        case 'code':
          this.setActivity('quiz', o.id);
          if ((await this.dialog.code(name, view.text, view.digits, view.example, check, view.clue)) && reward) {
            await this.reward(o, reward, '번호가 맞았습니다.');
          }
          break;
        case 'order':
          await this.order(o, name, view);
          break;
      }
    } catch {
      await this.dialog.message(name, '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 살펴봅니다.');
    } finally {
      this.busy = false;
      this.setActivity('', '');
      this.dialog.setSubject(null);
    }
  }

  /** 지금 하는 일. 서버로는 tick()에서 보낸다. */
  private setActivity(kind: ActivityKind, object: string) {
    this.state.activity = { kind, object };
  }

  /**
   * 순서 맞추기 사물: 살펴보면 글과 지금 순서만 보이고, "누르기"를 눌러야 순서에 든다(살펴보기만으로는 순서가 바뀌지 않는다).
   * 이미 맞게 누른 사물이면 몇째로 눌렀는지만 알린다.
   */
  private async order(o: RoomObject, name: string, view: { text: string; step: number; total: number; pressedAt: number }) {
    const lead = view.text ? `${view.text}\n\n` : '';
    if (view.pressedAt) {
      await this.dialog.message(name, `${lead}이 사물은 ${view.pressedAt}번째로 눌렀습니다. (순서 ${view.step}/${view.total})`);
      return;
    }
    const press = await this.dialog.confirm(name, `${lead}지금 순서 ${view.step}/${view.total}. 차례가 맞으면 누릅니다.`, '누르기', '닫기', true);
    if (!press) return;
    const r = await this.net.missionPress(o.id);
    if (r.error) await this.dialog.message(name, r.error);
    else if (r.reward) await this.reward(o, r.reward, '순서를 모두 맞혔습니다.');
    else if (!r.wrong) await this.dialog.message(name, `눌렀습니다. 순서 ${r.step}/${r.total}`);
    else await this.dialog.message(name, `순서가 맞지 않습니다. 처음부터 다시 합니다. (순서 0/${r.total})`);
  }

  /**
   * 미션을 마치고 얻은 것을 보상 카드 한 장으로 알린다: 맞음(또는 단서 글) + 얻은 것(문 열림, 아이템, 보너스 하트) + 이어지는 글 + 힌트 카드.
   * 끝 지점(교문)이면 그 뒤 1부 완료 장면을 띄운다. skipItem이면 얻은 물건 줄을 넣지 않는다(줍기: 글이 이미 알린다).
   */
  private async reward(o: RoomObject, r: MissionReward, lead: string, skipItem = false) {
    const name = this.nameOf(o);
    // 서버가 바꾼 진행(연 문, 물건)이 오기 전에 화면을 먼저 맞추지 않는다. 문 모양은 syncEscape()가 맞춘다.
    if (r.picked || r.opened) {
      if (r.picked) this.objectViews.get(o.id)?.setHidden(true);
      else this.objectViews.get(o.id)?.setOpen(true);
      this.clearTarget();
    }
    const gains: string[] = [];
    if (r.opened) gains.push(`${name}${objectParticle(name)} 열었습니다. 지나갈 수 있습니다.`);
    if (r.item && !skipItem) gains.push(`${r.item}${objectParticle(r.item)} 얻었습니다.`);
    if (r.bonus) gains.push('보너스 미션을 마쳤습니다. 다음 골든벨을 하트 하나 더 들고 시작합니다.');
    // 끝 지점(교문)은 따로 카드를 띄우지 않고 1부 완료 장면에 그 글(맞았습니다가 아닌 자료의 글)을 앞에 붙인다.
    const onlyLead = r.finished && !gains.length && !r.after && !r.hint;
    if (!onlyLead && (lead || gains.length || r.after || r.hint)) {
      await this.dialog.reward({ title: name, lead, gains, after: r.after, hint: r.hint });
    }
    if (r.finished) await this.finishPart(onlyLead && !/맞았습니다\.$/.test(lead) ? lead : '');
  }

  // ---- 미니맵 ----

  /** 큰 지도를 연다(여는 동안은 걷지 않는다). */
  private async openMap() {
    if (this.dialog.isOpen() || this.busy) return;
    const cols = this.room.layout[0].length;
    await this.dialog.map('학교 지도', (width) => {
      const canvas = document.createElement('canvas');
      drawMinimap(canvas, this.room, Math.min(width, minimap.bigWidth) / cols, this.net.part, this.pos, true, this.mapMark());
      return canvas;
    });
  }

  // ---- 힌트 수첩·방탈출 자료 ----

  private onNotebookButton = () => {
    this.hud.notebook.blur();
    void this.openNotebook();
  };

  private async openNotebook() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const cards = await this.net.myHints();
      await this.dialog.notebook(cards, this.net.escape.hintTotal);
    } catch {
      await this.dialog.message('힌트 수첩', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  private onEscapeFileButton = () => {
    this.hud.escapeFile.blur();
    void this.pickEscapeFile();
  };

  /** 선생님: 방탈출 자료 파일을 고른다. 고르면 모든 사람의 방탈출 진행이 처음으로 돌아간다. */
  private async pickEscapeFile() {
    if (this.dialog.isOpen() || this.busy || this.cctv) return;
    this.busy = true;
    try {
      const files = await this.net.escapeFiles();
      if (!files.length) {
        await this.dialog.message('방탈출 자료', '자료 파일이 없습니다. 서버의 escape 폴더에 .yaml 파일을 넣습니다.');
        return;
      }
      const now = this.net.escape;
      const picked = await this.dialog.choose(
        '방탈출 자료',
        now.file
          ? `지금 자료: ${now.title}. 다른 자료를 고르면 모든 학생의 방탈출 진행(가진 물건, 마친 미션, 힌트 카드)이 처음으로 돌아갑니다.`
          : '이 방에서 쓸 방탈출 자료(미션, 문제, 힌트 카드)를 고릅니다. 나중에 "방탈출 자료" 단추로 바꿀 수 있습니다.',
        files.map((f) => ({
          label: f.error ? f.file : `${f.title} (미션 ${f.missions}개, 힌트 카드 ${f.hints}장)`,
          detail: f.error ?? (f.file === now.file ? `${f.file} · 지금 쓰는 자료(다시 골라도 바뀌지 않습니다)` : f.file),
          disabled: f.error !== null,
        })),
      );
      if (picked === null) return;
      const file = files[picked];
      // 지금 쓰는 자료를 다시 고르면 아무 일도 하지 않는다(진행이 지워지지 않게).
      if (file.file === now.file) return;
      if (now.file) {
        const sure = await this.dialog.confirm(
          '방탈출 자료 바꾸기',
          `"${file.title}"(으)로 바꿉니다. 모든 학생의 방탈출 진행(가진 물건, 마친 미션, 힌트 카드)이 지워지고 처음으로 돌아갑니다.`,
          '바꾸기',
        );
        if (!sure) return;
      }
      const reply = await this.net.escapeLoad(file.file);
      if (reply.error) await this.dialog.message('방탈출 자료', reply.error);
    } catch {
      await this.dialog.message('방탈출 자료', '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 누릅니다.');
    } finally {
      this.busy = false;
    }
  }

  /** 끝 지점(교문)을 마쳤을 때: 1부 완료와 걸린 시간을 알린다. 진행은 그대로 두고 계속 돌아다닌다. */
  private async finishPart(lead = '') {
    this.state.finishedAt ??= performance.now();
    const time = formatDuration(this.state.elapsedMs());
    await this.dialog.story(
      'finish',
      '1부 완료',
      `${lead ? `${lead}\n` : ''}${this.state.nickname}님이 1부를 마쳤습니다.\n걸린 시간: ${time}\n선생님이 2부를 열 때까지 학교를 둘러보며 남은 미션과 힌트 카드를 모을 수 있습니다.`,
    );
  }
}
