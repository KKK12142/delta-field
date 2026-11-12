// 맵 위 이름표 판: 어두운 도트 판(ui/panel-dark, 내 것은 노란 안테 ui/tag-me) 9-slice 위에 Galmuri9 흰 글자.
// 사물 "이름 · 살펴보기"와 캐릭터 닉네임에 쓴다. 판은 도트 단위로 만들고 dotScale배로 그린다(docs/art.md "UI 그림").
// 묶음(Container)의 (0, 0)은 판의 가운데 아래다.
import { GameObjects, type Scene } from 'phaser';
import { color, fontFamilySmall, size } from '../theme';

export type PlateSkin = 'dark' | 'me';

const TEXTURE: Record<PlateSkin, string> = { dark: 'ui/panel-dark', me: 'ui/tag-me' };

export class Plate extends GameObjects.Container {
  readonly label: GameObjects.Text;
  private readonly bg: GameObjects.NineSlice | GameObjects.Rectangle;

  constructor(scene: Scene, text: string, skin: PlateSkin = 'dark') {
    super(scene, 0, 0);
    const d = size.dotScale;
    const s = size.plateSlice;
    // 그림이 없으면(불러오지 못함) 반투명 네모로 대신한다.
    this.bg = scene.textures.exists(TEXTURE[skin])
      ? scene.add.nineslice(0, 0, TEXTURE[skin], undefined, 2 * s + 2, 2 * s + 2, s, s, s, s).setOrigin(0.5, 1).setScale(d)
      : scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, 0, text, { fontFamily: fontFamilySmall, fontSize: size.plateFont, color: color.plateText, resolution: size.textResolution })
      .setOrigin(0.5, 1);
    this.add([this.bg, this.label]);
    this.fit();
  }

  get text() {
    return this.label.text;
  }

  setText(text: string) {
    if (this.label.text === text) return this;
    this.label.setText(text);
    this.fit();
    return this;
  }

  /** 판 높이(픽셀, 키운 배율 빼고) */
  get plateHeight() {
    return this.bg.displayHeight;
  }

  /** 글자에 맞춰 판 크기를 고친다(도트 단위로 올림). */
  private fit() {
    const d = size.dotScale;
    const w = Math.ceil(this.label.width / d) + 2 * size.platePadX;
    const h = Math.ceil(this.label.height / d) + 2 * size.platePadY;
    if (this.bg instanceof GameObjects.NineSlice) this.bg.setSize(w, h);
    else this.bg.setSize(w * d, h * d);
    this.label.setY(-size.platePadY * d);
  }
}
