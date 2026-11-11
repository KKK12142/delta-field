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
    field: { fill: 0xd9c49c, alt: 0xd4bf96, line: null },
    wall: { top: 0xa59a8c, face: 0x8a7f72 },
    fence: { top: 0x7e8a68, face: 0x66714f },
  },
  avatar: 0x3b6ea8, // 나
  remoteAvatar: 0x8fa9c4, // 다른 학생
  teacherAvatar: 0xc0603a, // 선생님
  avatarShadow: 0x000000,
  highlight: 0xf2b134,
  label: '#3a3a3a',
  labelOnDark: '#ffffff',
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
  correct: '#2e7d4f',
  wrong: '#b23b3b',
  badge: '#f2b134',
  badgeText: '#3a2a00',
  link: '#3b6ea8',
  status: '#b23b3b',
  joystickBase: 'rgba(59, 110, 168, 0.18)',
  joystickKnobColor: 'rgba(59, 110, 168, 0.75)',
} as const;

/** 게임 화면 크기. 길이는 픽셀, 칸 좌표의 크기는 칸 단위 */
export const size = {
  tile: 48, // 바닥 한 칸의 한 변(픽셀)
  floorLine: 1,
  viewTiles: 12, // 내 아바타를 따라갈 때 화면 짧은 쪽에 보이는 칸 수쯤(확대 배율을 정한다)
  zoomSnap: 3, // 따라가기 확대 배율을 1/zoomSnap 단위로 맞춘다(3이면 1, 4/3, 5/3, 2…: 도트 3배 그림이 고르게 보임). 0이면 맞추지 않는다
  wallFace: 18, // 벽 앞면 높이(픽셀). 아래가 바닥인 벽 칸의 아래쪽을 앞면으로 칠한다. 칸 전체(48)로 하면 그 벽 칸이 통째로 앞면이 된다
  highlightLine: 3,
  avatarWidth: 26,
  avatarHeight: 34,
  avatarShadowWidth: 28,
  avatarShadowHeight: 11,
  avatarFeet: 0.3, // 발밑 충돌 반경(칸)
  reach: 0.8, // 사물과 이 거리(칸) 안이면 살펴볼 수 있다
  spawnSpread: 1.5, // 시작 위치를 이 거리(칸) 안에서 흩어 놓는다
  labelFont: '15px',
  nicknameFont: '14px',
  nicknameGap: 6,
  textResolution: 2, // 아바타 글자를 이 배율로 그려 확대해도 덜 흐리게 한다
  viewMargin: 0.92, // 맵 전체를 화면에 맞출 때(골든벨, CCTV 전체 보기) 남기는 비율
  zoomMin: 0.15,
  zoomMax: 2,
  reserveTop: 100, // 위쪽 안내 자리(픽셀)
  // CCTV 모드
  tagFont: '12px',
  tagPadX: 5,
  tagPadY: 2,
  tagGap: 3, // 닉네임과 지금 하는 일 표시 사이(픽셀)
  followLerp: 0.15, // 화면이 따라가는 아바타(나, CCTV로 고른 학생)를 쫓는 빠르기(0~1, 클수록 바로)
  cctvMarkScale: 0.8, // CCTV 전체 보기에서 학생 아바타·글이 적어도 이 확대 배율일 때만큼 크게 보이게 키운다
  pickRadius: 30, // 학생을 누를 때 아바타 몸통 가운데에서 이 거리(화면 픽셀) 안이면 그 학생을 고른다
  // 골든벨
  reserveGap: 12, // 문제 카드와 지도 사이(픽셀)
  zoneLabelFont: '56px',
  zoneTextFont: '20px',
  zoneTextPad: 10,
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
  buttonPad: '10px 18px',
  joystickZone: '50%', // 조이스틱 영역: 화면 왼쪽에서 이 너비(높이는 전체)
  joystick: '132px',
  joystickKnob: '56px',
  actionButton: '96px',
  border: '1px',
  choiceBorder: '2px',
  hudPad: '8px 14px',
  hudGap: '2px',
  badgePad: '2px 10px',
  lineHeight: '1.6',
  buttonPadSmall: '6px 12px',
  cctvWidth: '300px',
  cctvRowPad: '8px 10px',
  gbQuestionFont: '20px',
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
  remoteSmoothing: 90, // 다른 사람 아바타가 서버 위치를 따라가는 빠르기(ms, 작을수록 바로 따라감)
  gbFadeMs: 2000, // 골든벨 문제가 시작되면 다른 학생이 이 시간(ms) 동안 흐려지다 사라진다(학생 화면만)
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
