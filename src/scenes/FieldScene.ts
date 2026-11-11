import { Scene } from 'phaser';
import { type Point, tileCorners, toScreen } from '../iso';
import { color } from '../theme';

const COLS = 12;
const ROWS = 12;
const SPEED = 4; // 칸/초

export class FieldScene extends Scene {
  private pos = { col: COLS / 2, row: ROWS / 2 };
  private avatar!: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('field');
  }

  create() {
    const ground = this.add.graphics();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        ground.fillStyle((col + row) % 2 === 0 ? color.tile : color.tileAlt, 1);
        ground.lineStyle(1, color.tileLine, 0.6);
        tracePolygon(ground, tileCorners(col, row));
        ground.fillPath();
        ground.strokePath();
      }
    }

    const shadow = this.add.ellipse(0, 0, 28, 12, color.avatarShadow, 0.18);
    const body = this.add.ellipse(0, -18, 24, 32, color.avatar);
    this.avatar = this.add.container(0, 0, [shadow, body]);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 쓸 수 없습니다.');
    this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.add
      .text(16, 16, '방향키나 WASD로 움직입니다.', { color: color.text, fontSize: '18px' })
      .setScrollFactor(0);

    this.centerCamera();
    this.scale.on('resize', () => this.centerCamera());
    this.placeAvatar();
  }

  private centerCamera() {
    const c = toScreen((COLS - 1) / 2, (ROWS - 1) / 2);
    this.cameras.main.centerOn(c.x, c.y);
  }

  update(_time: number, delta: number) {
    const k = this.keys;
    const dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    const dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    const step = (SPEED * delta) / 1000;
    this.pos.col = clamp(this.pos.col + dx * step, 0, COLS - 1);
    this.pos.row = clamp(this.pos.row + dy * step, 0, ROWS - 1);
    this.placeAvatar();
  }

  private placeAvatar() {
    const p = toScreen(this.pos.col, this.pos.row);
    this.avatar.setPosition(p.x, p.y);
    this.avatar.setDepth(p.y);
  }
}

function tracePolygon(g: Phaser.GameObjects.Graphics, points: Point[]) {
  g.beginPath();
  points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
  g.closePath();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
