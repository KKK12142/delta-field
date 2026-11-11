// 캐릭터 아바타. 캐릭터 시트(public/sprites/characters/<id>.png, 4줄×3칸, 규격은 docs/art.md)를 방향·걷기에 맞춰 그린다.
// 그림자, 캐릭터, 닉네임, 머리 위 짧은 글(CCTV의 지금 하는 일, 골든벨 목숨)을 한 묶음(Container)으로 다룬다.
// 묶음의 (x, y)는 발 위치이고, 깊이(아래쪽이 앞)도 발 y로 정한다.
import { GameObjects, Textures, type Scene } from 'phaser';
import characters from '../data/characters.json';
import { DEFAULT_CHARACTER } from '../../shared/protocol.ts';
import { alpha, color, fontFamily, motion, size } from '../theme';

/** 아바타 위 짧은 글의 모양: CCTV에서 지금 하는 일, 골든벨에서 목숨 */
export type TagStyle = 'cctv' | 'lives';

/** 바라보는 방향. 값은 시트의 줄 번호 */
const ROWS = { down: 0, left: 1, right: 2, up: 3 } as const;
type Facing = keyof typeof ROWS;
/** 한 줄의 칸: 0 걸음 A, 1 서기, 2 걸음 B */
const COLS = 3;
const STAND = 1;

export const CHARACTER_IDS: readonly string[] = characters.map((c) => c.id);

/** 캐릭터 시트 주소(public/ 아래). 첫 화면의 캐릭터 고르기도 쓴다. */
export function characterSheet(id: string) {
  return `${import.meta.env.BASE_URL}sprites/characters/${id}.png`;
}

/** 시트를 불러오게 건다(장면의 preload에서). 이미 불러온 것은 건너뛴다. */
export function loadCharacters(scene: Scene) {
  for (const id of CHARACTER_IDS) {
    if (scene.textures.exists(id)) continue;
    scene.load.spritesheet(id, characterSheet(id), { frameWidth: size.charFrameWidth, frameHeight: size.charFrameHeight });
  }
}

/** 불러온 시트에 도트가 흐려지지 않게 NEAREST를 걸고, 방향별 걷기 애니메이션을 만든다(게임 전체에서 한 번). */
export function prepareCharacters(scene: Scene) {
  for (const id of CHARACTER_IDS) {
    if (!scene.textures.exists(id)) continue;
    scene.textures.get(id).setFilter(Textures.FilterMode.NEAREST);
    for (const [facing, row] of Object.entries(ROWS)) {
      const key = walkKey(id, facing as Facing);
      if (scene.anims.exists(key)) continue;
      // 걸음 A → 서기 → 걸음 B → 서기
      const frames = [0, STAND, 2, STAND].map((c) => ({ key: id, frame: row * COLS + c }));
      scene.anims.create({ key, frames, frameRate: motion.walkFps, repeat: -1 });
    }
  }
}

const walkKey = (id: string, facing: Facing) => `${id}-walk-${facing}`;

export class Avatar extends GameObjects.Container {
  readonly sprite: GameObjects.Sprite;
  readonly nameText: GameObjects.Text;
  /** 닉네임 위의 짧은 글(감춰 둔 채로 만든다). tagStyle이 없으면 null */
  readonly tag: GameObjects.Text | null;
  private readonly shadow: GameObjects.Ellipse;
  private readonly character: string;
  private facing: Facing = 'down';
  private walking = false;
  /** 캐릭터와 글을 키운 배율(CCTV 전체 보기) */
  private markScale = { sprite: 1, text: 1 };

  constructor(scene: Scene, character: string, nickname: string, nameColor: string, tagStyle: TagStyle | null = null) {
    super(scene, 0, 0);
    this.character = scene.textures.exists(character) ? character : DEFAULT_CHARACTER;
    this.shadow = scene.add.ellipse(0, 0, size.avatarShadowWidth, size.avatarShadowHeight, color.avatarShadow, alpha.avatarShadow);
    this.sprite = scene.add.sprite(0, 0, this.character, STAND).setOrigin(0.5, 1).setScale(size.charScale);
    this.nameText = scene.add
      .text(0, 0, nickname, { fontFamily, fontSize: size.nicknameFont, color: nameColor, resolution: size.textResolution })
      .setOrigin(0.5, 1);
    this.tag = null;
    if (tagStyle) {
      // CCTV 글은 어두운 바탕에 흰 글, 목숨(하트)은 바탕 없이 테두리만 두른다.
      const style: Phaser.Types.GameObjects.Text.TextStyle =
        tagStyle === 'lives'
          ? { fontSize: size.livesFont, color: color.livesText, stroke: color.livesStroke, strokeThickness: size.livesStroke }
          : { fontSize: size.tagFont, color: color.tagText, backgroundColor: color.tagBackground };
      this.tag = scene.add
        .text(0, 0, '', { fontFamily, padding: { x: size.tagPadX, y: size.tagPadY }, resolution: size.textResolution, ...style })
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    this.add([this.shadow, this.sprite, this.nameText, ...(this.tag ? [this.tag] : [])]);
    this.layout();
    scene.add.existing(this);
  }

  /** 발에서 몸통 가운데까지(픽셀, 키운 배율 포함) */
  get bodyOffset() {
    return (size.avatarHeight / 2) * this.markScale.sprite;
  }

  /**
   * 이번 프레임에 움직인 방향(dx, dy)과 걷는 중인지를 알려 준다. 방향이 있으면 그쪽을 보고,
   * 걸으면 그 방향의 걷기 애니메이션, 멈추면 그 방향의 서기 프레임을 보인다.
   */
  step(dx: number, dy: number, walking: boolean) {
    const facing = facingOf(dx, dy, this.facing);
    if (facing === this.facing && walking === this.walking) return;
    this.facing = facing;
    this.walking = walking;
    if (walking) this.sprite.play(walkKey(this.character, facing));
    else this.sprite.stop().setFrame(ROWS[facing] * COLS + STAND);
  }

  /** 확인용: 캐릭터, 걷기 애니메이션(멈췄으면 null), 프레임 번호 */
  look() {
    const anim = this.sprite.anims.isPlaying ? (this.sprite.anims.currentAnim?.key ?? null) : null;
    return { character: this.character, anim, frame: Number(this.sprite.frame.name) };
  }

  /** 작은 지도(CCTV 전체 보기)에서도 보이게 캐릭터와 글을 따로 키운다. 1이면 원래 크기 */
  setMarkScale(sprite: number, text: number) {
    if (sprite === this.markScale.sprite && text === this.markScale.text) return;
    this.markScale = { sprite, text };
    this.layout();
  }

  /** 월드 좌표 (x, y)가 캐릭터 몸(발에서 머리까지의 네모) 안인지 */
  hit(x: number, y: number) {
    const s = this.markScale.sprite;
    return Math.abs(x - this.x) <= (size.avatarHitWidth / 2) * s && y <= this.y && y >= this.y - size.avatarHeight * s;
  }

  private layout() {
    const { sprite: s, text: t } = this.markScale;
    this.shadow.setScale(s);
    this.sprite.setScale(size.charScale * s);
    this.nameText.setScale(t).setY(-size.avatarHeight * s - size.nicknameGap * t);
    this.tag?.setScale(t).setY(this.nameText.y - this.nameText.height * t - size.tagGap * t);
  }
}

/** 움직인 방향으로 바라볼 쪽. 대각선에 가까우면 지금 보는 쪽을 지켜 깜빡이지 않게 한다. 움직이지 않으면 그대로 */
function facingOf(dx: number, dy: number, current: Facing): Facing {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1e-6 && ay < 1e-6) return current;
  const horizontal: Facing = dx < 0 ? 'left' : 'right';
  const vertical: Facing = dy < 0 ? 'up' : 'down';
  if (current === horizontal && ax >= ay * motion.facingKeep) return current;
  if (current === vertical && ay >= ax * motion.facingKeep) return current;
  return ax > ay ? horizontal : vertical;
}
