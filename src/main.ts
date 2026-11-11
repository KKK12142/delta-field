import { AUTO, Game, Scale } from 'phaser';
import classroom from './data/classroom.json';
import { loadRoom } from './data/room';
import { RunState } from './game/state';
import { connect, joinErrorText } from './net/connection';
import { RoomScene, type RoomSceneData } from './scenes/RoomScene';
import { applyCssTheme, color } from './theme';
import { Dialog } from './ui/dialog';
import { isTouchDevice } from './ui/dom';
import { askEntry } from './ui/start';
import './ui/ui.css';

applyCssTheme();

const room = loadRoom(classroom);
const net = await askEntry(connect, joinErrorText);
const dialog = new Dialog();

// 다시 붙기를 끝내 못 하면 처음 화면으로 돌아가게 한다.
net.onStatus((status) => {
  if (status !== 'closed') return;
  void dialog
    .message('연결이 끊겼습니다', '서버와 연결이 끊겼습니다. 다시 들어가기를 누르면 처음 화면으로 갑니다.', '다시 들어가기')
    .then(() => location.reload());
});

const data: RoomSceneData = {
  room,
  state: new RunState(net.nickname),
  dialog,
  touch: isTouchDevice(),
  net,
};

const game = new Game({
  type: AUTO,
  parent: 'game',
  backgroundColor: color.background,
  scale: { mode: Scale.RESIZE, width: '100%', height: '100%' },
});
game.scene.add('room', RoomScene, true, data);
