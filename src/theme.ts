// 색과 크기는 여기에서만 정한다. 다른 파일과 CSS는 이 값을 가져다 쓴다.
// CSS(src/ui/ui.css)는 applyCssTheme()이 넣는 --df-* 변수만 쓴다.

/** 게임 화면(Phaser)에서 쓰는 색 */
export const color = {
  background: 0xf4efe6,
  // 칸 종류별 색(단순 도형 단계). 칸 종류는 src/data/room.ts의 TILES, 그리기는 src/scenes/painter.ts
  // 바닥: fill과 alt를 체크무늬로 번갈아 칠하고, line이 있으면 칸 테두리를 긋는다. 벽: top은 윗면, face는 앞면(아래가 바닥일 때)
  tile: {
    classroomFloor: { fill: 0xe9e1d2, alt: 0xe2d9c8, line: 0xcfc3ad },
    hallFloor: { fill: 0xe3e1db, alt: 0xdbd8d0, line: 0xc6c1b5 },
    labFloor: { fill: 0xdde6e8, alt: 0xd3dde0, line: 0xb9c8cc },
    computerFloor: { fill: 0xd8dce6, alt: 0xcfd4df, line: 0xb4bbc9 },
    libraryFloor: { fill: 0xb98f7a, alt: 0xb28872, line: null },
    roofFloor: { fill: 0xb7bcc0, alt: 0xb0b5b9, line: 0x9ca2a7 },
    stairs: { fill: 0xc9c4bb, alt: 0xbdb7ad, line: 0x9e978b },
    field: { fill: 0xd9c49c, alt: 0xd4bf96, line: null },
    wall: { top: 0xa59a8c, face: 0x8a7f72 },
    fence: { top: 0x7e8a68, face: 0x66714f },
    roof: { top: 0x6582a0, face: 0x4f6c89 }, // 강당 지붕(그림이 없을 때). 지붕은 앞면을 그리지 않는다
  },
  avatarShadow: 0x000000,
  highlight: 0xf2b134,
  label: '#3a3a3a',
  labelOnDark: '#ffffff',
  labelBackground: 'rgba(30, 26, 22, 0.6)', // 그림 위에 적는 사물 이름표 바탕
  stepMark: '#ffffff', // 순서 맞추기: 맞게 누른 사물 위 번호 글자
  stepMarkBackground: '#d9822b', // 그 번호의 바탕
  nickname: '#24476e',
  remoteNickname: '#5b6b7c',
  teacherNickname: '#8a3d1f',
  // CCTV 모드에서 아바타 위에 띄우는 지금 하는 일
  tagText: '#ffffff',
  tagBackground: 'rgba(46, 42, 38, 0.78)',
  // 골든벨 답 구역
  zone: {
    O: 0x3b6ea8,
    X: 0xc0603a,
    '1': 0x4f8a5b,
    '2': 0x8a6bb0,
    '3': 0xc79a3d,
    '4': 0x3d8f99,
  },
  zoneLabel: '#2e2a26',
  // 골든벨: 머리 위 목숨
  livesText: '#d23c4e',
  livesStroke: '#ffffff', // 배경 없이 띄우므로 테두리로 바닥과 구분한다
  // 사물 종류별 색(단순 도형 단계)
  object: {
    blackboard: 0x2f5d4a,
    teacherDesk: 0xa0714f,
    desk: 0xc79a6d,
    locker: 0x7d8fa3,
    bulletinBoard: 0x9b6b43,
    shoeRack: 0x8c7a63,
    labBench: 0x5f6f7a,
    cabinet: 0x7a8f86,
    tree: 0x4f7a45,
    goalpost: 0xf3f1ec,
    door: 0x6b4a33,
    entrance: 0x5d7f95,
    gate: 0x55585c,
    item: 0xd9a441,
    timetable: 0xe8e4d8,
    calendar: 0xf3efe6,
    apparatus: 0x6f8aa0,
    computerDesk: 0x8e9aa8,
    microbit: 0x2f3a46,
    codingBlock: 0xe58a3a,
    lightBulb: 0xf2d16b,
    polyhedron: 0x9a7fb8,
    tileBoard: 0x7fa37a,
    bookshelf: 0x7a5236,
    readingTable: 0xa77b55,
    telescope: 0x3e4a5c,
    starChart: 0x2c3a5e,
    compassSign: 0x8a6d4a,
    sundial: 0xa8a39a,
    timeCapsule: 0x8a8f96,
    partDoor: 0x6b4a33,
    auditoriumDoor: 0x7a3f3f,
  },
} as const;

/**
 * 화면 위 안내·대화상자(HTML)에서 쓰는 색. 바탕·테두리·단추는 9-slice 그림(uiSkin)이 칠하고, 여기의 색은 글자와 그림이 없는 곳에 쓴다.
 * 종이 도트(시안 B, 2026-11-12 교사 결정): 크림 바탕, 남색 1도트 외곽선. 그림의 색(art/src/ui/*.txt)에 맞췄다.
 */
export const uiColor = {
  text: '#1d1531', // 그림의 외곽선 색과 같다
  textMuted: '#6a5f78',
  panel: '#fff3d6', // panel 그림의 안쪽
  line: '#e3cf9f', // 패널 안 구분선(panel 그림의 아래 그늘)
  backdrop: 'rgba(29, 21, 49, 0.5)',
  startBackground: '#8aa37a', // 첫 화면 바탕(배경 그림이 오기 전까지)
  buttonText: '#ffffff', // 파란 단추(btn)
  buttonLightText: '#1d1531', // 크림·금색 단추(btn-light, btn-gold)
  buttonOffText: '#6a5f78', // 누를 수 없는 단추(btn-off)
  rowHover: '#f7e5b8', // CCTV 목록 줄을 가리킬 때
  rowMe: '#ffe9a3', // 순위에서 내 줄
  correct: '#2e7d4f',
  wrong: '#b23b3b',
  badge: '#f2c94c', // btn-gold 안쪽
  badgeText: '#1d1531',
  link: '#3b6ea8',
  status: '#b23b3b',
  lives: '#e12a24', // 골든벨 목숨(heart 그림의 빨강)
  // CCTV 목록의 지금 하는 일 표시(왼쪽 띠와 글)
  stateQuiz: '#d9ab2a',
  stateLook: '#3b6ea8',
  stateWalk: '#b9a274',
  stateStuck: '#e12a24',
  stateDone: '#5b9137',
  stateOffline: '#a5b1c0',
  // 시상대(1·2·3위)
  podium1: '#f2c94c',
  podium2: '#dfe5ec',
  podium3: '#d9a066',
  joystickBase: 'rgba(29, 21, 49, 0.18)',
  joystickKnobColor: 'rgba(59, 110, 168, 0.8)',
  renderInfo: 'rgba(29, 21, 49, 0.78)', // ?fps=1 확인 표시 바탕
  renderInfoText: '#ffffff',
} as const;

/** 게임 화면 크기. 길이는 픽셀, 칸 좌표의 크기는 칸 단위 */
export const size = {
  groundChunk: 32, // 바닥·벽을 이 칸 수씩 나눠 한 장으로 굽는다(도트 크기로 구워 32칸 = 960px, 텍스처 크기 한도 아래)
  tile: 60, // 바닥 한 칸의 한 변(픽셀). 타일 그림 30도트를 2배로 그린다(docs/art.md). 캐릭터(60×120)는 1×2칸
  floorLine: 1,
  viewTiles: 15, // 내 아바타를 따라갈 때 화면 짧은 쪽에 보이는 칸 수쯤(확대 배율을 정한다)
  zoomSnap: 2, // 따라가기 확대 배율(기기 픽셀 기준)을 1/zoomSnap 단위로 맞춘다(2면 0.5, 1, 1.5…: 도트 2배 그림의 도트 하나가 기기 픽셀 정수). 0이면 맞추지 않는다(?render=free도 맞추지 않음, src/render.ts)
  canvasMaxLong: 2732, // dpr 방식에서 캔버스(기기 픽셀) 긴 쪽·짧은 쪽의 상한. 넘으면 그리는 비율을 낮춘다(src/render.ts)
  canvasMaxShort: 2048,
  wallFace: 60, // 벽 앞면 높이(픽셀). 아래가 바닥인 벽 칸의 아래쪽을 앞면으로 칠한다. 칸 전체(tile)면 그 벽 칸이 통째로 앞면이다
  highlightLine: 3,
  // 캐릭터: 시트의 프레임 30×60도트를 2배로 그린다(docs/art.md). 발 위치가 프레임 아래 가운데다.
  charFrameWidth: 30,
  charFrameHeight: 60,
  charScale: 2,
  dotScale: 2, // 타일·사물 그림의 도트 하나 = 이 픽셀(30도트 = 1칸 60px)
  avatarHeight: 120, // 발에서 머리 꼭대기까지(픽셀) = charFrameHeight × charScale. 몸통 가운데는 그 절반
  avatarHitWidth: 44, // 아바타를 누를 때 몸으로 치는 너비(픽셀)
  avatarShadowWidth: 40,
  avatarShadowHeight: 14,
  avatarFeet: 0.3, // 발밑 충돌 반경(칸)
  reach: 0.8, // 사물과 이 거리(칸) 안이면 살펴볼 수 있다
  spawnSpread: 1.5, // 시작 위치를 이 거리(칸) 안에서 흩어 놓는다
  labelFont: '12px', // Galmuri11은 12px의 정수 배에서 또렷하다
  labelPad: 4, // 그림 위 이름표 바탕의 좌우 여백(픽셀)
  stepMarkFont: '24px', // 순서 맞추기 번호(Galmuri11은 12px의 정수 배에서 또렷하다)
  stepMarkPad: 6, // 번호 바탕의 여백(픽셀)
  nicknameFont: '12px',
  nicknameGap: 2, // 머리 꼭대기와 닉네임 사이(픽셀)
  textResolution: 2, // 아바타 글자를 이 배율로 그려 확대해도 덜 흐리게 한다
  viewMargin: 0.92, // 맵 전체를 화면에 맞출 때(골든벨, CCTV 전체 보기) 남기는 비율
  zoomMin: 0.05, // 화면(CSS) 배율(넓힌 학교 맵 전체를 CCTV에 맞출 때 0.1쯤)
  zoomMax: 2,
  reserveTop: 100, // 위쪽 안내 자리(픽셀)
  // CCTV 모드
  tagFont: '12px',
  tagPadX: 5,
  tagPadY: 2,
  tagGap: 3, // 닉네임과 지금 하는 일 표시 사이(픽셀)
  followLerp: 0.15, // 화면이 따라가는 아바타(나, CCTV로 고른 학생)를 쫓는 빠르기(0~1, 클수록 바로)
  // CCTV 전체 보기는 지도가 작아(배율 0.35쯤) 학생 캐릭터는 적어도 cctvAvatarZoom, 닉네임·표시는 적어도 cctvTextZoom 배율일 때만큼 크게 보인다.
  cctvAvatarZoom: 0.4,
  cctvTextZoom: 0.8,
  pickRadius: 24, // 학생을 누를 때 아바타 몸 밖이라도 몸통 가운데에서 이 거리(화면 CSS 픽셀) 안이면 그 학생을 고른다(작게 보일 때)
  // 골든벨
  reserveGap: 12, // 문제 카드와 지도 사이(픽셀)
  // 골든벨 맵은 화면에 전체를 맞추므로 구역 글자는 칸 크기에 견주어 정한다(칸 60px 기준).
  zoneLabelFont: '72px',
  zoneTextFont: '24px',
  zoneTextPad: 12,
  livesFont: '12px',
  livesStroke: 3, // 하트 테두리 두께(픽셀)
} as const;

/**
 * 대화상자·안내 크기(CSS). 글꼴은 도트 글꼴이라 정해진 크기의 정수 배에서만 또렷하다(docs/art.md "글꼴"):
 * Galmuri11은 12px·24px·36px, Galmuri9는 10px·20px.
 */
export const uiSize = {
  font: '12px', // 본문(Galmuri11)
  fontSmall: '10px', // 작은 글·이름표(Galmuri9)
  fontTitle: '24px', // 제목, 골든벨 문제(Galmuri11 2배)
  fontHuge: '36px', // 선생님 골든벨 문제·남은 시간(프로젝터, Galmuri11 3배)
  lineHeight: '1.5', // 12px × 1.5 = 18px(정수 픽셀)
  gap: '12px',
  gapSmall: '6px',
  margin: '16px',
  panelWidth: '540px',
  startWidth: '860px', // 첫 화면 카드 너비의 상한(캐릭터 8개가 한 줄에 들어가는 너비)
  fieldMin: '200px', // 첫 화면 입력 칸 하나의 가장 작은 너비(넓으면 한 줄에 나란히)
  mapPanelWidth: '1160px', // 큰 지도 창 너비의 상한
  // 9-slice 테두리 두께(도트 4개 × 3배, docs/art.md). 안쪽 여백은 따로 준다.
  skinBorder: '12px',
  skinBorderSmall: '9px', // panel-dark, bar(도트 3개 × 3배)
  panelPad: '6px 9px', // 패널 테두리 안쪽 여백
  buttonPad: '3px 9px', // 단추 테두리 안쪽 여백
  buttonPadSmall: '0 3px',
  touch: '48px', // 단추 높이의 아래 한도(누르기 44px 이상)
  inputPad: '3px 6px',
  hudPad: '3px 6px',
  hudGap: '3px',
  hudGapWide: '6px',
  dangerGap: '18px', // 선생님 단추에서 되돌릴 수 없는 단추(2부 열기 등)를 떨어뜨리는 간격
  badgePad: '0 6px',
  badgeBorder: '3px', // 작은 표시(예시 문제, 문제 번호)의 외곽선(도트 1개 × 3배)
  joystickZone: '50%', // 조이스틱 영역: 화면 왼쪽에서 이 너비(높이는 전체)
  joystick: '132px',
  joystickKnob: '56px',
  joystickLine: '3px',
  actionButton: '96px',
  cctvWidth: '330px',
  rowPad: '6px 6px',
  rowLine: '3px', // CCTV 목록·순위 줄 사이 선
  stateBar: '6px', // CCTV 줄 왼쪽의 하는 일 띠
  codeSpacing: '6px', // 숫자 자물쇠 번호 칸 사이
  // 첫 화면 캐릭터 고르기: 시트(90×240)의 앞모습 서기 프레임(30×60, 왼쪽에서 30)을 2배로 보인다.
  charFaceWidth: '60px',
  charFaceHeight: '120px',
  charSheetSize: '180px 480px',
  charFacePosition: '-60px 0',
  charMin: '84px', // 캐릭터 단추 하나의 가장 작은 너비(테두리 포함)
  charRow: '714px', // 캐릭터 고르기가 이 너비 이상이면 8개 한 줄, 아니면 4개씩(84px × 8 + 6px × 7)
  // 얼굴: 앞모습 서기 프레임의 머리 부분(위 26도트)을 2배로
  faceWidth: '60px',
  faceHeight: '52px',
  // 가진 물건 칸(slot 그림, 안쪽 36px). 아이콘 30×30을 2배(60px)로 칸 테두리에 겹쳐 놓는다.
  slotInner: '36px',
  slotIcon: '60px',
  slotIconOffset: '-12px',
  // 대화상자의 사물 그림: 도트 2배, 틀에 안 들어가면 1배(src/ui/pictures.ts)
  pictureMaxWidth: '192px',
  pictureMaxHeight: '120px',
  // 시간 막대(bar 그림 8×10도트를 3배): 안쪽 높이 12px, 채움(bar-fill 6×8도트)은 막대 테두리 안쪽 1도트부터
  barHeight: '12px',
  barFillBorder: '6px',
  barFillHeight: '24px',
  barFillOffset: '-6px',
  // 골든벨 시상대
  podiumWidth: '96px',
  rankNo: '36px', // 순위 줄의 등수 칸 너비
  // 작은 그림(도트 그림을 정수 배로): 로고 81×64 2배, 반 상징·메달·확성기 30×30 1배, 하는 일 11×11 2배, 하트 9×8 2배, 힌트 카드 40×56 1배
  logoWidth: '162px',
  logoHeight: '128px',
  iconSize: '30px',
  statusIcon: '22px',
  lifeIcon: '18px',
  cardImageWidth: '40px',
  cardImageHeight: '56px',
  rankMin: '220px',
  // 보상 카드: 맞음 도장 24×24 2배, 반짝임 9×9 2배(4프레임 시트 36×9), 빛살 48×48 2배 위에 힌트 카드 40×56 1배
  stampSize: '48px',
  sparkleSize: '18px',
  sparkleSheet: '72px 18px',
  sparkleEnd: '-72px',
  burstSize: '96px',
  // 이야기·1부 완료 장면(256×171을 2배). 창 너비는 그림 + 테두리·여백
  storyWidth: '512px',
  storyPanelWidth: '560px', // 그림 512 + 외곽선 6 + 테두리 24 + 여백 18
  bannerWidth: '480px',
  bannerTop: '28%', // 학생 문제 카드에서 순위 한 칸의 가장 작은 너비(넓으면 여러 칸으로)
  podium1: '84px',
  podium2: '60px',
  podium3: '42px',
} as const;

/** 9-slice 그림(public/sprites/ui, docs/art.md "UI 그림")의 border-image 값. 도트 하나를 uiDot 픽셀로 그린다. */
const uiDot = 3;
const nine = (name: string, cut: number) => `url("/sprites/ui/${name}.png") ${cut} fill / ${cut * uiDot}px / 0 stretch`;
export const uiSkin = {
  panel: nine('panel', 4),
  panelDark: nine('panel-dark', 3),
  btn: nine('btn', 4),
  btnDown: nine('btn-down', 4),
  btnLight: nine('btn-light', 4),
  btnLightDown: nine('btn-light-down', 4),
  btnGold: nine('btn-gold', 4),
  btnGoldDown: nine('btn-gold-down', 4),
  btnOff: nine('btn-off', 4),
  slot: nine('slot', 4),
  bar: nine('bar', 3),
  barFill: `url("/sprites/ui/bar-fill.png") 2 fill / ${2 * uiDot}px / 0 stretch`,
  barFillWarn: `url("/sprites/ui/bar-fill-warn.png") 2 fill / ${2 * uiDot}px / 0 stretch`,
  barFillLow: `url("/sprites/ui/bar-fill-low.png") 2 fill / ${2 * uiDot}px / 0 stretch`,
  // 9-slice가 아닌 바탕 그림
  startImage: 'url("/sprites/ui/title-bg.png")', // 첫 화면 배경(256×171, 화면을 덮도록 키운다)
  megaphone: 'url("/sprites/ui/megaphone.png")', // 강당으로 모으기 안내, 가운데 알림
  trophy: 'url("/sprites/ui/trophy-icon.png")', // 합산 순위 제목
  stamp: 'url("/sprites/ui/stamp-correct.png")', // 보상 카드: 맞음 도장
  sparkle: 'url("/sprites/ui/sparkle.png")', // 보상 카드: 얻은 것 앞 반짝임(4프레임)
  burst: 'url("/sprites/ui/burst.png")', // 보상 카드: 힌트 카드 뒤 빛살
  hintCard: 'url("/sprites/ui/hintCard.png")',
  heartPlus: 'url("/sprites/ui/heart-plus.png")', // 하트 +1(보너스)
  story: 'url("/sprites/ui/story.png")', // 이야기 카드(입장 직후)
  finish: 'url("/sprites/ui/finish.png")', // 1부 완료
} as const;

/** 시간 막대 색이 바뀌는 남은 비율(넘으면 초록, 이하면 노랑, low 이하면 빨강) */
export const timeBar = { warn: 0.5, low: 0.2 } as const;

/**
 * 글꼴(게임 화면과 HTML에 함께 쓴다). Galmuri(SIL OFL, public/fonts, docs/art.md "글꼴").
 * src/ui/fonts.ts가 처음에 읽어 두고, 다 읽은 뒤 게임 화면을 시작한다. 못 읽으면 뒤의 시스템 글꼴로 보인다.
 */
const systemFonts = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
// 주소는 '/'로 시작한다(CSS 변수의 상대 주소는 빌드한 CSS 파일 기준으로 풀려 /assets/ 아래를 찾는다).
export const fontFiles = { Galmuri11: '/fonts/Galmuri11.woff2', Galmuri9: '/fonts/Galmuri9.woff2' } as const;
export const fontFamily = `Galmuri11, ${systemFonts}`;
export const fontFamilySmall = `Galmuri9, ${systemFonts}`;
/** 글꼴을 이 시간(ms) 안에 못 읽으면 기다리지 않고 시작한다. */
export const fontWaitMs = 4000;

export const alpha = {
  floorLine: 0.6,
  avatarShadow: 0.18,
  zone: 0.3, // 골든벨 답 구역
  zoneCorrect: 0.6, // 정답 공개: 정답 구역
  zoneDim: 0.08, // 정답 공개: 나머지 구역
  outAvatar: 0.4, // 골든벨에서 탈락한 학생
  openDoor: 0.25, // 연 문(지나갈 수 있음)
} as const;

/** 움직임 */
export const motion = {
  speed: 4, // 칸/초
  joystickDeadZone: 0.15,
  walkFps: 8, // 걷기 애니메이션 빠르기(프레임/초)
  facingKeep: 0.7, // 대각선으로 갈 때 지금 보는 쪽의 성분이 다른 쪽의 이 비율 이상이면 방향을 바꾸지 않는다(깜빡임 막기)
  remoteWalkGap: 3, // 다른 사람 아바타가 서버 위치와 이 거리(픽셀) 넘게 떨어져 있으면 걷는 중으로 본다
  remoteSmoothing: 90, // 다른 사람 아바타가 서버 위치를 따라가는 빠르기(ms, 작을수록 바로 따라감)
  gbFadeMs: 2000, // 골든벨 문제가 시작되면 다른 학생이 이 시간(ms) 동안 흐려지다 사라진다(학생 화면만)
  bannerMs: 4000, // 화면 가운데 큰 알림(2부 열림, 강당으로 모으기)이 보이는 시간(ms)
  mapMarkMs: 60000, // 미니맵에 2부 문을 표시해 두는 시간(ms)
} as const;

/** 미니맵(src/ui/minimap.ts, 캔버스에 그리므로 CSS 변수가 아니라 값을 바로 쓴다) */
export const minimap = {
  background: '#8a7f72', // 벽·바깥
  landmark: '#6582a0', // 강당 등 들어가지 않는 건물(지붕 색)
  door: '#e3e1db', // 장소 사이 문(지나가는 곳)
  lockedAlpha: 0.35, // 아직 열리지 않은 2부 장소
  label: '#2e2a26',
  landmarkLabel: '#ffffff', // 지붕 위에 적는 건물 이름
  lockedLabel: '#5b544c',
  labelFont: '12px',
  me: '#e2433b', // 내 위치 점
  meLine: '#ffffff',
  dot: 3, // 작은 지도의 점 반지름(CSS 픽셀)
  dotBig: 7,
  dotLine: 2,
  mark: '#f2b134', // 알림 표시(2부가 열린 문, 모이는 강당)의 테
  markLine: 3, // 그 테의 두께(CSS 픽셀)
  markPad: 2, // 그 테를 사물 밖으로 띄우는 거리(CSS 픽셀)
  smallWidth: 200, // 작은 지도 너비(CSS 픽셀). 높이는 맵 비율대로
  bigWidth: 1100, // 큰 지도 너비의 상한(화면이 좁으면 화면에 맞춤)
} as const;

/** uiColor, uiSize, uiSkin(--df-skin-이름), 글꼴을 CSS 변수(--df-이름)로 넣는다. */
export function applyCssTheme(root: HTMLElement = document.documentElement) {
  const entries: [string, string][] = [
    ...Object.entries(uiColor),
    ...Object.entries(uiSize),
    ...Object.entries(uiSkin).map(([k, v]): [string, string] => [`skin-${k}`, v]),
    ['fontFamily', fontFamily],
    ['fontFamilySmall', fontFamilySmall],
  ];
  for (const [key, value] of entries) {
    root.style.setProperty(`--df-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, value);
  }
}
