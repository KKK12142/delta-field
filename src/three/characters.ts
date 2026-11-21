// 3D 캐릭터. 모델 묶음은 theme.three.characterSet(주소의 ?chars=kenney로 바꿔 볼 수 있음):
// - animal: 동물 모델(public/models/animals/<characters.json의 animal>.glb). 뼈대 없이 부위 물체에 키프레임 동작이 있어
//   사람마다 일반 clone(모양·재질 함께 씀)에 AnimationMixer를 단다. 재질은 꼭짓점 색을 쓰는 Lambert(반짝이는 재질은 Phong) 하나씩을 모두 함께 쓴다.
// - kenney: Kenney Mini Characters(CC0, public/models/mini-characters/character-<characters.json의 model>.glb). 뼈대가 있어 SkeletonUtils.clone.
// 모델은 파일마다 한 번만 읽는다. 키는 theme.three.charHeight에 맞추고 발바닥을 y = 0에 둔다. 얼굴은 +Z를 본다.
// 한 사람 = 발 위치 묶음(root) 안에 몸(모델, 바라보는 쪽으로 돈다), 발밑 원 그림자, (나만) 발밑 고리, 머리 위 닉네임 판.
import {
  AnimationMixer,
  Box3,
  CanvasTexture,
  CircleGeometry,
  Group,
  LinearFilter,
  LoopOnce,
  NearestFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
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

type CharacterSet = 'animal' | 'kenney';
const MODEL_DIR = `${import.meta.env.BASE_URL}models/`;
/** 이번 화면에서 쓰는 모델 묶음 */
export const characterSet: CharacterSet =
  new URLSearchParams(location.search).get('chars') === 'kenney' ? 'kenney' : three.characterSet;
const CHARACTER_OF = new Map(characters.map((c) => [c.id, c]));

/** 캐릭터 id → 읽을 GLB 주소 */
function modelUrl(characterId: string) {
  const c = CHARACTER_OF.get(characterId) ?? CHARACTER_OF.get(DEFAULT_CHARACTER) ?? characters[0];
  return characterSet === 'animal' ? `${MODEL_DIR}animals/${c.animal}.glb` : `${MODEL_DIR}mini-characters/character-${c.model}.glb`;
}

interface Template {
  scene: Object3D;
  /** 이름 → 동작(idle·walk, 동물은 jump·wave도) */
  clips: Map<string, AnimationClip>;
  /** charHeight에 맞추는 배율 */
  scale: number;
  /** 배율을 곱한 뒤 발바닥을 y = 0에 두려고 올리는 높이 */
  lift: number;
}

/** 모델을 한 번씩만 읽어 두고, 모두가 함께 쓰는 모양(그림자·고리)과 재질을 갖는다. */
export class ModelBank {
  private readonly loader = new GLTFLoader();
  private readonly loads = new Map<string, Promise<Template>>();
  /** Kenney: 모든 모델이 같은 색표 그림(Textures/colormap.png)을 쓰므로 재질 하나를 함께 쓴다. 빛 계산이 싼 Lambert로 바꾼다. */
  private kenneyMaterial: MeshLambertMaterial | null = null;
  /** 동물: 꼭짓점 색 재질. 보통(털)과 반짝이(눈·코) 두 가지를 모든 동물이 함께 쓴다. */
  private readonly animalMatte = new MeshLambertMaterial({ vertexColors: true });
  private readonly animalGloss = new MeshPhongMaterial({ vertexColors: true, shininess: three.glossShininess });
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
    const url = modelUrl(characterId);
    let load = this.loads.get(url);
    if (!load) {
      load = this.loader.loadAsync(url).then((gltf) => {
        const scene = gltf.scene;
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          const own = mesh.material as Material & { map?: Texture | null; clearcoat?: number; roughness?: number };
          let shared: Material;
          if (characterSet === 'animal') {
            // GLB의 반짝이 재질(clearcoat가 있거나 거칠기가 낮음)은 Phong, 나머지는 Lambert.
            shared = (own.clearcoat ?? 0) > 0 || (own.roughness ?? 1) < 0.5 ? this.animalGloss : this.animalMatte;
          } else {
            if (!this.kenneyMaterial) this.kenneyMaterial = new MeshLambertMaterial({ map: own.map ?? null });
            if (own.map && own.map !== this.kenneyMaterial.map) own.map.dispose();
            shared = this.kenneyMaterial;
          }
          if (own !== shared) own.dispose();
          mesh.material = shared;
        });
        const box = new Box3().setFromObject(scene, true);
        const height = box.max.y - box.min.y;
        const scale = height > 0 ? three.charHeight / height : 1;
        return {
          scene,
          clips: new Map(gltf.animations.map((a) => [a.name, a])),
          scale,
          lift: -box.min.y * scale,
        };
      });
      this.loads.set(url, load);
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

/** 골든벨 목숨 아이콘(2D와 같은 그림: public/sprites/ui/heart·heart-empty·skull). 한 번만 읽는다. */
const LIVES_ICONS = { '♥': 'heart', '♡': 'heart-empty', '💀': 'skull' } as const;
let livesImages: Promise<Map<string, HTMLImageElement>> | null = null;
function loadLivesImages() {
  livesImages ??= Promise.all(
    Object.entries(LIVES_ICONS).map(
      ([ch, name]) =>
        new Promise<[string, HTMLImageElement]>((done) => {
          const img = new Image();
          img.onload = img.onerror = () => done([ch, img]);
          img.src = `${import.meta.env.BASE_URL}sprites/ui/${name}.png`;
        }),
    ),
  ).then((list) => new Map(list));
  return livesImages;
}
/** 아이콘 하나의 칸(도트). 그림은 9×8·9×9라 9×9 칸에 아래를 맞춰 그린다. */
const ICON_DOTS = 9;

/**
 * 머리 위 목숨 줄(♥♥♡, 탈락이면 💀💀). 캔버스 한 장(가장 많은 목숨 GB_MAX_LIVES 칸)에 가운데 맞춰 그리고 도트가 번지지 않게 NearestFilter로 보인다.
 * 이름표 아래(머리 위)에 놓는다.
 */
class LivesRow {
  private readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  readonly material: SpriteMaterial;
  readonly sprite: Sprite;
  private text = '';

  constructor(me: boolean) {
    const n = three.livesMax;
    this.canvas.width = (n * ICON_DOTS + (n - 1) * three.livesIconGap) * three.livesDotPx;
    this.canvas.height = ICON_DOTS * three.livesDotPx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.material = new SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, transparent: true });
    this.sprite = new Sprite(this.material);
    this.sprite.center.set(0.5, 0);
    this.sprite.scale.set((three.livesHeight * this.canvas.width) / this.canvas.height, three.livesHeight, 1);
    this.sprite.position.y = three.charHeight + three.tagGap;
    this.sprite.renderOrder = me ? 2 : 1;
    this.sprite.visible = false;
  }

  /** 지금 보이는 글(확인용) */
  get shown() {
    return this.sprite.visible ? this.text : null;
  }

  /** 받은 글(♥·♡·💀) 그대로 아이콘을 늘어놓는다. 글이 같으면 다시 그리지 않는다. */
  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    void loadLivesImages().then((images) => {
      if (text !== this.text) return;
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      const icons = [...text].map((ch) => images.get(ch)).filter((img): img is HTMLImageElement => !!img && img.width > 0);
      const d = three.livesDotPx;
      const gap = three.livesIconGap;
      const width = icons.reduce((a, img) => a + img.width, 0) + gap * Math.max(0, icons.length - 1);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = false;
      let x = Math.round((this.canvas.width / d - width) / 2);
      for (const img of icons) {
        ctx.drawImage(img, x * d, (ICON_DOTS - img.height) * d, img.width * d, img.height * d);
        x += img.width + gap;
      }
      this.texture.needsUpdate = true;
    });
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
  }
}

/** 한 사람의 3D 캐릭터. root의 위치가 발 위치(x = col, z = row)다. */
export class Character {
  readonly root = new Group();
  /** 몸(모델을 담고 바라보는 쪽으로 돈다) */
  readonly body = new Group();
  private readonly tag: ReturnType<typeof nameTag>;
  private readonly shadow: Mesh;
  private lives: LivesRow | null = null;
  private readonly me: boolean;
  /** 모델의 메시와 함께 쓰는 재질(흐리게 할 때 이 캐릭터만의 재질로 바꿨다가 돌려놓는다) */
  private readonly shared = new Map<Mesh, Material>();
  /** 흐리게 할 때 쓰는 이 캐릭터만의 재질(함께 쓰는 재질 → 복사본). 처음 흐려질 때 만든다. */
  private own: Map<Material, Material> | null = null;
  private opacity = 1;
  private mixer: AnimationMixer | null = null;
  private clips = new Map<string, AnimationClip>();
  private idle: AnimationAction | null = null;
  private walk: AnimationAction | null = null;
  /** 한 번 하는 동작(jump·wave) 중이면 그 동작 */
  private once: AnimationAction | null = null;
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
    this.me = me;
    const shadow = new Mesh(bank.shadowGeometry, bank.shadowMaterial);
    shadow.position.y = 0.01;
    shadow.renderOrder = -1;
    this.shadow = shadow;
    this.shared.set(shadow, bank.shadowMaterial);
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
    // 뼈대가 있으면 뼈대를 새로 만들어야 해서 SkeletonUtils.clone, 없으면 일반 clone(모양·재질은 그대로 함께 씀).
    const model = characterSet === 'kenney' ? cloneSkinned(t.scene) : t.scene.clone();
    model.scale.setScalar(t.scale);
    model.position.y = t.lift;
    this.body.add(model);
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) this.shared.set(mesh, mesh.material as Material);
    });
    if (this.opacity < 1) this.applyOpacity();
    this.mixer = new AnimationMixer(model);
    this.clips = t.clips;
    const idle = t.clips.get('idle');
    const walk = t.clips.get('walk');
    this.idle = idle ? this.mixer.clipAction(idle) : null;
    this.walk = walk ? this.mixer.clipAction(walk) : null;
    if (this.walk) this.walk.timeScale = three.walkTimeScale[characterSet] ?? 1;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.once) return;
      this.once = null;
      const base = this.base();
      if (base) {
        base.reset().play();
        base.crossFadeFrom(e.action, three.actFade, false);
      }
    });
    this.base()?.play();
  }

  /** 지금 서기·걷기 가운데 써야 할 동작 */
  private base() {
    return this.walking ? this.walk : this.idle;
  }

  /** 바라볼 쪽(바닥 평면의 dx, dz)과 걷는지를 정한다. 방향이 0이면 보던 쪽을 그대로 본다. */
  setMotion(dx: number, dz: number, walking: boolean) {
    if (dx !== 0 || dz !== 0) this.targetYaw = Math.atan2(dx, dz);
    if (walking === this.walking) return;
    this.walking = walking;
    // 걷기 시작하면 한 번 하는 동작은 그만둔다(동작 중에 서 있다가 멈춘 것은 그대로 둔다).
    if (this.once && walking) {
      const from = this.once;
      this.once = null;
      this.walk?.reset().play();
      if (this.walk) this.walk.crossFadeFrom(from, three.actFade, false);
      return;
    }
    if (this.once) return;
    const from = walking ? this.idle : this.walk;
    const to = walking ? this.walk : this.idle;
    if (!to) return;
    to.reset().play();
    if (from) to.crossFadeFrom(from, three.walkFade, false);
  }

  /** 한 번 하는 동작(jump·wave)을 틀고, 끝나면 서기·걷기로 돌아온다. 그 동작이 없으면 false. */
  act(name: string) {
    const clip = this.clips.get(name);
    if (!this.mixer || !clip || name === 'idle' || name === 'walk') return false;
    const action = this.mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true; // 끝 장면에 멈춰 있다가 서기·걷기로 섞여 돌아온다(바로 끄면 한 프레임 처음 자세가 보인다)
    const from = this.once ?? this.base();
    action.reset().play();
    if (from && from !== action) action.crossFadeFrom(from, three.actFade, false);
    this.once = action;
    return true;
  }

  /** 지금 도는 동작 이름(가장 크게 섞인 것). 개발 확인용. */
  action() {
    if (this.once) return this.once.getClip().name;
    return this.base()?.getClip().name ?? null;
  }

  /** 매 프레임: 도는 것과 동작을 dt(ms)만큼 나아가게 한다. */
  update(dt: number) {
    let diff = this.targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt / three.turnSmoothing));
    this.body.rotation.y = this.yaw;
    this.mixer?.update(dt / 1000);
  }

  /** 지금 몸이 보는 쪽(라디안, atan2(dx, dz)). 개발 확인용. */
  facing() {
    return this.yaw;
  }

  /**
   * 머리 위 목숨 줄(골든벨, ♥·♡·💀 글). null이면 감춘다. 보이면 이름표를 그 위로 올린다.
   */
  setLives(text: string | null) {
    if (text === null) {
      if (this.lives) this.lives.sprite.visible = false;
    } else {
      if (!this.lives) {
        this.lives = new LivesRow(this.me);
        this.lives.material.opacity = this.opacity;
        this.root.add(this.lives.sprite);
      }
      this.lives.set(text);
      this.lives.sprite.visible = true;
    }
    const raised = this.lives?.sprite.visible ?? false;
    this.tag.sprite.position.y = three.charHeight + three.tagGap + (raised ? three.livesHeight + three.livesGap : 0);
  }

  /**
   * 몸(모델·그림자·이름표·목숨 줄)의 투명도 0~1. 1이면 함께 쓰는 재질로 돌려놓고, 1보다 작으면 이 캐릭터만의 재질 복사본을 흐리게 한다.
   * 0이면 감춘다. 내 발밑 고리는 흐리게 하지 않는다.
   */
  setOpacity(a: number) {
    const v = Math.max(0, Math.min(1, a));
    if (v === this.opacity) return;
    this.opacity = v;
    this.root.visible = v > 0;
    this.applyOpacity();
  }

  /** 머리 위 목숨 글(확인용, 감췄으면 null) */
  get livesText() {
    return this.lives?.shown ?? null;
  }

  /** 지금 투명도(확인용) */
  get shownOpacity() {
    return this.root.visible ? this.opacity : 0;
  }

  private applyOpacity() {
    const fade = this.opacity < 1;
    if (fade) this.own ??= new Map();
    for (const [mesh, shared] of this.shared) {
      if (!fade || !this.own) {
        mesh.material = shared;
        continue;
      }
      let own = this.own.get(shared);
      if (!own) {
        own = shared.clone();
        own.transparent = true;
        this.own.set(shared, own);
      }
      // 그림자는 처음부터 반투명이라 처음 투명도에 곱한다.
      own.opacity = mesh === this.shadow ? three.shadowOpacity * this.opacity : this.opacity;
      mesh.material = own;
    }
    this.tag.material.opacity = this.opacity;
    if (this.lives) this.lives.material.opacity = this.opacity;
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    this.tag.texture.dispose();
    this.tag.material.dispose();
    this.lives?.dispose();
    for (const m of this.own?.values() ?? []) m.dispose();
  }
}
