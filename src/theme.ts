// 색과 크기는 여기에서만 정한다. 다른 파일과 CSS는 이 값을 가져다 쓴다.
// CSS(src/ui/ui.css)는 applyCssTheme()이 넣는 --df-* 변수만 쓴다.

/** 게임 화면(Phaser)에서 쓰는 색 */
export const color = {
  background: 0xf4efe6,
  floor: 0xe9e1d2,
  floorAlt: 0xe2d9c8,
  floorLine: 0xcfc3ad,
  wall: 0x8a7f72,
  wallTop: 0xa59a8c,
  avatar: 0x3b6ea8,
  avatarShadow: 0x000000,
  highlight: 0xf2b134,
  label: '#3a3a3a',
  labelOnDark: '#ffffff',
  nickname: '#24476e',
  // 사물 종류별 색(단순 도형 단계)
  object: {
    blackboard: 0x2f5d4a,
    teacherDesk: 0xa0714f,
    desk: 0xc79a6d,
    locker: 0x7d8fa3,
    door: 0x6b4a33,
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
  joystickBase: 'rgba(59, 110, 168, 0.18)',
  joystickKnobColor: 'rgba(59, 110, 168, 0.75)',
} as const;

/** 게임 화면 크기. 길이는 픽셀, 칸 좌표의 크기는 칸 단위 */
export const size = {
  tile: 48, // 바닥 한 칸의 한 변(픽셀)
  floorLine: 1,
  wallFace: 18, // 벽 앞면 높이(픽셀)
  highlightLine: 3,
  avatarWidth: 26,
  avatarHeight: 34,
  avatarShadowWidth: 28,
  avatarShadowHeight: 11,
  avatarFeet: 0.3, // 발밑 충돌 반경(칸)
  reach: 0.8, // 사물과 이 거리(칸) 안이면 살펴볼 수 있다
  labelFont: '15px',
  nicknameFont: '14px',
  nicknameGap: 6,
  viewMargin: 0.92, // 방을 화면에 맞출 때 남기는 비율
  zoomMin: 0.6,
  zoomMax: 2,
  reserveTop: 100, // 위쪽 안내 자리(픽셀)
  reserveBottomTouch: 150, // 터치 기기에서 조이스틱 자리(픽셀)
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
  joystick: '132px',
  joystickKnob: '56px',
  actionButton: '96px',
  border: '1px',
  choiceBorder: '2px',
  hudPad: '8px 14px',
  hudGap: '2px',
  badgePad: '2px 10px',
  lineHeight: '1.6',
} as const;

/** 글꼴(게임 화면과 HTML에 함께 쓴다) */
export const fontFamily =
  'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export const alpha = {
  floorLine: 0.6,
  avatarShadow: 0.18,
} as const;

/** 움직임 */
export const motion = {
  speed: 4, // 칸/초
  joystickDeadZone: 0.15,
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
