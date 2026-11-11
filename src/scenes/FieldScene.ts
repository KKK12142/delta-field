import { Scene } from 'phaser';
import { toScreen } from '../grid';
import { alpha, color, size } from '../theme';

const COLS = 12;
const ROWS = 12;
const SPEED = 4; // 칸/초

export class FieldScene extends Scene {
  private pos = { col: (COLS - 1) / 2, row: (ROWS - 1) / 2 };
  private avatar!: Phaser.GameObjects.Container;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('field');
  }

  create() {
    const ground = this.add.graphics();
    ground.lineStyle(size.tileLine, color.tileLine, alpha.tileLine);
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * size.tile;
        const y = row * size.tile;
        ground.fillStyle((col + row) % 2 === 0 ? color.tile : color.tileAlt, 1);
        ground.fillRect(x, y, size.tile, size.tile);
        ground.strokeRect(x, y, size.tile, size.tile);
      }
    }

    // 발밑 그림자를 칸 좌표에 두고, 몸은 그 위로 세워 그린다.
    const shadow = this.add.ellipse(
      0,
      0,
      size.avatarShadowWidth,
      size.avatarShadowHeight,
      color.avatarShadow,
      alpha.avatarShadow,
    );
    const body = this.add.ellipse(0, -size.avatarHeight / 2, size.avatarWidth, size.avatarHeight, color.avatar);
    this.avatar = this.add.container(0, 0, [shadow, body]);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 쓸 수 없습니다.');
    this.keys = keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.add
      .text(size.hintMargin, size.hintMargin, '방향키나 WASD로 움직입니다.', {
        color: color.text,
        fontSize: size.hintFont,
      })
      .setScrollFactor(0);

    this.centerCamera();
    this.scale.on('resize', () => this.centerCamera());
    this.placeAvatar();
  }

  private centerCamera() {
    this.cameras.main.centerOn((COLS * size.tile) / 2, (ROWS * size.tile) / 2);
  }

  update(_time: number, delta: number) {
    const k = this.keys;
    let dx = (k.RIGHT.isDown || k.D.isDown ? 1 : 0) - (k.LEFT.isDown || k.A.isDown ? 1 : 0);
    let dy = (k.DOWN.isDown || k.S.isDown ? 1 : 0) - (k.UP.isDown || k.W.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    // 대각선으로 갈 때도 같은 빠르기가 되게 한다.
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const step = (SPEED * delta) / 1000;
    this.pos.col = clamp(this.pos.col + dx * step, 0, COLS - 1);
    this.pos.row = clamp(this.pos.row + dy * step, 0, ROWS - 1);
    this.placeAvatar();
  }

  private placeAvatar() {
    const p = toScreen(this.pos.col, this.pos.row);
    this.avatar.setPosition(p.x, p.y);
    // 아래쪽에 있는 것이 앞에 보이게 한다.
    this.avatar.setDepth(p.y);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
