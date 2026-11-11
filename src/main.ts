import { AUTO, Game, Scale } from 'phaser';
import type { MapId } from '../shared/protocol.ts';
import school from './data/school.json';
import goldenbell from './data/goldenbell.json';
import { loadRoom } from './data/room';
import { RunState } from './game/state';
import { connect, joinErrorText } from './net/connection';
import { GoldenBellScene } from './scenes/GoldenBellScene';
import type { MapContext } from './scenes/MapScene';
import { RoomScene } from './scenes/RoomScene';
import { applyCssTheme, color } from './theme';
import { Dialog } from './ui/dialog';
import { isTouchDevice } from './ui/dom';
import { askEntry } from './ui/start';
import './ui/ui.css';

applyCssTheme();

const rooms: Record<MapId, ReturnType<typeof loadRoom>> = {
  school: loadRoom(school),
  goldenbell: loadRoom(goldenbell),
};
const net = await askEntry(connect, joinErrorText);
const dialog = new Dialog();

// 다시 붙기를 끝내 못 하면 처음 화면으로 돌아가게 한다.
net.onStatus((status) => {
  if (status !== 'closed') return;
  void dialog
    .message('연결이 끊겼습니다', '서버와 연결이 끊겼습니다. 다시 들어가기를 누르면 처음 화면으로 갑니다.', '다시 들어가기')
    .then(() => location.reload());
});

const ctx: MapContext = {
  rooms,
  state: new RunState(net.nickname),
  dialog,
  touch: isTouchDevice(),
  net,
  schoolPos: null,
};

const game = new Game({
  type: AUTO,
  parent: 'game',
  backgroundColor: color.background,
  scale: { mode: Scale.RESIZE, width: '100%', height: '100%' },
});
// 골든벨을 하는 중에 들어왔으면 골든벨 맵에서 시작한다.
const first: MapId = net.me()?.map === 'goldenbell' ? 'goldenbell' : 'school';
game.scene.add('school', RoomScene, first === 'school', ctx);
game.scene.add('goldenbell', GoldenBellScene, first === 'goldenbell', ctx);
