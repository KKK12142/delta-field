// 3D 화면의 맵 규칙: 사물이 보이는지·막는지와 발밑 충돌. 2D(MapScene.free, RoomScene.objectBlocks)와 같은 규칙을 따른다.
// 미니게임: 보물찾기 중에는 열린 부의 문을 모두 연다(2D와 같다). 공 피하기 운동장 울타리는 minigame3d.ts(MapMode.allows).
import { DOOR_KINDS } from '../../shared/escape.ts';
import type { MapId } from '../../shared/protocol.ts';
import { isFloor, partOf, type Room, type RoomObject } from '../data/room';
import type { Net } from '../net/connection';
import { size } from '../theme';
import { playingMini } from './minigame3d';

/** 사물의 모습: 서 있음(막음), 열림(연 문, 지나감), 감춤(주운 물건, 열리지 않은 2부 사물) */
export type ObjectLook = 'shown' | 'open' | 'hidden';

const isDoor = (o: RoomObject) => (DOOR_KINDS as readonly string[]).includes(o.kind);

export class MapRules {
  constructor(
    readonly mapId: MapId,
    readonly room: Room,
    private readonly net: Net,
  ) {}

  private hasDone(mission: string) {
    return this.net.me()?.done.includes(mission) ?? false;
  }

  /** 학교 맵만 방탈출 진행에 따라 문이 열리고 사물이 감춰진다. 다른 맵의 사물은 늘 서 있다. */
  look(o: RoomObject): ObjectLook {
    // 골든벨 구역 판(pad-*)은 goldenbell3d.ts가 구역 이름 그림으로 그린다(문제마다 보이고 감춘다).
    if (this.mapId === 'goldenbell' && o.id.startsWith('pad-')) return 'hidden';
    if (this.mapId !== 'school') return 'shown';
    const part = this.net.part;
    if (isDoor(o)) {
      if (partOf(this.room, o) > part) return 'shown';
      // 보물찾기 중(세기 포함)에는 열린 부의 문을 모두 연다(방탈출 진행과 따로).
      if (playingMini(this.net) === 'treasure') return 'open';
      if (!o.mission || !this.net.escape.doors.includes(o.mission)) return 'open';
      return this.hasDone(o.mission) ? 'open' : 'shown';
    }
    const picked = !!o.mission && this.net.escape.pickups.includes(o.mission) && this.hasDone(o.mission);
    if (picked || (o.part ?? 1) > part) return 'hidden';
    return 'shown';
  }

  /** 발밑 네모(반경 avatarFeet)가 벽과 막는 사물에 닿지 않는지 */
  free(col: number, row: number, looks: readonly ObjectLook[]) {
    const r = size.avatarFeet;
    return (
      !this.blocked(col - r, row - r, looks) &&
      !this.blocked(col + r, row - r, looks) &&
      !this.blocked(col - r, row + r, looks) &&
      !this.blocked(col + r, row + r, looks)
    );
  }

  private blocked(col: number, row: number, looks: readonly ObjectLook[]) {
    if (!isFloor(this.room.layout[Math.floor(row)]?.[Math.floor(col)])) return true;
    const objects = this.room.objects;
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      if (o.walk || looks[i] !== 'shown') continue;
      if (col >= o.col && col < o.col + o.w && row >= o.row && row < o.row + o.h) return true;
    }
    return false;
  }

  /** 여럿이 한 점에 겹쳐 나타나지 않게 시작 위치 둘레의 빈 곳을 고른다. */
  spawnPoint(looks: readonly ObjectLook[]) {
    const { col, row } = this.room.start;
    for (let i = 0; i < 30; i++) {
      const c = col + (Math.random() * 2 - 1) * size.spawnSpread;
      const r = row + (Math.random() * 2 - 1) * size.spawnSpread;
      if (this.free(c, r, looks)) return { col: c, row: r };
    }
    return { col, row };
  }
}
