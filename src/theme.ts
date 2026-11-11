// 색과 크기는 여기에서만 정한다. 다른 파일은 이 값을 가져다 쓴다.
export const color = {
  background: 0xf4efe6,
  tile: 0xdfe8d2,
  tileAlt: 0xd3dfc4,
  tileLine: 0x9fb08c,
  avatar: 0x3b6ea8,
  avatarShadow: 0x000000,
  text: '#3a3a3a',
} as const;

export const size = {
  tile: 48, // 바닥 한 칸의 한 변(픽셀)
  tileLine: 1,
  avatarWidth: 28,
  avatarHeight: 36,
  avatarShadowWidth: 30,
  avatarShadowHeight: 12,
  hintFont: '18px',
  hintMargin: 16,
} as const;

export const alpha = {
  tileLine: 0.6,
  avatarShadow: 0.18,
} as const;
