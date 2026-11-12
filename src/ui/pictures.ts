// HTML 화면에 넣는 도트 그림: 캐릭터 얼굴, 가진 물건 아이콘, 살펴본 사물 그림.
import { DEFAULT_CHARACTER } from '../../shared/protocol.ts';
import school from '../data/school.json';
import { uiSize } from '../theme';
import { el } from './dom';

/** public/sprites/<폴더>에 있는 그림 이름(빌드할 때 훑는다. 새 그림을 넣으면 화면 개발 서버를 새로 고친다) */
const names = (paths: Record<string, unknown>, dir: string) =>
  new Set(Object.keys(paths).map((p) => p.replace(`/public/sprites/${dir}/`, '').replace(/\.png$/, '')));
const ICONS = names(import.meta.glob('/public/sprites/icons/*.png'), 'icons');
const OBJECTS = names(import.meta.glob('/public/sprites/objects/*.png'), 'objects');
const FACES = names(import.meta.glob('/public/sprites/faces/*.png'), 'faces');
const sprite = (dir: string, name: string) => `${import.meta.env.BASE_URL}sprites/${dir}/${name}.png`;

/** 캐릭터 얼굴(public/sprites/faces/<캐릭터>.png, 30×26을 2배. 크기는 theme uiSize.face*). character가 비면 빈 얼굴 칸 */
export function face(character: string, className = '') {
  const node = el('span', `df-face ${className}`.trim());
  setFace(node, character);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** 얼굴 칸의 캐릭터를 바꾼다. */
export function setFace(node: HTMLElement, character: string) {
  const id = FACES.has(character) ? character : DEFAULT_CHARACTER;
  node.style.backgroundImage = character ? `url("${sprite('faces', id)}")` : '';
}

/** 작은 그림 하나(public/sprites/ui 등). 꾸밈이라 읽어 주지 않는다. 크기는 CSS(클래스)가 정한다. */
export function uiIcon(dir: string, name: string, className: string) {
  const img = el('img', className);
  img.src = sprite(dir, name);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/** 반 상징(public/sprites/ui/emblem-<반 id>.png) */
export function emblem(classGroup: string) {
  return uiIcon('ui', `emblem-${classGroup}`, 'df-emblem');
}

interface Pictured {
  name: string;
  kind: string;
  sprite?: string;
}
const objects = school.objects as Pictured[];

/**
 * 가진 물건 이름의 아이콘(public/sprites/icons). 방탈출 자료는 아이템을 이름으로만 알려 주므로
 * 같은 이름으로 바닥에 놓인 물건(kind: item)의 그림 이름으로 찾는다. 없으면 null(글자로 보인다).
 */
export function itemIcon(name: string): string | null {
  const o = objects.find((x) => x.kind === 'item' && x.name === name && x.sprite && ICONS.has(x.sprite));
  return o?.sprite ? sprite('icons', o.sprite) : ICONS.has(name) ? sprite('icons', name) : null;
}

/** 사물 그림(public/sprites/objects/<sprite가 있으면 sprite, 없으면 kind>.png). 없으면 null */
export function objectPicture(o: Pictured): string | null {
  if (o.sprite && OBJECTS.has(o.sprite)) return sprite('objects', o.sprite);
  return OBJECTS.has(o.kind) ? sprite('objects', o.kind) : null;
}

/** 도트 그림을 정수 배(2배, 안 들어가면 1배, 그래도 크면 1/2배)로 넣는 img. 틀 크기는 theme uiSize.picture* */
export function pixelImage(src: string, className: string) {
  const img = el('img', className);
  img.alt = '';
  img.addEventListener('load', () => {
    const maxW = parseFloat(uiSize.pictureMaxWidth);
    const maxH = parseFloat(uiSize.pictureMaxHeight);
    const scale = [2, 1, 0.5].find((s) => img.naturalWidth * s <= maxW && img.naturalHeight * s <= maxH) ?? 0.5;
    img.style.width = `${img.naturalWidth * scale}px`;
    img.style.height = `${img.naturalHeight * scale}px`;
  });
  img.src = src;
  return img;
}
