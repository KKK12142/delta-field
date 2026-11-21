// 3D 캐릭터: Kenney Mini Characters(CC0, public/models/mini-characters/)의 GLB를 캐릭터마다 한 번 읽고,
// 사람마다 SkeletonUtils.clone으로 뼈대를 나눠 만든다(모양·재질은 함께 쓴다). 캐릭터 id → 모델은 src/data/characters.json의 model.
// 한 사람 = 발 위치 묶음(root) 안에 몸(모델, 바라보는 쪽으로 돈다), 발밑 원 그림자, (나만) 발밑 고리, 머리 위 닉네임 판.
import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import characters from '../data/characters.json';
import { DEFAULT_CHARACTER } from '../../shared/protocol.ts';
import { color, fontFamilySmall, three } from '../theme';

const MODEL_DIR = `${import.meta.env.BASE_URL}models/mini-characters/`;
const MODEL_OF = new Map(characters.map((c) => [c.id, c.model]));

interface Template {
  scene: Object3D;
  idle: AnimationClip | undefined;
  walk: AnimationClip | undefined;
  /** charHeight에 맞추는 배율 */
  scale: number;
}

/** 모델을 한 번씩만 읽어 두고, 모두가 함께 쓰는 모양(그림자·고리)과 재질을 갖는다. */
export class ModelBank {
  private readonly loader = new GLTFLoader();
  private readonly loads = new Map<string, Promise<Template>>();
  /** 모든 모델이 같은 색표 그림(Textures/colormap.png)을 쓰므로 재질 하나를 함께 쓴다. 빛 계산이 싼 Lambert로 바꾼다. */
  private material: MeshLambertMaterial | null = null;
  readonly shadowGeometry = new CircleGeometry(three.shadowRadius, 20).rotateX(-Math.PI / 2);
  readonly shadowMaterial = new MeshBasicMaterial({
    color: three.shadowColor,
    transparent: true,
    opacity: three.shadowOpacity,
    depthWrite: false,
  });
  readonly ringGeometry = new RingGeometry(three.meRingInner, three.meRingOuter, 32).rotateX(-Math.PI / 2);
  readonly ringMaterial = new MeshBasicMaterial({ color: color.meMark, depthWrite: false });

  template(characterId: string): Promise<Template> {
    const model = MODEL_OF.get(characterId) ?? MODEL_OF.get(DEFAULT_CHARACTER) ?? 'male-e';
    let load = this.loads.get(model);
    if (!load) {
      load = this.loader.loadAsync(`${MODEL_DIR}character-${model}.glb`).then((gltf) => {
        const scene = gltf.scene;
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          const own = mesh.material as Material & { map?: Texture | null };
          if (!this.material) this.material = new MeshLambertMaterial({ map: own.map ?? null });
          if (own.map && own.map !== this.material.map) own.map.dispose();
          if (own !== this.material) own.dispose();
          mesh.material = this.material;
        });
        const box = new Box3().setFromObject(scene, true);
        const height = box.max.y - box.min.y;
        return {
          scene,
          idle: gltf.animations.find((a) => a.name === 'idle'),
          walk: gltf.animations.find((a) => a.name === 'walk'),
          scale: height > 0 ? three.charHeight / height : 1,
        };
      });
      this.loads.set(model, load);
    }
    return load;
  }
}

/** 머리 위 닉네임 판(캔버스 그림 한 장). 글꼴은 main.ts가 화면을 띄우기 전에 읽어 둔다. */
function nameTag(text: string, me: boolean) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('닉네임 판을 그리지 못했습니다.');
  const font = `${three.tagFont}px ${fontFamilySmall}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + three.tagPadX * 2;
  const h = three.tagFont + three.tagPadY * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = three.tagBackground;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, three.tagPadY);
  ctx.fill();
  ctx.fillStyle = me ? three.tagMeText : three.tagText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  // 판은 늘 캐릭터와 벽 위에 보이게 깊이를 따지지 않고 맨 나중에 그린다.
  const material = new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new Sprite(material);
  sprite.center.set(0.5, 0);
  sprite.scale.set((three.tagHeight * w) / h, three.tagHeight, 1);
  sprite.position.y = three.charHeight + three.tagGap;
  sprite.renderOrder = me ? 2 : 1;
  return { sprite, texture, material };
}

/** 한 사람의 3D 캐릭터. root의 위치가 발 위치(x = col, z = row)다. */
export class Character {
  readonly root = new Group();
  private readonly body = new Group();
  private readonly tag: ReturnType<typeof nameTag>;
  private mixer: AnimationMixer | null = null;
  private idle: AnimationAction | null = null;
  private walk: AnimationAction | null = null;
  private walking = false;
  private yaw = 0;
  private targetYaw = 0;
  private disposed = false;

  constructor(
    bank: ModelBank,
    readonly characterId: string,
    nickname: string,
    me: boolean,
  ) {
    const shadow = new Mesh(bank.shadowGeometry, bank.shadowMaterial);
    shadow.position.y = 0.01;
    shadow.renderOrder = -1;
    this.root.add(shadow, this.body);
    if (me) {
      const ring = new Mesh(bank.ringGeometry, bank.ringMaterial);
      ring.position.y = 0.012;
      ring.renderOrder = -1;
      this.root.add(ring);
    }
    this.tag = nameTag(nickname, me);
    this.root.add(this.tag.sprite);
    void bank.template(characterId).then((t) => this.attach(t));
  }

  private attach(t: Template) {
    if (this.disposed) return;
    const model = cloneSkinned(t.scene);
    model.scale.setScalar(t.scale);
    this.body.add(model);
    this.mixer = new AnimationMixer(model);
    this.idle = t.idle ? this.mixer.clipAction(t.idle) : null;
    this.walk = t.walk ? this.mixer.clipAction(t.walk) : null;
    if (this.walk) this.walk.timeScale = three.walkTimeScale;
    (this.walking ? this.walk : this.idle)?.play();
  }

  /** 바라볼 쪽(바닥 평면의 dx, dz)과 걷는지를 정한다. 방향이 0이면 보던 쪽을 그대로 본다. */
  setMotion(dx: number, dz: number, walking: boolean) {
    if (dx !== 0 || dz !== 0) this.targetYaw = Math.atan2(dx, dz);
    if (walking === this.walking) return;
    this.walking = walking;
    const from = walking ? this.idle : this.walk;
    const to = walking ? this.walk : this.idle;
    if (!to) return;
    to.reset().play();
    if (from) to.crossFadeFrom(from, three.walkFade, false);
  }

  /** 매 프레임: 도는 것과 동작을 dt(ms)만큼 나아가게 한다. */
  update(dt: number) {
    let diff = this.targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt / three.turnSmoothing));
    this.body.rotation.y = this.yaw;
    this.mixer?.update(dt / 1000);
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    this.tag.texture.dispose();
    this.tag.material.dispose();
  }
}
