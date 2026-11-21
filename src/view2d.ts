// Phaser 2D 화면(학교 맵·골든벨 장면)을 띄운다. main.ts가 첫 화면과 연결을 마친 뒤 부른다(?view=3d가 아닐 때).
import { AUTO, Game, Scale } from 'phaser';
import type { MapId } from '../shared/protocol.ts';
import school from './data/school.json';
import goldenbell from './data/goldenbell.json';
import { loadRoom } from './data/room';
import { RunState } from './game/state';
import type { Net } from './net/connection';
import { GoldenBellScene } from './scenes/GoldenBellScene';
import type { MapContext } from './scenes/MapScene';
import { RoomScene } from './scenes/RoomScene';
import { renderRatio, showRenderInfo } from './render';
import { color } from './theme';
import type { Dialog } from './ui/dialog';
import { isTouchDevice } from './ui/dom';

export function start2d({ net, dialog, resumed }: { net: Net; dialog: Dialog; resumed: boolean }) {
  const rooms: Record<MapId, ReturnType<typeof loadRoom>> = {
    school: loadRoom(school),
    goldenbell: loadRoom(goldenbell),
  };
  const ctx: MapContext = {
    rooms,
    state: new RunState(net.nickname),
    dialog,
    touch: isTouchDevice(),
    net,
    schoolPos: null,
    askedEscape: false,
    introVersion: -1,
    seen: { part: 0, gathering: false },
  };
  const mine = net.me();
  if (resumed && mine?.map === 'school') ctx.schoolPos = { col: mine.col, row: mine.row };
  // 이어 하기면 이미 본 이야기 카드(intro)는 다시 띄우지 않는다.
  if (resumed) ctx.introVersion = net.escape.version;

  // 화면을 그리는 방식은 src/render.ts(주소의 ?render=). 게임 크기를 화면(CSS) 크기×비율로 잡고,
  // Phaser의 zoom(1/비율)으로 캔버스를 화면 크기로 줄여 보인다. 그래서 장면 안의 픽셀은 캔버스 픽셀이다(MapScene.css()).
  // dpr 방식이면 레티나 화면에서도 도트 하나가 기기 픽셀 정수로 그려지게 확대 배율을 맞출 수 있다(MapScene.viewZoom()).
  const gameParent = document.getElementById('game');
  if (!gameParent) throw new Error('화면 요소 #game을 찾지 못했습니다.');
  const canvasSize = () => {
    const w = gameParent.clientWidth;
    const h = gameParent.clientHeight;
    const ratio = renderRatio(w, h);
    return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)), zoom: 1 / ratio };
  };
  const initial = canvasSize();
  const game = new Game({
    type: AUTO,
    parent: gameParent,
    backgroundColor: color.background,
    scale: { mode: Scale.NONE, width: initial.width, height: initial.height, zoom: initial.zoom },
  });
  // 창 크기나 DPR(브라우저 확대·다른 화면으로 옮김)이 바뀌면 다시 맞춘다. 장면은 scale의 resize 이벤트로 카메라를 맞춘다.
  const fitGame = () => {
    const { width, height, zoom } = canvasSize();
    if (game.scale.zoom !== zoom) game.scale.setZoom(zoom);
    if (game.scale.width !== width || game.scale.height !== height) game.scale.resize(width, height);
  };
  new ResizeObserver(fitGame).observe(gameParent);
  window.addEventListener('resize', fitGame);
  showRenderInfo(game);
  // 골든벨을 하는 중에 들어왔으면 골든벨 맵에서 시작한다.
  const first: MapId = net.me()?.map === 'goldenbell' ? 'goldenbell' : 'school';
  game.scene.add('school', RoomScene, first === 'school', ctx);
  game.scene.add('goldenbell', GoldenBellScene, first === 'goldenbell', ctx);
}
