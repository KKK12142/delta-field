import { AUTO, Game, Scale } from 'phaser';
import { FieldScene } from './scenes/FieldScene';
import { color } from './theme';

new Game({
  type: AUTO,
  parent: 'game',
  backgroundColor: color.background,
  scale: { mode: Scale.RESIZE, width: '100%', height: '100%' },
  scene: [FieldScene],
});
