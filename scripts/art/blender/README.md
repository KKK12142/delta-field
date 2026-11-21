# 3D 동물 캐릭터 만들기(Blender 스크립트)

`animal.py`가 `animals/<이름>.json`을 읽어 Blender(5.2.4)에서 모델과 동작을 만들고 GLB로 내보낸다. 손으로 고치지 않고 JSON과 스크립트를 고쳐 다시 만든다.

```sh
blender -b --factory-startup --python scripts/art/blender/animal.py -- scripts/art/blender/animals/cat.json
# 확인 렌더(Cycles, 앞·3/4·옆과 idle·walk·jump·wave 대표 장면)까지
blender -b --factory-startup --python scripts/art/blender/animal.py -- scripts/art/blender/animals/cat.json --render <폴더> [--samples 64] [--size 512]
```

나오는 것: `public/models/animals/<이름>.glb`(`--out`으로 바꿀 수 있다). 끝에 파일 크기와 삼각형 수를 찍는다.

## 모델 구조
- 물체: `<이름>`(가만) > `pivot`(점프·찌그러짐) > `leg_l`·`leg_r`, `body` > `head`·`arm_l`·`arm_r`·`tail`. 뼈대(스키닝)는 없다.
- 부위마다 메시 하나, 재질 하나(`soft`, 꼭짓점 색 `Color` → glTF `COLOR_0`). 텍스처와 UV는 없다.
- 키 1.0, 발바닥 0, 원점은 발 사이. Blender에서는 z 위·앞 -y로 만들고, 내보내면 three.js 기준 y 위·앞 +z가 된다.
- 동작(three.js 클립 이름): `idle` 2초, `walk` 1초(두 걸음), `jump` 1.25초, `wave` 1.33초. 모든 클립에 8개 물체의 위치·회전·크기 24개 트랙이 다 들어 있어
  클립을 바꿔도 앞 클립의 자세가 남지 않는다. 처음과 끝 자세가 같아 반복해도 끊기지 않는다.

## JSON 형식(좌표는 Blender, 단위는 키 1.0 기준)
- `colors`: 이름 → `#rrggbb`(sRGB). 아래 `color`는 여기 이름을 쓴다.
- `head`·`muzzle`·`body`·`belly`: 타원체 `center`, `radius`(x,y,z), `color`. muzzle(입 둘레)은 head에, belly(배)는 body에 겹쳐 앞으로 튀어나온 부분만 보인다.
- `ears`: `shape`(지금은 `cone`), 오른쪽 귀의 밑면 `base`, 방향 `axis`, `radius`·`height`·`tip`(끝 반지름), `flat`(앞뒤 납작함), `inner`(안쪽 귀: `color`, `scale`, `forward`, `down`). 왼쪽은 x를 뒤집는다.
- `arms`: 오른쪽 어깨 `shoulder`(회전 중심), 어깨에서 팔 가운데까지 `offset`, `radius`, 벌림 `spread`(도).
- `legs`: 오른쪽 엉덩이 `hip`, `offset`, `radius`, 발 `foot`(`offset`, `radius`, `color`).
- `tail`: 밑동 `base`(회전 중심), 베지어 조절점 4개 `points`, 굵기 `radius`(밑동, 끝), `rings`·`sides`, 길이 비율 구간 색 `bands`.
- `decals`: 눈·코·입·볼·줄무늬. `part`(붙일 메시: head·body), `on`(표면을 잴 타원체), `u`(앞에서 오른쪽(+x)으로 도), `v`(위로 도),
  `size`(가로, 세로, 두께), `roll`(법선을 축으로 돌림, 도), `lift`(표면에서 띄움: 눈 위 반짝임 등), `color`.
