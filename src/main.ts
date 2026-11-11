import { AUTO, Game, Scale } from 'phaser';
import classroom from './data/classroom.json';
import { loadRoom } from './data/room';
import { RunState } from './game/state';
import { RoomScene, type RoomSceneData } from './scenes/RoomScene';
import { applyCssTheme, color } from './theme';
import { Dialog } from './ui/dialog';
import { isTouchDevice } from './ui/dom';
import { askNickname } from './ui/start';
import './ui/ui.css';

applyCssTheme();

const room = loadRoom(classroom);
const nickname = await askNickname();

const data: RoomSceneData = {
  room,
  state: new RunState(nickname),
  dialog: new Dialog(),
  touch: isTouchDevice(),
};

const game = new Game({
  type: AUTO,
  parent: 'game',
  backgroundColor: color.background,
  scale: { mode: Scale.RESIZE, width: '100%', height: '100%' },
});
game.scene.add('room', RoomScene, true, data);
