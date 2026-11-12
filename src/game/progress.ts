// 방탈출 진행을 글로 적는다(힌트 수첩 단추, 장소의 미션 수, CCTV의 진행). 서버가 맞춰 준 상태와 방 데이터만 쓴다.
import type { Escape, Player } from '../../shared/schema.ts';
import { areaAt, partOf, type Room } from '../data/room';

/** 힌트 카드 수를 부마다: "1부 3/8 · 2부 0/8". 카드가 한 부에만 있으면 "3/8" */
export function hintSummary(escape: Escape, hints: readonly string[]): string {
  const parts = new Map<number, { got: number; total: number }>();
  escape.hintParts.forEach((part, id) => {
    const p = parts.get(part) ?? { got: 0, total: 0 };
    p.total += 1;
    if (hints.includes(id)) p.got += 1;
    parts.set(part, p);
  });
  if (parts.size <= 1) return `${hints.length}/${escape.hintTotal}`;
  return [...parts]
    .sort((a, b) => a[0] - b[0])
    .map(([part, p]) => `${part}부 ${p.got}/${p.total}`)
    .join(' · ');
}

/** 자료 파일에 있는 미션(보너스 미션 빼고)과 그 미션 사물이 놓인 장소 id, 부 */
function missionPlaces(room: Room, escape: Escape) {
  const places = new Map<string, { area: string; part: number }>();
  for (const o of room.objects) {
    if (!o.mission || places.has(o.mission) || !escape.missions.includes(o.mission) || escape.bonus.includes(o.mission)) continue;
    places.set(o.mission, { area: areaAt(room, o.col + o.w / 2, o.row + o.h / 2)?.id ?? '', part: partOf(room, o) });
  }
  return places;
}

/** 이 장소의 미션: 마친 수와 모두(보너스 빼고). 장소에 미션이 없으면 null */
export function areaMissions(room: Room, escape: Escape, done: readonly string[], areaId: string) {
  const ids = [...missionPlaces(room, escape)].filter(([, p]) => p.area === areaId).map(([id]) => id);
  if (!ids.length) return null;
  return { done: ids.filter((id) => done.includes(id)).length, total: ids.length };
}

/** 열린 부까지의 미션(보너스 빼고): 마친 수와 모두. CCTV의 진행과 정렬에 쓴다. */
export function openMissions(room: Room, escape: Escape, p: Player, part: number) {
  const ids = [...missionPlaces(room, escape)].filter(([, m]) => m.part <= part).map(([id]) => id);
  return { done: ids.filter((id) => p.done.includes(id)).length, total: ids.length };
}
