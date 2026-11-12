# Delta Field 그림

그림(캐릭터, 타일, 사물, 아이콘)의 규격과 만드는 과정을 적는다. 정하지 않은 것은 맨 아래에 모은다.

## 정한 것
- 교사(2026-11-11)
  - 도트(픽셀) 그림으로 한다.
  - 학생은 첫 화면에서 캐릭터 6~8가지 가운데 하나를 고른다. 나중에 Delta Science 업적 포인트로 꾸미기(머리·옷 등)를 더한다.
  - 그림 생성은 BAZE(게이트웨이)에 API 키로 GPT 이미지 생성을 불러서 하고, 생성 그림을 바탕으로 쓴다.
  - 실제 인물이나 기존 게임의 캐릭터·그림을 따라 하지 않는다.
- 교사(2026-11-11): 캐릭터는 30×60도트, 화면에서 2배(60×120px). 타일·사물도 같은 2배 기준.
  처음에는 한 칸 48px(24도트)였으나 캐릭터가 20%쯤 커 보여, 캐릭터 그림은 그대로 두고 한 칸을 60px(30도트)로 키웠다. 캐릭터는 1×2칸이다.
- 교사(2026-11-12, 화면 진단 뒤): UI는 밝은 종이 도트 테두리(시안 B, 9-slice)로 통일한다. 글꼴은 Galmuri(본문 Galmuri11, 이름표·작은 글 Galmuri9).
  사물 이름표는 가까이 갈 때만 보이고 평소에는 작은 "!" 표시를 띄운다. 장식 소품은 모든 장소에 넣는다(아래 "UI 그림", "글꼴", "장식 소품").
- 대장(잠정): 캐릭터는 네 방향 걷기와 서 있기. 투명 배경 PNG. 파일은 public/sprites/ 아래(Vite가 그대로 내어 줌).

## 규격

### 크기와 배율
- 한 칸은 30×30 도트다. 게임 화면에서 2배(60px, src/theme.ts의 size.tile)로 그린다. 16도트 × 3배(48px) → 24도트 × 2배(48px) → 30도트 × 2배(60px)로 바꿨다(2026-11-11).
- PNG 파일은 1배(도트 1개 = 픽셀 1개)로 저장하고, 게임에서 2배로 키운다. 키울 때는 가장 가까운 픽셀(nearest)로 해서 흐려지지 않게 한다.
  - 까닭: 카메라 확대(따라가기, CCTV 전체 보기는 0.15까지 작아짐)가 늘 곱해지므로 2배로 키운 파일을 써도 선명함은 같고 파일만 4배 커진다.
  - Phaser에서는 그림마다 `texture.setFilter(Phaser.Textures.FilterMode.NEAREST)`를 건다. 게임 설정의 `pixelArt: true`는 닉네임 글자까지 각지게 하므로 쓰지 않는다.
  - 확대가 정수 배가 아니면 도트 폭이 1·2픽셀로 고르지 않게 보인다. 따라가기 화면 확대는 1/2 단위(1, 1.5, 2)로 맞춰
    도트 하나가 정수 픽셀이 되게 한다(맵 담당, theme size.zoomSnap. 지금 값 3은 3배 기준이라 2로 바꿔야 한다).
- 확인용으로 크게 본 그림이 필요하면 `--scale`로 따로 만든다(아래 다듬기).

### 캐릭터
- 프레임 하나는 30×60 도트(가로 1칸, 세로 2칸)다. 화면에서는 2배 60×120px. 교사 결정(2026-11-11): 16×24 → 20×40을 거쳐,
  생성 그림이 키 약 60도트로 나오고 20×40으로 줄이면 얼굴·소품이 뭉개져 30×60으로 바꿨다. 그림은 프레임 높이를 꽉 채우고(머리 꼭대기 0줄, 발 59줄), 가로는 26~30도트 안팎이다.
- 발은 프레임 맨 아래 줄(59)에 닿고, 몸의 가운데는 x = 15다. 게임에서는 프레임 아래 가운데를 아바타의 발 위치에 맞춘다(origin 0.5, 1).
  화면에서 머리 꼭대기는 발 위치보다 120px(2칸) 위, 몸통 가운데는 60px(1칸)쯤 위다(닉네임·머리 위 표시·누르기 범위를 맞출 때 쓴다).
- 비율은 2~2.5등신(머리가 키의 2/5 안팎)이다. 작은 크기에서도 머리 모양과 옷 색으로 서로 알아볼 수 있게 한다.
- 시트 한 장에 4줄 × 3칸, 90×240 픽셀.

  | | 칸 0 | 칸 1 | 칸 2 |
  |---|---|---|---|
  | 줄 0 아래(앞모습) | 걸음 A | 서기 | 걸음 B |
  | 줄 1 왼쪽 | 걸음 A | 서기 | 걸음 B |
  | 줄 2 오른쪽 | 걸음 A | 서기 | 걸음 B |
  | 줄 3 위(뒷모습) | 걸음 A | 서기 | 걸음 B |

  - 프레임 번호 = 줄 × 3 + 칸. Phaser: `this.load.spritesheet('char-01', 'sprites/characters/char-01.png', { frameWidth: 30, frameHeight: 60 })`. 화면에 그릴 때 `setScale(2)`(카메라 확대는 그 위에 곱해진다).
  - 걸음 A는 캐릭터의 왼발이 앞, B는 오른발이 앞이다. 팔은 반대쪽이 앞으로 간다.
  - **걷기 재생(맵 담당용)**: 방향 줄 r(아래 0, 왼쪽 1, 오른쪽 2, 위 3)마다 프레임 `[r*3, r*3+1, r*3+2, r*3+1]`(A → 서기 → B → 서기)을 **초당 8프레임**으로 되풀이한다.
    멈추면 그 방향의 서기 프레임 `r*3+1`. 아바타가 빨리 움직여 발이 미끄러져 보이면 10프레임까지 올린다.
    Phaser 예: `this.anims.create({ key: 'char-01-down', frames: this.anims.generateFrameNumbers('char-01', { frames: [0, 1, 2, 1] }), frameRate: 8, repeat: -1 })`
  - 걸음 프레임의 움직임(walk.mjs make가 만들고 손으로 다듬는다):
    - 몸(다리 위 전부)이 서기보다 1도트 내려간다(두 발이 벌어진 순간이 가장 낮다). 그래서 A·B → 서기로 갈 때 1도트 오르내린다.
    - 앞·뒷모습: 뒤로 간 다리는 발이 2도트 들리고(뒤꿈치), 앞으로 간 다리는 바닥(59줄)에 닿는다. 앞으로 가는 팔은 손이 1도트 올라가고 뒤로 가는 팔은 1도트 내려간다.
    - 옆모습: 두 다리가 엉덩이를 축으로 발끝에서 앞뒤 4칸씩 벌어진다. 먼 쪽 다리는 한 단계 어두운 색이고, 뒤로 간 발은 1도트 들린다.
      보이는 쪽 팔이 어깨를 축으로 손끝에서 3칸 앞뒤로 흔들린다(먼 쪽 팔은 몸에 가려 그리지 않는다).
      팔이 빠진 자리는 몸통 색으로 메운다(이웃이 외곽선이면 그 안쪽 색). 팔이 앞으로 가서 팔 뒤에 메운 칸만 띠로 남는 줄은
      그 띠를 지워 팔의 뒤 외곽선이 몸 윤곽이 되게 한다(2026-11-12, 몸 뒤에 1칸 선처럼 남던 윤곽을 없앰).
  - 2026-11-11: 8명 모두 네 방향 서기와 걷기 12프레임을 넣었다(아래 "걷기 시트 만들기").
  - 오른쪽 줄은 왼쪽 줄을 좌우로 뒤집어 만든다. 그래도 시트에는 네 줄을 모두 둔다(게임 코드에서 뒤집지 않는다).
    좌우가 다른 소품은 오른쪽에서 지운다: 2번 가슴 번개 무늬, 4번 허리 돋보기, 7번 별 머리핀·별 배지(왼쪽 몸에 있어 오른쪽에서는 안 보임).
- 들고 있는 소품은 걸을 때 함께 움직여야 해서 다루기 어렵다. 과학 소품은 몸에 붙은 것(보안경, 목걸이, 주머니)으로 한다.

### 타일
- 바닥 30×30. 같은 바닥의 변형 2~4개를 가로로 이어 한 장으로 둔다(예: 120×30). 이어 붙였을 때 경계가 보이지 않게 한다.
- 벽(`#`)과 울타리(`%`)는 윗면 타일과 앞면 타일로 나눈다. 아래 칸이 바닥인 벽 칸이 앞면 칸이고, 그 칸 전체(30×30)를 앞면 그림으로 그린다(맵 담당 painter.ts의 wall(face)).
  파일은 윗면과 앞면을 따로 둔다(wallTop, wallFace, fenceTop, fenceFace).
- 울타리 윗면은 가로대 방향이 둘이다: fenceTop(가로, 운동장 아래쪽 줄), fenceTopV(세로, 왼쪽·오른쪽 줄). 위아래가 울타리인 칸이 세로다.
- 울타리 앞면(fenceFace)은 위 8줄과 철망 구멍이 투명하다. 그 칸에는 바닥(운동장 흙)을 먼저 깐다.
- 바닥 타일에는 외곽선을 넣지 않는다. 이음선은 바닥보다 한 단계 어두운 색이다.

### 사물
- 가로 = 바닥에서 차지하는 칸 수 × 30. 세로 = 차지하는 칸 수 × 30 + 위로 솟은 높이.
  예: 교탁 2×1칸 → 60×(30 + 솟은 높이). 사물함 1×3칸 → 30×(90 + 솟은 높이).
- 기준점은 차지하는 칸의 왼쪽 아래다. 그리는 순서는 아래 끝이 아래에 있을수록 앞(아바타와 같은 규칙).
- 위에서 조금 비스듬히 본다: 윗면이 보이고 그 아래 앞면이 보인다. 소실점 원근은 쓰지 않는다.
- 그림이 차지 칸보다 좁으면(신발장 115, 교문 116, 실험대 88) 그림 파일 너비는 차지 칸 너비로 두고 양옆을 투명하게 둔다.
- 벽에 거는 사물(칠판·게시판)은 벽 앞면 칸에 놓이는 30줄 높이 그림이다.
- 문(door)·현관문(entrance)은 2칸 두께 벽의 윗면 칸과 앞면 칸을 함께 덮는 60×60이다. 위쪽은 벽 윗면(wallTop) 무늬, 아래 36줄(현관문 38줄)이 문이다.
  문 밑 칸은 바닥 글자이므로, 그림이 두 칸을 다 덮어야 벽이 끊겨 보이지 않는다. 열린 모양은 <kind>-open.png(같은 크기).
- 골대(goalpost)는 위에서 본 그림이고 입이 오른쪽이다(왼쪽 골대). 오른쪽 골대는 좌우로 뒤집어 그린다.

### 아이콘
- 아이템 등은 30×30. 대화상자(HTML)에서 크게 보일 때는 CSS `image-rendering: pixelated`로 키운다.
- 열쇠 아이콘 icons/door-key(교실 문, 빨간 꼬리표)·lab-key(과학실, 파랑)·entrance-key(현관, 초록). 글자판은 art/src/icons/(아래 "장식 소품").

### 그리는 법
- 외곽선 1도트, 어두운 남색 계열(순검정 쓰지 않음). 빛은 왼쪽 위에서. 재질마다 2~3단계 명암. 그라데이션·디더링·흐림 없음.
- 공용 색표(art/src/palette.txt): 캐릭터 8명 앞모습에서 만든 47색. 캐릭터 한 명은 16색 이하. 외곽선(#1d1531·#181641), 흰색, 피부·머리 갈색 등은 여러 캐릭터가 같은 색을 쓴다.
  만드는 법: `pnpm art:palette --out-dir art/work/pal --colors 16 --shared 24 --palette art/src/palette.txt <30×60 그림들>`.
  그림마다 가장 가까운 두 색(차이² × 넓이)을 16색이 될 때까지 묶고, 그림들 사이에서 차이 24 이하인 색을 하나로 맞춘다. 묶을 때 평균을 내지 않고 넓은 쪽 색을 쓴다.
  타일·사물은 이 색표에 가까운 색을 쓰고, 모자라면 더한다.

### 파일 이름과 위치
| 위치 | 내용 | git |
|---|---|---|
| art/raw/<이름>/ | 그림 생성으로 받은 원본과 프롬프트(.json) | 넣지 않음(크고 버리는 것이 많다) |
| art/work/ | 다듬는 중간 그림과 미리보기 | 넣지 않음 |
| art/src/ | 다듬은 그림의 글자판(.txt). 손으로 고치는 원본. tiles/<id>.txt, objects/<kind>.txt. 캐릭터는 char-0N.txt(네 방향 서기), char-0N.sheet.txt(걷기 12프레임), rig.json(걷기 뼈대 고침), palette.txt(공용 색표) | 넣음 |
| public/sprites/characters/char-01.png | 캐릭터 시트 | 넣음 |
| src/data/characters.json | 캐릭터 목록 `[{ id, name }]`. name은 화면 이름(교사가 정하지 않아 주제 이름을 임시로 씀) | 넣음 |
| public/sprites/tiles/<이름>.png | 바닥·벽. 이름은 맵의 바닥·벽 이름과 같게(classroomFloor, wallFace …) | 넣음 |
| public/sprites/objects/<kind>.png | 사물. 이름은 src/data/room.ts의 OBJECT_KINDS와 같게(blackboard, teacherDesk …). 문·현관문의 열린 모양은 따로 `<kind>-open.png`(docs/map.md) | 넣음 |
| public/sprites/icons/<아이템 id>.png | 아이템 아이콘(locker-key …). 바닥 물건은 사물 sprite와 같은 이름(item-sensor …) | 넣음 |
| art/src/icons/<아이템 id>.txt | 아이템 아이콘 글자판(열쇠) | 넣음 |
| art/src/faces/char-0N.txt → public/sprites/faces/char-0N.png | 캐릭터 얼굴(CCTV·순위) | 넣음 |
| art/src/map/<장소>.txt → public/sprites/map/<장소>.png | 미니맵 장소 아이콘 24×24 | 넣음 |
| art/src/ui/<이름>.txt → public/sprites/ui/<이름>.png | UI 테두리(9-slice)·표시·하트(아래 "UI 그림") | 넣음 |
| public/fonts/ | 웹 글꼴 Galmuri11·Galmuri9(woff2)와 라이선스 Galmuri-OFL.txt(아래 "글꼴") | 넣음 |

## 글꼴(2026-11-12, 교사 결정)
- Galmuri(만든 이 quiple(이민서), SIL Open Font License 1.1). 공식 배포처 GitHub 저장소 quiple/galmuri의 릴리스
  **v2.40.4**(2026-07-12) `https://github.com/quiple/galmuri/releases/download/v2.40.4/Galmuri-v2.40.4.zip`
  (sha256 c8b3d986…6e60e7)에서 아래 세 파일만 꺼냈다. 다른 굵기·크기(Bold, 7, 14, Mono, ttf)는 넣지 않았다.

  | 파일 | 내용 | 맞는 크기(CSS px) |
  |---|---|---|
  | public/fonts/Galmuri11.woff2 | 본문(대화상자, 단추, 안내) | 12px, 큰 글은 24px(정수 배) |
  | public/fonts/Galmuri9.woff2 | 이름표, 작은 글, CCTV 표시 | 10px(20px) |
  | public/fonts/Galmuri-OFL.txt | 라이선스(원본 LICENSE.txt). 글꼴과 함께 둔다 | |
- 도트 글꼴이라 정해진 크기의 정수 배에서만 또렷하다(12px가 아닌 14·15px이면 획이 1·2픽셀로 고르지 않다). 지금 theme의 labelFont 15px·nicknameFont 14px는 바꿔야 한다(맵 담당).
- OFL: 글꼴을 고쳐 다시 내면 이름 'Galmuri'를 쓸 수 없다. 글꼴 파일만 따로 팔지 않는다. 프로그램에 넣어 함께 내는 것(공개 저장소 포함)은 된다.
- 헤드리스 크롬에서 @font-face로 읽으면 WSL에서도 한글이 보인다(art/work/ui/preview.html. 이 컴퓨터에 한글 글꼴이 없어도 됨).

## UI 그림(2026-11-12, 시안 B "종이 도트")
글자판 art/src/ui/<이름>.txt → `pnpm art:grid to-png art/src/ui/<이름>.txt public/sprites/ui/<이름>.png`.
색은 공용 색표의 외곽선(#1d1531)·흰색(#f8f8f6)과 theme의 단추 파랑(#3b6ea8)에 맞췄다.

- 9-slice 테두리. "자르기"는 위·오른쪽·아래·왼쪽 모두 같은 값(도트). HTML(CSS)에서는 **3배**(도트 하나 = 3px), 맵(Phaser) 위에서는 다른 그림처럼 **2배**로 쓴다.
  CSS 예: `border: 12px solid; border-image: url(sprites/ui/panel.png) 4 fill / 12px / 0 stretch; image-rendering: pixelated;`
  (자르기 4도트 × 3배 = 테두리 12px. 안쪽 여백은 padding으로 따로 준다.)

  | 그림 | 크기(도트) | 자르기 | CSS 테두리(3배) | 쓰는 곳 |
  |---|---|---|---|---|
  | panel | 12×12 | 4 | 12px | 대화상자, 위쪽 안내, CCTV 목록, 골든벨 카드, 첫 화면 카드 |
  | panel-dark | 8×8 | 3 | 9px(맵 위 2배면 6px) | 이름표, CCTV의 지금 하는 일, 사물 "이름 · 살펴보기" 판. 반투명(외곽 e6, 안 cc) |
  | tag-me | 8×8 | 3 | 9px(6px) | 내 이름표(노란 안테) |
  | btn / btn-down | 12×12 | 4 | 12px | 파란 단추(확인, 주요 동작). -down은 눌린 모양: 위 2줄이 비고 아래 두께가 1줄 |
  | btn-light / -down | 12×12 | 4 | 12px | 크림 단추(고르기, 보기, 보조 동작) |
  | btn-gold / -down | 12×12 | 4 | 12px | 금색 단추(골든벨, 시작, 강조) |
  | btn-off | 12×12 | 4 | 12px | 누를 수 없는 단추 |
  | slot | 12×12 | 4 | 12px | 가진 물건 칸(움푹함). 아이콘 30×30을 2배(60px)로 안에 놓는다 |
  | bar | 8×10 | 3 | 9px(맵 위 6px) | 시간 막대 바깥(빈 막대) |
  | bar-fill / -warn / -low | 6×8 | 2 | 6px | 시간 막대 안. 남은 시간 50% 넘음 초록, 50% 이하 노랑, 20% 이하 빨강(제안). 너비는 남은 비율 |

  - 단추 글자색: btn은 흰색, btn-light·btn-gold는 외곽선 색(#1d1531), btn-off는 theme textMuted.
  - Phaser: `this.add.nineslice(x, y, 'ui-panel-dark', undefined, w, h, 3, 3, 3, 3).setScale(2)`(w·h는 도트 단위, 화면에서 2배).
  - 3배가 아닌 배율(1.5배 화면 등)에서는 테두리 도트 폭이 고르지 않을 수 있다(헤드리스 DPR 1에서만 봤다).
- 표시와 하트(가운데 아래가 기준점. 맵 위에서는 2배)

  | 그림 | 크기(도트) | 쓰는 곳 |
  |---|---|---|
  | mark | 12×14 | 살펴볼 수 있는 사물 위 "!"(노랑 말풍선). 아래 꼭지가 사물 위쪽 가운데를 가리킨다 |
  | mark-done | 12×14 | 마친 미션의 사물 위 체크(초록) |
  | heart / heart-empty / heart-break | 9×8 | 골든벨 목숨: 남은 것, 잃은 것, 잃는 순간(금 간 것, 잠깐 보였다 heart-empty로) |
  | skull | 9×9 | 골든벨 탈락 |
- 미리보기: `art/work/ui/preview.html`을 public을 뿌리로 하는 서버에서 연다(글꼴·테두리·막대·하트를 한 판에).

## 캐릭터 구상(8가지, 교사 확인 전)
공통: 고등학생, 2.5등신. 성별은 정하지 않고 머리 모양과 옷으로 구분한다. 교사가 8가지 구상을 그대로 쓰기로 했다(2026-11-11).
화면에 보일 이름은 정해지지 않아 주제 이름(실험실, 전자기 …)을 임시로 쓴다. 피부색은 8명이 고르게 다양하도록 임시로 정해 프롬프트(desc 맨 앞)에 넣었다.
생성 프롬프트에 들어가는 영어 설명은 scripts/art/characters.json에 있다.

| id | 주제 | 모습 |
|---|---|---|
| char-01 | 실험실 | 흰 실험 가운, 이마에 올린 보안경, 짧은 검은 머리 |
| char-02 | 전자기 | 번개 무늬 남색 후드, 목에 건 헤드폰, 부스스한 갈색 머리 |
| char-03 | 탐험 | 노란 바람막이, 나침반 목걸이, 낮게 묶은 머리 |
| char-04 | 관찰 | 초록 조끼, 동그란 안경, 허리에 단 돋보기, 단발 |
| char-05 | 운동 | 빨간 체육복, 스톱워치 목걸이, 짧게 솟은 머리 |
| char-06 | 교복 | 남색 재킷과 줄무늬 넥타이, 각진 안경, 가르마 |
| char-07 | 천문 | 별 배지를 단 보라 카디건, 별 머리핀, 긴 머리 |
| char-08 | 메이커 | 주황 작업 앞치마와 주머니의 렌치, 머리띠, 곱슬머리 |

## 꾸미기를 위한 겹
- 겹: body(피부·얼굴), bottom(바지), top(윗옷), hair(머리), acc(안경·모자·목걸이). 이 순서로 겹쳐 그린다.
  뒷모습(줄 3)에서는 가방처럼 등에 오는 소품이 위로 와야 하므로, 소품마다 앞·뒤 어느 쪽에 그릴지 정해 둔다.
- 모든 겹은 같은 규격(30×60, 4줄×3칸)이고 빈 곳은 투명하다.
- 처음 8가지는 한 장(통짜)으로 쓴다. 다만 글자판의 팔레트 줄마다 겹 이름을 달아 두어, 나중에 `grid.mjs to-png --layer hair`로 겹만 뽑을 수 있게 한다.
  머리카락에 가려진 머리 부분은 겹으로 나눌 때 body 겹에 채운다.
- 같은 옷의 다른 색은 팔레트 줄의 색만 바꿔 만든다.
- 게임에서는 겹을 같은 프레임 번호로 겹쳐 그리거나, 들어올 때 겹을 한 장으로 합쳐 텍스처를 만든다(35명이면 합치는 쪽이 가볍다).
- 서버 Player에는 우선 캐릭터 id(char-01)만 둔다. 꾸미기가 생기면 겹별 id를 더한다.

## 만들 그림 목록
맵은 48×37칸 학교 하나다: 위 왼쪽 교실(22×9), 위 오른쪽 실험실(23×9), 가운데 가로 복도(46×4), 아래 운동장(46×17).
아래가 바닥인 가로 벽은 2칸 두께(윗면 칸 + 앞면 칸)이고, 옆 벽과 운동장 울타리는 1칸이다. 자세한 것은 docs/map.md.
생성 프롬프트에 들어가는 영어 설명과 크기는 scripts/art/things.json에 있다(`pnpm art:gen <프롬프트> --out <이름> --thing <id>`).

- 캐릭터 8가지(시트 8장)
- 바닥·벽(맵 글자 / 이름, 30×30)

  | 글자 | 이름 | 내용 | 프롬프트 |
  |---|---|---|---|
  | `.` | classroomFloor | 교실 바닥(나무). 골든벨 맵도 쓴다 | floor.txt |
  | `,` | hallFloor | 복도 바닥 | floor.txt |
  | `:` | labFloor | 실험실 바닥 | floor.txt |
  | `"` | field | 운동장 흙 | floor.txt |
  | `#` | wallTop, wallFace | 건물 벽의 윗면, 앞면 | floor.txt, wall.txt |
  | `%` | fenceTop, fenceFace | 울타리의 윗면, 앞면 | floor.txt, wall.txt |

- 사물(kind, 차지 칸, 프롬프트는 모두 object.txt)

  | kind | 이름 | 차지 칸 | 그림 너비(도트) | 비고 |
  |---|---|---|---|---|
  | blackboard | 칠판 | 6×1 | 180 | 교실 위쪽 벽의 앞면 칸에 걸림 |
  | bulletinBoard | 게시판 | 4×1 | 120 | 복도 위쪽 벽의 앞면 칸에 걸림 |
  | teacherDesk | 교탁 | 2×1 | 60 | |
  | desk | 책상 | 2×1 | 60 | |
  | locker | 사물함 | 1×3 | 30 | 옆벽에 붙음 |
  | shoeRack | 신발장 | 4×1 | 120 | |
  | labBench | 실험대 | 3×2 | 90 | |
  | cabinet | 약품장 | 3×1 | 90 | |
  | tree | 나무 | 2×2 | 60 | |
  | goalpost | 축구 골대 | 1×3 | 30 | 옆을 보고 섬 |
  | door | 교실·실험실 문 | 2×2 | 60 | 2칸 두께 벽(윗면 칸 + 앞면 칸)에 놓임, 60×60. 닫힘(door.png)·열림(door-open.png) |
  | entrance | 현관문 | 2×2 | 60 | 건물 아래쪽 2칸 벽, 60×60. 닫힘·열림(entrance-open.png) |
  | gate | 교문 | 4×1 | 120 | 운동장 아래쪽 울타리 칸 |

- 아이콘: 사물함 열쇠(locker-key), 교실 문 열쇠(door-key). 맵 담당이 아이템을 더하면 채운다.
- 벽에 걸린 사물(칠판, 게시판)은 벽 앞면 칸(30도트 높이) 안에 그린다. 문·현관문은 윗면 칸과 앞면 칸을 함께 덮는 60×60이다(위 30도트는 벽 윗면에서 본 문틀 위, 아래 30도트가 문짝).
  위로 솟는 높이를 둘지는 맵에 놓아 본 뒤 정한다.

## 그림 생성(BAZE)
- BAZE 그림 생성 API(문서 docs.factchat.kr): `POST https://api.baze.co/v1/gateway/images/generate/`. 만들기와 참고 그림으로 고치기가 같은 주소이고, input_images(data URL)를 주면 고치기다.
  본문: model, prompt, number_of_images, size, quality(low·medium·high), background(auto·opaque, 투명 없음), input_images(GPT 10장까지, 요청 25MB까지).
  응답: data[].url(임시 https 주소 또는 data URL, 바로 받아 둔다), credits_charged. Fal 모델은 operation_id를 주고 `GET …/generate/{operation_id}/?model=`로 기다린다.
  인증 Authorization: Bearer, User-Agent가 비면 403이라 delta-field-art/0.1을 넣는다.
- GPT 모델과 한 장 값: gpt-image-2 41크레딧, gpt-image-2.5-sunburst·gpt-image-2.5-flare 10크레딧(문서). 모델 목록(`pnpm art:models gpt-image`)에는 2.6-sunburst·2.6-flare도 있다.
  실제로 쓴 값(1024×1024 한 장, 2026-11-11): 2.6-sunburst high 54.17, 2.6-flare high 54.23, 2.6-sunburst medium 44.96, 2.6-flare medium 44.96크레딧.
  걸린 시간은 sunburst 35~43초, flare 8~10초. 교사가 정한 한도는 하루 8,000크레딧(2026-11-12에 5,000에서 늘림).
- 미리 값을 보는 /estimate는 주소를 찾지 못했다(images/generate/estimate/는 405·404).
- **쓰는 모델(2026-11-11 교사 결정): gpt-image-2.6-sunburst, 품질 medium.** 1024×1024 한 장 44.96크레딧, 약 35초. 비교에서 high(54.17)와 그림 차이가 작았다.
- 설정은 scripts/art/baze.json(url, model, quality, userAgent, size, body). model·quality 기본값은 위 결정이고 --model·--quality로 바꾼다. 모델이 비면(설정과 --model 모두) 부르지 않는다.
- 받을 때마다 쓴 크레딧을 화면에 보이고 art/raw/credits.log에 한 줄씩 남긴다(시각, 이름, 모델, 장 수, 크레딧, id).
- API 키는 환경 변수 BAZE_API_KEY로만 읽는다. 화면·로그·파일에 쓰지 않고, 응답이나 오류에 키가 섞여 오면 ***로 가린다.
- 명령: `pnpm art:gen <프롬프트 파일> --out <이름> [--char char-01 | --thing desk] [--var key=값] [--ref 참고.png] [--model 이름] [--n 4] [--size 1024x1536] [--quality medium] [--dry-run]`
  - pnpm art:gen은 ~/.config/delta-field/baze.env(저장소 밖)에서 키를 읽는다. `--dry-run`은 보낼 내용만 보인다(키 없이 된다).
  - 받은 그림은 art/raw/<이름>/<시각>-<번호>.png, 같은 이름의 .json에 프롬프트와 설정(키 없음)을 남긴다.
- 프롬프트(scripts/art/prompts/): style.txt(공통: 도트 규칙, 외곽선, 빛, 마젠타 배경, 글자·워터마크 없음, 기존 작품 따라 하지 않음)를 앞에 붙이고
  character-front.txt(앞모습 한 장), character-turn.txt(참고 그림으로 네 방향 서기), character-side-back.txt(참고 앞모습으로 왼쪽 옆·뒷모습 두 개), character-walk.txt(걷기 시트 4×3)를 쓴다. 타일·사물 프롬프트는 아래 "타일·사물 만들기". floor.txt·wall.txt·object.txt는 처음 것으로 지금은 쓰지 않는다.
- 캐릭터를 만드는 순서(제안)
  1. 앞모습을 캐릭터마다 여러 장 받아 교사가 고른다.
  2. 고른 그림을 참고 그림(--ref)으로 네 방향 서기를 받는다.
  3. 다듬어 글자판으로 바꾼다. 걸음 A·B는 서기에서 다리·팔 몇 도트만 다르므로 글자판에서 만든다.
  - 까닭: 그림 생성은 정확한 도트 수와 여러 프레임 사이의 일관성을 잘 지키지 못한다. 걷기 시트(character-walk)를 한 번에 받아 보고, 프레임끼리 어긋나면 이 순서로 한다.
- BAZE의 GPT는 투명 배경을 고를 수 없어, 프롬프트로 마젠타 단색 배경을 받아 다듬을 때 `--bg '#ff00ff'`로 지운다.

## 타일·사물 만들기(2026-11-12)
교사 결정: 생성 그림을 바탕으로 하되, 이어 붙이는 구조는 규칙대로 다시 짠다. 사물은 한 장에 하나씩 받는다(둘을 한 장에 받으면 GPT가 작게 그려 키울 때 외곽선이 2도트가 된다).
쓰는 프롬프트(scripts/art/prompts/)와 설명·크기는 scripts/art/things.json에 사물마다 적었다(`pnpm art:gen scripts/art/prompts/<prompt> --out <id> --thing <id>`).
- floor-patch.txt: 바닥·벽 윗면. 60×60도트 한 판(도트 약 17픽셀)을 받아 30×30 네 칸으로 자른다.
- wall-strip.txt: 벽·울타리 앞면 60×30 띠. object-single.txt: 사물 하나를 화면 가득. object-sample.txt·wall-object.txt: 긴 사물의 짧은 견본(가운데가 고른 것). door.txt: 벽 앞면의 문(정면).
- 열린 문은 닫힌 그림을 --ref로 붙여 "같은 문을 연 모양"으로 받는다(약 53.4크레딧).

바닥
1. `pnpm art:fit <받은 그림> --full --grid 2x2 --frame 30x30 --cols 4 --badge 0 --out <id>-fit.png` (변형 4칸, 120×30)
2. `node scripts/art/tile.mjs clean <id>-fit.png --out ... --remove '<이음선·점 색>' --erase 113,24,7,6`
   생성 그림의 이음선은 도트보다 가늘어 잘라 옮기면 빠지거나 어긋난다. 그 색을 지워 둘레 색으로 메우고, 오른쪽 아래 "AI" 표시 자리를 지운다.
3. 이음 다시 긋기: 교실 바닥 `tile.mjs planks --plank 6 --line '#a26d4c' --light '#f9c78d' --joint 0.3`(판자 폭 6, 끝 이음을 줄여 마루처럼),
   복도 `tile.mjs grid --step 15 --line '#83a18d'`, 실험실 `tile.mjs grid --step 10 --line '#aebdd1'`(실험실은 두 가지 파랑을 --map으로 하나로).
   운동장 흙·벽 윗면은 2만 한다. 울타리 윗면은 가로대가 받은 판 가운데에 있어 `tile.mjs roll --grid 2x2 --dy 15`로 칸 가운데로 옮기고 가로대가 든 두 칸만 쓴다(`pick --keep 2,3`), 세로는 `turn`.
4. `tile.mjs mix`로 무작위로 깔아 이음새를 본다. 끝나면 `pnpm art:grid to-txt`로 art/src/tiles/<id>.txt에 남기고 to-png로 public/sprites/tiles/<id>.png.
- 벽 앞면·울타리 앞면은 받은 띠의 박자가 30에 맞지 않아(울타리 기둥 29칸 간격 등) 받은 그림의 색과 짜임으로 글자판을 직접 짰다(art/src/tiles/wallFace.txt, fenceFace.txt).

사물
1. `pnpm art:fit <받은 그림> --bg '#ff00ff' --width <견본 너비> --frame <너비>x100 --colors 16 --out <id>-fit.png`
   --width: 가장 넓은 그림의 너비를 그 도트 수로 나눠 가짜 픽셀 크기를 정한다(사물은 너비가 정해져 있다). 받은 그림의 도트는 약 15~17픽셀이었다.
2. 긴 사물: `node scripts/art/stretch.mjs <id>-fit.png --trim --width <너비> --cols <되풀이할 칸 a-b> [--whole] [--height <높이> --rows <줄 a-b>] [--top n --bottom n]`
   | 사물 | 견본 → 그림 | 되풀이한 띠 |
   |---|---|---|
   | bulletinBoard | 60×26 → 120×30 | 칸 25-34, 위아래 2줄 투명 |
   | shoeRack | 60×25 → 120×25 | 칸 24-34(신발장 한 칸, --whole) |
   | labBench | 60×33 → 90×66 | 칸 17-30(문 한 짝, --whole), 줄 15(윗면, 2칸 깊이로) |
   | cabinet | 60×50 → 90×50 | 칸 15-44(유리문 셋이 됨) |
   | gate | 60×29 → 120×29 | 칸 20-26(창살 한 칸, --whole) |
   | locker | 30×65 → 30×125 | 줄 0-29(사물함 뚜껑, 세 개를 쌓고 맨 아래 앞면) |
   칠판은 견본(art/raw/test-blackboard)의 색과 짜임(나무 틀 2칸, 모서리 못, 오른쪽 분필)으로 180×30 글자판을 짰다. 골대는 그물 칸을 4칸 박자로 다시 짰다(art/src/objects/goalpost.txt).
3. 문: `node scripts/art/compose.mjs --out door.png --size 60x60 --tile public/sprites/tiles/wallTop.png:0,0,60,24 --image door-fit.png:0,24`
4. 글자판 art/src/objects/<kind>.txt → `pnpm art:grid to-png` → public/sprites/objects/<kind>.png.

### 2묶음(2026-11-12, 3단계 맵의 새 장소)
- 같은 kind의 다른 그림(대장 결정): 맵 사물의 sprite 항목. 그림은 public/sprites/objects/<sprite가 있으면 sprite, 없으면 kind>.png, 열림은 <이름>-open.png.
  sprite를 다 주는 kind도 기본 그림(<kind>.png)을 둔다(codingBlock = codingBlock-1, tileBoard = tileBoard-square, item = item-book).
- 1×1 작은 것은 small-set.txt로 한 장에 2×2로 넷씩 받는다(작은 것은 여럿을 받아도 도트 약 16픽셀로 그려진다).
  `pnpm art:fit <받은 그림> --bg '#ff00ff' --grid 2x2 --width 26 --frame 30x40 --colors 16`(비커 묶음은 --px 16). 시트는 2줄×2칸이다.
  칸 k를 30×30으로: `compose.mjs --size 30x30 --image <시트>:-(k%2)*30,-(k/2)*40-10`.
  - microbit·codingBlock-1·lightBulb(꺼짐)·lightBulb-on, item-sensor·item-pump·item-wire·item-book, 실험대 위 얼음 비커·물 비커·수증기 플라스크.
  - codingBlock-2~4는 1의 파랑 세 단계를 빨강·초록·노랑으로 바꿨다(`tile.mjs clean --map`).
  - labBench-ice·water·steam은 labBench 위 가운데(30,4)에 비커를 얹었다(compose).
  - 바닥 물건 아이콘 public/sprites/icons/item-*.png는 사물 그림과 같다(30×30).
- tileBoard-triangle·square·hexagon: 빈 판(생성)에 `node scripts/art/patterns.mjs <판> --kind triangle|square|hexagon --fill '#fce5c5' --line '#b46d3c' --size 10`로 무늬를 긋는다.
- bookshelf-empty: 책꽂이 가운데 칸의 책 세 권 자리(52~61칸, 21~29줄)를 비웠다(몸 백과 책을 꽂는 곳).
- 달력은 칸선이 끊겨 칸선(7×5)과 동그라미 셋을 규칙대로 다시 그었다. 계단은 `tile.mjs stripes --period 10`(10줄마다 미끄럼 막이·그늘).
- 2부 문(partDoor, 2×4)은 위에서 본 칸막이다. 받은 그림이 좁아 19칸 폭(양옆 외곽선을 더해 21)이고, 위·아래 칸막이 판을 늘여 120줄, 60×120 가운데에 놓았다.
- 강당 문(auditoriumDoor)은 강당 왼쪽 옆 벽(1×3)의 문이다. 옆 벽의 문은 정면이 보이지 않아, 생성 그림(정면 두 짝 문)의 색으로 위에서 본 옆문을 짰다(30×90). 지붕을 덮은 뒤로 문 둘레는 투명이다(지붕 왼쪽 테 위에 문 15칸 폭).
- 방위 표지(compassSign)의 화살표 판이 4~5도트라 N·E·S·W 글자는 넣지 못했다.

### 강당 지붕(2026-11-12)
- 강당(바깥 벽만 있던 칸)을 위에서 본 박공 금속 지붕으로 덮는다. 맵 칸 글자 `&`(id roof, 벽 종류).
- 견본 1장(`pnpm art:gen scripts/art/prompts/roof-sample.txt --out roofTop --thing roofTop`, art/raw/roofTop)에서 색과 짜임(세로 금속판, 가운데 용마루, 처마·박공 테)을 골라
  `node scripts/art/roof.mjs --out <폴더>`가 규칙대로 30×30 칸을 짠다. 판 폭은 견본의 6도트가 맵에서 잔 줄무늬로 보여 10도트로 넓혔다. 글자판은 art/src/tiles/roof*.txt.
- 그림(public/sprites/tiles/): roofN(용마루 위 비탈, 변형 4)·roofS(아래 비탈, 변형 4)·roofRidge(용마루, 변형 2), 테 roofEdgeN·S·W·E, 모서리 roofEdgeNW·NE·SW·SE(테·모서리는 띠 밖이 투명).
- 칸 고르기(mock.mjs의 roof()와 같게 painter.ts에 넣는다):
  1. 이 칸의 세로 지붕 줄(위아래로 이어진 & 칸) r0~r1에서 mid = r0 + floor((r1 - r0 + 1) / 2). 줄 < mid면 roofN, = mid면 roofRidge, > mid면 roofS(변형은 칸 자리로).
  2. 위·아래·왼쪽·오른쪽 칸이 &가 아니면(맵 밖 포함) 그 변의 테 roofEdgeN·S·W·E를 겹친다. 두 변이 함께면 모서리(NW·NE·SW·SE)를 그 뒤에 겹친다.

모형 판: `node scripts/art/mock.mjs --map src/data/school.json --out art/work/mock/school.png --area 0,0,48,37 [--scale 2] [--chars 'char-01@10,6,down;...']`
맵 데이터에 public/sprites의 타일·사물을 깔아 본다(사물의 sprite 항목을 읽는다). 그림이 없는 칸·사물은 회색 네모다. 게임 연결(painter.ts) 전에 크기와 어울림을 보는 용도.

## 장식 소품·새 타일(2026-11-12, 교사 결정 "모든 장소")
진단 보고(.run/ui-audit/report.md)의 M1·M2·M4·M5·M6·M7·U4·U6. 그림 생성 28장, **1,254.07크레딧**(장당 35.12~45.49, 다시 받은 것 없음. 동시에 5개를 부를 때 2번 실패했고 값은 나가지 않았다).
프롬프트 설명은 scripts/art/things.json(set-*, bench … auditoriumFace), 로고·첫 화면 배경은 prompts/logo.txt·title-bg.txt(--no-style).
배치는 맵 담당이 school.json·goldenbell.json에 넣는다(배치 초안은 docs/map.md에 붙일 표).

- 작은 소품(small-set 2×2, 한 장에 넷): `pnpm art:fit <받은 그림> --bg '#ff00ff' --grid 2x2 --width 26 --frame 30x40 --colors 16`
  → `node scripts/art/split.mjs <시트> --frame 30x40 --names a,b,c,d --out-dir <폴더>`(프레임마다 한 장, 위 빈 줄을 잘라 30×30 이상) → `grid.mjs to-txt` → `to-png`.

  | 받은 묶음 | 그림(objects/, 30×30 안팎) |
  |---|---|
  | set-classroom | chair(쓰지 않음, 아래), wallClock, plant, trashBin |
  | set-hall | extinguisher, waterCooler(30×33), eyeShower(30×32), safetySign |
  | set-room | officeChair(30×34), printer, globe, weatherBox |
  | set-outdoor | soccerBall, cone, outdoorBin, planter |
  | set-keys | icons/door-key(빨간 꼬리표)·lab-key(파랑)·entrance-key(초록), objects/beanbag |
- 하나씩 받은 것: `art:fit --bg '#ff00ff' --width <너비> --frame <너비>x<높이> --colors 16`, 긴 것은 stretch.mjs로 늘였다.

  | 그림 | 크기(도트) | 차지 칸 | 만든 법 |
  |---|---|---|---|
  | bench | 90×21 | 3×1 | 견본 60 → 칸 15-44 되풀이 |
  | stands | 240×30 | 8×1 | 견본 60 → 칸 20-39 --whole |
  | waterTap | 90×22 | 3×1 | 칸 15-29 --whole(수도꼭지 박자) |
  | flowerBed | 120×20 | 4×1 | 칸 15-44 |
  | handrail | 120×13 | 4×1 | 칸 15-29 --whole(기둥 박자) |
  | sink | 60×57 | 2×1 | 수도꼭지가 1칸 위로 솟음 |
  | serverRack | 26×60 | 1×1 | 1칸 위로 솟음 |
  | sofa, bookCart | 60×46, 60×52 | 2×1 | |
  | flagpole | 30×97 | 1×1 | --height 100, 2칸 넘게 솟음 |
  | window | 46×30 | 2×1 | 벽 앞면 칸의 위 1~18줄(아래 판벽을 가리지 않게 높이 18로 맞춤) |
  | periodicTable | 52×30 | 2×1 | 벽 앞면(높이 27) |
  | whiteboard | 90×30 | 3×1 | 벽 앞면, 칸 15-44 |
  | mathPoster | 60×30 | 2×1 | 벽 앞면(그림 22줄, 위 2·아래 6 투명) |
  | curtain | 180×30 | 6×1 | 벽 앞면, 칸 15-44 |
  | banner | 180×30 | 6×1 | 벽 앞면(그림 20줄). 가운데가 비어 있어 글자는 화면이 적는다 |
  | stage | 210×54 | 7×2 | 견본 60×27 → 가로 칸 15-44, 세로 줄 4-12(마루)를 늘임 |
  | auditoriumBigDoor | 54×30 | 2×1 | 강당 앞면 벽 칸의 큰 유리문(꾸밈) |
- 받은 그림을 타일로
  - gardenGrass(새 바닥, 30×30 변형 4): floor-patch → `art:fit --full --grid 2x2 --frame 30x30 --cols 4 --badge 0` → `tile.mjs clean --erase 113,24,7,6`. 운동장 흙 옆에서 너무 밝아 색 다섯을 손으로 낮췄다(글자판).
  - roofFloor(옥상 바닥, 대장 결정으로 콘크리트로 바꿈): 같은 방법 뒤 `tile.mjs grid --step 30 --line '#8e929d' --light '#c3c6ce'`(판 이음을 칸 가장자리로). 이름이 같아 맵을 고치지 않아도 바뀐다.
  - auditoriumFace(강당 앞면 벽, 변형 2): 받은 띠는 벽돌 박자가 고르지 않아, 그 색으로 decals.mjs가 짠다(처마 테·그늘, 10도트 벽돌 6단, 돌 굽).
- 규칙으로 짠 그림(생성 없음): `node scripts/art/decals.mjs`가 글자판을 만들고 `grid.mjs to-png`로 PNG를 만든다.
  - 벽 윗면 테 tiles/wallEdgeN·S·W·E(변에 2도트: 바깥 #4a4458, 안 #9fa1ab)와 안쪽 모서리 wallCornerNW·NE·SW·SE(2×2). 테두리 밖은 투명이라 wallTop 위에 겹친다.
    고르기(mock.mjs의 wallEdges()와 같게 painter.ts에): 벽 윗면 칸(# 이고 아래가 바닥이 아님)에서, 위·아래·왼쪽·오른쪽 칸이 바닥이거나 벽 앞면 칸이면 그 변의 테.
    두 변이 모두 벽 윗면이고 그 사이 대각선 칸만 트이면 그 구석의 안쪽 모서리.
  - 골든벨 구역 판 objects/zone-O·X·1·2·3·4(60×60, 2×2칸): theme color.zone 색, 7×9 도트 글자를 3배로. 바닥에 깔아 지나갈 수 있다.
  - objects/roomSign(30×30 칸의 3~14줄에 30×12 판): 문 옆 벽 앞면에 거는 교실 이름판. 이름 글자는 화면이 Galmuri9로 적는다.
- 첫 화면: ui/logo.png(81×64, "DELTA FIELD"와 삼각형, 생성 그림을 12픽셀 = 1도트로), ui/title-bg.png(256×171, 1536×1024 생성 그림을 6픽셀 = 1도트로, 32색. 오른쪽 아래 AI 표시 자리를 옆 칸으로 덮음).
  화면에서는 정수 배로 키우고 `image-rendering: pixelated`(배경은 화면을 덮도록 3~5배, 남는 곳은 잘림).
- 쓰지 않은 것: chair(교실 책상 아래에 놓으면 책상이 두 줄로 보이고, 등받이가 칠판 쪽이라 방향이 맞지 않음). 그림은 남겨 둔다.
- 모형 판: `node scripts/art/mock.mjs --map src/data/school.json --decor <배치.json> --out <png> [--area ...]`. --decor는 배치 초안(새 칸 글자 +·$, 옮기기, 장식 사물)과
  그리기 효과(벽 윗면 테, 사물 그림자, 경기장 선, 미션 사물 위 "!")를 얹는다. 형식은 mock.mjs 맨 위.

## 남은 그림(2026-11-12 둘째 묶음, 대장 목록 1~11)
생성 16장, **729.23크레딧**(장당 34.95~53.52, 다시 받은 것 없음). 프롬프트는 things.json(hintCards … gateOpen), prompts/pair.txt(두 개 나란히), scene.txt(넓은 장면).
그림마다 연결 담당은 대장 보고 표에 있다. 크기는 도트(화면에서 맵 2배, HTML 3배 또는 정수 배).

| 항목 | 그림 | 크기 | 만든 법 |
|---|---|---|---|
| 1 순서 진행 | objects/codingBlock-1~4-on, tileBoard-square·hexagon·triangle-on | 원래보다 사방 1도트 큼 | `derive.mjs on`: 1도트 노란 빛 테 + 오른쪽 위 초록 체크(7×7) |
| | ui/step, step-on | 7×7 | ui-icons.mjs |
| 2 보상 카드 | ui/sparkle(9×9 4프레임 시트 36×9), stamp-correct(24×24), burst(48×48 반투명) | | ui-icons.mjs |
| | ui/hintCard(앞, 가운데 빈 곳에 글), hintCard-back(뒤) | 40×56 | 생성 1장(pair) |
| 3 2부 문 | objects/partDoor, partDoor-open | 60×150 | 아래 "2부 문(위에서 본 모양)"으로 다시 그림 |
| 4 보너스 | objects/timeCapsule, timeCapsule-open | 40×35, 40×39 | 생성 2장(열림 --ref) |
| 5 얼굴 | faces/char-01~08 | 30×26 | `derive.mjs face`: 앞모습 서기 프레임의 머리 꼭대기부터 26줄 |
| 6 강당 안 | tiles/gbFloor(마루 변형 4), gbWallFace(안쪽 벽 앞면) | 30×30 | 마루는 생성 뒤 `tile.mjs planks --plank 6`, 벽은 견본 색으로 decals.mjs가 짬(창 10×12, 판벽) |
| | objects/podium, goldenBell, speaker(30×34), trophy, goldenBell-big(46×50) | 30×30 안팎 | small-set 1장. 큰 종은 같은 그림의 칸을 잘라 너비 48로 다시 맞춤 |
| 7 미니맵 | map/classroom, lab, computer, hallway, math, library, stairs, rooftop, field, garden, auditorium, gate | 24×24 | small-set 3장(--width 22 --frame 24x26). 16으로 줄이면 뭉개져 24로 둠 |
| 8 시상·알림 | ui/medal-gold·silver·bronze, trophy-icon, emblem-science, emblem-aisw, megaphone, heart-plus | 30×30 | small-set 2장 |
| 9 장면 | ui/story(골든벨 대회 날 강당), ui/finish(열린 교문) | 256×171 | 1536×1024 생성을 6픽셀 = 1도트, 32색, AI 표시 자리를 옆 칸으로 덮음 |
| 10 교문 열림 | objects/gate-open | 120×30 | gate.png를 8배로 키운 판을 --ref로 생성, 두 짝을 따로 맞춰 양끝에 붙임 |
| 11 CCTV 상태 | ui/status-quiz, status-stuck, status-done, status-move | 11×11 | ui-icons.mjs |

- 순서 맞추기 사물의 글(블록 글, 전구 번호)은 자료마다 달라 그림에 넣지 않는다. 화면이 ui/panel-dark 판에 Galmuri9로 적는다(대장 결정).
- 골든벨 맵의 마루·벽은 맵마다 타일 이름을 바꾸는 방식(mock.mjs --decor의 tileNames)을 제안했다. 맵 담당이 정한다.

### 2부 문(위에서 본 모양, 2026-11-12 교사 "너무 어색하다")
- 앞에서 본 두 짝 문(생성 그림)은 복도 한가운데 세워 둔 판처럼 보여, 위에서 본 문틀·문짝으로 다시 짰다(생성 없음, `node scripts/art/decals.mjs` 6절).
- 크기 60×150. 아래 끝을 차지 칸(65~66열, 13~16행) 아래에 맞추면 위 30줄이 12행 벽 앞면 칸을 덮어, 가운데 24도트 폭 기둥이 위 벽 윗면에서 내려온다.
  - 0~29줄: 기둥 윗면(wallTop 색, 양옆 2도트 테는 wallEdge 색)
  - 30~41줄: 기둥 앞면(크림 벽, 판벽 색 띠)과 파란 "2" 판(12×10)
  - 42~139줄: 문지방(30도트 폭 금속 띠)
    - 닫힘: 나무 미닫이 문짝 두 장(폭 12, 90줄에서 만남), 양옆 손잡이, 오른쪽 그림자 3도트(반투명)
    - 열림: 문짝이 위·아래 기둥 속으로 들어가 끝 6줄만 보이고, 가운데에 문 홈
  - 140~149줄: 아래 기둥 윗면. 17행 벽 윗면으로 이어진다
- 깊이: 게임은 연 문을 차지 칸 위 끝 깊이로 그려(painter.ts setOpen) 지나가는 캐릭터가 문 위에 보인다. 닫힌 문은 지금처럼 아래 끝 깊이. 바꿀 것은 없다.
- 모형 판: mock.mjs의 사물 `under: true`가 게임의 연 문 깊이와 같다(.run/ui-audit/partdoor/).

## 다듬기
이 컴퓨터에는 PIL·ImageMagick·도트 편집 프로그램이 없어, Node에 들어 있는 zlib으로 PNG를 읽고 쓴다(scripts/art/png.mjs). 설치할 것은 없다.

1. 받은 그림 → 도트 시트: `pnpm art:fit art/raw/char-01-turn/<파일>.png --grid 1x4 --frame 30x60 --out art/work/char-01.png --preview art/work/char-01-x8.png`
   - 배경 지우기: 투명 배경이면 그대로, 아니면 가장자리 색을 가장자리에서부터 지운다(흰 옷처럼 안쪽의 같은 색은 남는다). `--bg '#ff00ff'`는 그 색을 안쪽까지 모두 지운다.
   - 가짜 픽셀 크기 찾기: 생성 그림의 "도트" 한 개는 몇 픽셀짜리 네모다. 색이 바뀌는 자리의 간격으로 크기와 시작점을 찾는다. 틀리면 `--px 20`처럼 정한다.
   - 한 점씩 옮기기: 네모마다 가운데 부분에서 가장 많은 색을 고른다(흐린 가장자리는 보지 않는다).
   - 그림 나누기: 이어진 덩어리를 그림 하나로 보고 `--grid`의 줄·칸 순서로 늘어놓는다. 떨어진 작은 조각은 가까운 그림에 붙인다.
   - 프레임 맞추기: `--frame`보다 크면 모든 그림을 같은 비율로 줄이고(이때는 손볼 곳이 늘어난다), 아래 가운데(`--anchor bottom`)에 놓는다.
   - 색 묶기: 차이가 16 이하인 색을 하나로 묶는다(`--merge`). 비슷한 어두운 색 둘(외곽선과 신발 등)이 묶이면 `--merge 8`로 줄인다. `--colors 12`로 색 수를 정할 수도 있다.
   - 바닥 타일은 `--full --frame 30x30`(그림 전체를 한 칸으로 보고 30×30으로 나눈다).
   - 실제 생성 그림(2.6-sunburst)은 "도트" 크기가 고르지 않아 격자 찾기가 잘 맞지 않았다. 그래서 --frame을 주면(--full 아닐 때) 기본으로 `--px frame`이 되어 가장 큰 그림의 높이를 프레임 높이(또는 `--height`)로 나눠 옮긴다.
   - 8명 앞모습(2.6-sunburst medium, 2026-11-11)은 프롬프트에 20×40을 적어도 도트 한 칸이 받은 그림의 15~17픽셀, 크기는 약 28~34×47~67도트로 그려졌다(`--px auto`로 잼). 20×40으로 줄이면 얼굴·안경·작은 소품이 뭉개져, 교사가 캐릭터를 30×60으로 정했다. 같은 8장을 30×60으로 다시 다듬었다(새로 받지 않음).
     구석의 "AI" 표시처럼 멀리 떨어진 작은 조각은 지운다.
   - `--bg '#ff00ff'`이면 배경과 맞닿은 번짐(마젠타에 어두운 색이 섞인 점)도 지우고, 오른쪽 아래 구석(`--badge 0.1x0.08`, AI 표시 자리)을 지운다.
     옆·뒷모습 시험(char-01)에서 AI 표시가 뒷모습에 붙어 키가 커졌던 것을 이렇게 막았다.
   - 옆·뒷모습 시험(2026-11-11, char-01): 받은 앞모습 원본을 `--ref`로 넣고 character-side-back.txt로 한 장(1024×1024)에 두 개를 받았다. 53.51크레딧(참고 그림 때문에 앞모습보다 약 8.5 많음), 32초.
     옷·머리·색·도트 크기가 앞모습과 잘 맞았다. 다듬기: `pnpm art:fit <받은 그림> --grid 1x2 --frame 30x60 --bg '#ff00ff' --out art/work/side-back-char-01.png`.
   - 여러 그림을 한 장으로 늘어놓아 비교하려면 `pnpm art:board --out <판.png> --cols 4 --height 240 [--label "1 LAB|45.01 CR" ...] <그림> ...`. --label은 그림 순서대로 칸 위에 적는 글자(영문 대문자·숫자, '|'는 줄바꿈, 3×5 도트 글꼴이라 한글 글꼴이 필요 없다).
2. 도트 시트 → 글자판: `pnpm art:grid to-txt art/work/char-01.png art/src/characters/char-01.txt --frame 30x60 --names down-a,down,down-b`
3. 글자판을 고친다: 걸음 프레임 만들기, 어긋난 도트 고치기, 팔레트 맞추기, 겹 이름 달기.
   - 8명 앞모습 손질(2026-11-11): 2번 눈 좌우 맞춤, 3번 나침반, 4번 동그란 안경·눈·입, 5번 초시계, 6번 각진 안경·눈·입, 8번 눈·입·렌치.
4. 글자판 → 게임 그림: `pnpm art:grid to-png art/src/characters/char-01.txt public/sprites/characters/char-01.png` (앞모습만 있을 때는 `--fill 12`)
   - 크게 보려면 `--scale 8`로 따로 저장한다. 실제 모양은 교사가 윈도우 크롬에서 본다.

### 걷기 시트 만들기
1. 옆·뒷모습 받기: 받은 앞모습 원본을 참고 그림으로 넣어 왼쪽 옆 + 뒷모습을 한 장에 받는다.
   `pnpm art:gen scripts/art/prompts/character-side-back.txt --out side-back-char-02 --char char-02 --ref art/raw/front-char-02/<파일>.png`
   2026-11-11: 8명 8장, 장당 약 53.5크레딧(모두 428.12), 다시 뽑은 것 없음.
2. 다듬기: `pnpm art:fit <받은 그림> --grid 1x2 --frame 30x60 --bg '#ff00ff' --out art/work/side-back-char-02.png`.
   앞모습이 60줄보다 작으면(4번 55줄, 8번 58줄) `--height`로 같은 키에 맞춘다.
3. 서기 프레임 넣기: `pnpm art:walk stand art/src/characters/char-02.txt art/work/side-back-char-02.png`
   → 글자판에 down(앞모습, 그대로)·left·right(left를 뒤집음)·up이 들어간다. 색은 앞모습 색표에 가까운 색으로 맞추고, 먼 색(뒷머리 등)만 더한다(캐릭터당 18~22색).
   가로 가운데가 다른 방향과 1칸 넘게 어긋나면 옮긴다. right의 좌우가 다른 소품을 고친다.
4. 걷기 만들기: `pnpm art:walk make art/src/characters/char-02.txt --rig art/src/characters/rig.json --out art/src/characters/char-02.sheet.txt`
   - 뼈대(다리 시작 줄, 두 다리 사이 칸, 흔들 팔 상자)는 서기 프레임에서 찾는다: 다리는 신발 위 바지 색이 시작되는 줄, 팔은 얼굴과 같은 피부색 손 덩어리.
     찾은 값이 화면에 나오니 틀리면 rig.json에 적어 고친다(5번은 윗옷과 바지가 같은 빨강이라 legTop을 적었다).
     3번(손 색이 얼굴과 달라 팔 상자가 좁게 잡힘)·4번(허리띠 색 때문에 조끼까지 잡힘)은 옆모습 arm, 8번은 뒷모습 legTop을 적었다. 까닭은 rig.json의 _왜.
   - char-0N.sheet.txt가 게임 시트의 원본이다(12프레임, 손으로 다듬는 곳). make를 다시 하면 덮어쓴다.
5. 게임 시트: `pnpm art:grid to-png art/src/characters/char-02.sheet.txt public/sprites/characters/char-02.png`
6. 미리보기: `pnpm art:walk preview art/src/characters/char-02.sheet.txt --out art/work/walk/char-02.gif --scale 2 --strip art/work/walk/char-02-frames.png`
   (네 방향을 나란히, A → 서기 → B → 서기, 8fps, 2배 GIF. --strip은 12프레임 판 4배)

### 글자판
도트 그림을 글자로 적은 파일이다. 편집 프로그램 없이 고칠 수 있고, git에서 바뀐 도트가 보인다.
```
size 30x60            프레임 크기
cols 3                PNG로 만들 때 한 줄의 프레임 수
palette               글자 색 [겹]. 겹이 없으면 base. 색 뒤에 두 자리를 더 쓰면 불투명도(#241b3dcc, UI 그림만)
o #2b2433 line
s #f2c9a0 body
h #3a2a20 hair
frame down            프레임 이름. 다음 줄부터 60줄, 한 줄 30글자. '.'은 투명
................
....oooooooo....
...ohhhhhhhho...
(…)
```

### 확인한 것(2026-11-11)
- 합성 그림으로 시험했다(--px auto): 16×24 도트 그림 3~12프레임을 13.3·19.1·19.7·20.3·21.0·10.4배로 키우고, 흐리게 하고, 잡음(±8)과 배경(마젠타, 흰색, 투명)을 넣었다.
  모두 원래 도트 그림과 같게 돌아왔다(투명 여부·색 다른 도트 0개). 바닥 타일(64배, --full)도 같았다. 4×3 시트도 순서대로 나왔다.
- 글자판 ↔ PNG를 오가도 같았다. 겹만 뽑기(--layer)를 확인했다.
- 그림 생성 받기는 이 컴퓨터 안의 가짜 서버로만 확인했다(그림 만들기, 주소로 내려받기, 참고 그림 보내기, 오류). 키는 출력·저장 파일 어디에도 나오지 않았다.
- 진짜 생성 그림으로는 아직 해 보지 않았다. 도트 크기가 고르지 않거나 격자가 비뚤면 --px로 정하거나 글자판에서 손으로 고친다.

## 손본 곳(2026-11-12, 교사 "캐릭터 손볼 곳 고쳐")
- 5번 뒷모습: 초시계와 가슴으로 내려오는 줄을 지우고, 목 뒤 깃 아래에 회색 줄 한 줄만 둔다(앞모습 줄과 같은 색).
- 8번 뒷모습: 앞치마 앞면을 지우고 회색 셔츠 등판, 목 뒤 끈, 허리 끈과 가운데 매듭, 허리 아래 양옆에 앞치마 가장자리 1칸, 바지로 그렸다.
- 옆모습 걸음(8명): 팔이 앞으로 갈 때 몸 뒤에 남던 1칸 선을 walk.mjs make에서 지운다(위 "걸음 프레임의 움직임").
- 그 밖에: 7번 옆모습 팔이 앞으로 갈 때 팔 뒤 허리에 남던 검은 덩어리(외곽선 색으로 메움), 3번 옆모습 팔이 소매째 흔들리지 않고 손 옆에 외곽선 조각이 남던 것,
  4번 옆모습 조끼·허리띠·돋보기가 팔과 함께 흔들리던 것, 3번 앞모습 어깨와 묶은 머리 사이·8번 앞·뒷모습 머리와 어깨 사이의 1칸 구멍(투명 점)을 고쳤다.

## 정하지 않은 것
- BAZE: 몇 장까지 만들지(예산). 모델·품질은 정했다(2.6-sunburst medium).
- 캐릭터 8가지 구상, 화면에 보일 이름, 피부색
