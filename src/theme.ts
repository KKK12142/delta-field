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
    partDoor: 0x6b4a33,
    auditoriumDoor: 0x7a3f3f,
  },
} as const;

/** 화면 위 안내·대화상자(HTML)에서 쓰는 색 */
export const uiColor = {
  text: '#2e2a26',
  textMuted: '#6b645c',
  panel: '#fffdf8',
  panelBorder: '#d8cfc0',
  backdrop: 'rgba(30, 26, 22, 0.45)',
  button: '#3b6ea8',
  buttonText: '#ffffff',
  buttonDisabled: '#b9c4d1',
  choice: '#f1ebe0',
  choiceHover: '#e6dccb',
  charSelected: '#3b6ea8', // 첫 화면에서 고른 캐릭터·반의 테두리
  correct: '#2e7d4f',
  wrong: '#b23b3b',
  badge: '#f2b134',
  badgeText: '#3a2a00',
  link: '#3b6ea8',
  status: '#b23b3b',
  joystickBase: 'rgba(59, 110, 168, 0.18)',
  joystickKnobColor: 'rgba(59, 110, 168, 0.75)',
  renderInfo: 'rgba(46, 42, 38, 0.78)', // ?fps=1 확인 표시 바탕
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
  labelFont: '15px',
  labelPad: 4, // 그림 위 이름표 바탕의 좌우 여백(픽셀)
  stepMarkFont: '22px', // 순서 맞추기 번호
  stepMarkPad: 6, // 번호 바탕의 여백(픽셀)
  nicknameFont: '14px',
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
  zoneLabelFont: '70px',
  zoneTextFont: '25px',
  zoneTextPad: 12,
  livesFont: '13px',
  livesStroke: 3, // 하트 테두리 두께(픽셀)
} as const;

/** 대화상자·안내 크기(CSS) */
export const uiSize = {
  font: '17px',
  fontSmall: '14px',
  fontTitle: '22px',
  gap: '12px',
  margin: '16px',
  radius: '12px',
  panelWidth: '520px',
  mapPanelWidth: '1160px', // 큰 지도 창 너비의 상한
  buttonPad: '10px 18px',
  joystickZone: '50%', // 조이스틱 영역: 화면 왼쪽에서 이 너비(높이는 전체)
  joystick: '132px',
  joystickKnob: '56px',
  actionButton: '96px',
  border: '1px',
  choiceBorder: '2px',
  hudPad: '8px 14px',
  hudGap: '2px',
  hudGapWide: '6px', // CCTV 목록에서 닉네임과 반 사이
  badgePad: '2px 10px',
  lineHeight: '1.6',
  buttonPadSmall: '6px 12px',
  cctvWidth: '300px',
  cctvRowPad: '8px 10px',
  gbQuestionFont: '20px',
  codeSpacing: '6px', // 숫자 자물쇠 번호 칸 사이
  // 첫 화면 캐릭터 고르기: 시트(90×240)의 앞모습 서기 프레임(30×60, 왼쪽에서 30)을 2배로 보인다.
  charFaceWidth: '60px',
  charFaceHeight: '120px',
  charSheetSize: '180px 480px',
  charFacePosition: '-60px 0',
  charMin: '72px', // 캐릭터 단추 하나의 가장 작은 너비
} as const;

/** 글꼴(게임 화면과 HTML에 함께 쓴다) */
export const fontFamily =
  'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

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
  labelFont: '13px',
  me: '#e2433b', // 내 위치 점
  meLine: '#ffffff',
  dot: 3, // 작은 지도의 점 반지름(CSS 픽셀)
  dotBig: 7,
  dotLine: 2,
  smallWidth: 200, // 작은 지도 너비(CSS 픽셀). 높이는 맵 비율대로
  bigWidth: 1100, // 큰 지도 너비의 상한(화면이 좁으면 화면에 맞춤)
} as const;

/** uiColor, uiSize를 CSS 변수(--df-이름)로 넣는다. */
export function applyCssTheme(root: HTMLElement = document.documentElement) {
  const entries: [string, string][] = [
    ...Object.entries(uiColor),
    ...Object.entries(uiSize),
    ['fontFamily', fontFamily],
  ];
  for (const [key, value] of entries) {
    root.style.setProperty(`--df-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, value);
  }
}
