// 화면을 그리는 방식. 주소 끝에 ?render=dpr|free|css를 붙여 바꿔 볼 수 있다(기본 dpr, 교사가 기기에서 견줘 보려고 둠).
// - dpr: 캔버스를 기기 픽셀(devicePixelRatio) 해상도로 그린다. 캔버스가 canvasMax를 넘으면 그 안에 들도록 비율을 낮춘다.
//        따라가기 확대 배율은 캔버스 픽셀 기준 1/zoomSnap 단위로 맞춘다(도트 하나가 캔버스 픽셀 정수).
// - free: 화면(CSS) 픽셀로 그리고, 따라가기 확대 배율을 단위에 맞추지 않는다(도트 크기가 조금씩 고르지 않을 수 있다).
// - css: 화면(CSS) 픽셀로 그리고, 확대 배율을 화면 픽셀 기준 1/zoomSnap 단위로 맞춘다(전의 방식).
// ?fps=1이면 화면 왼쪽 아래에 방식, 비율, 배율, 캐릭터 키, fps를 작게 띄운다.
import type { Game } from 'phaser';
import { size } from './theme';
import { el, uiRoot } from './ui/dom';

export type RenderMode = 'dpr' | 'free' | 'css';

const params = new URLSearchParams(location.search);
const asked = params.get('render');
export const renderMode: RenderMode = asked === 'free' || asked === 'css' ? asked : 'dpr';

/** 따라가기 확대 배율을 1/zoomSnap 단위로 맞추는지 */
export const snapZoom = renderMode !== 'free' && size.zoomSnap > 0;

/** 캔버스 픽셀 / 화면(CSS) 픽셀. dpr 방식이 아니면 1 */
export function renderRatio(cssWidth: number, cssHeight: number) {
  const dpr = window.devicePixelRatio || 1;
  if (renderMode !== 'dpr') return 1;
  const long = Math.max(1, cssWidth, cssHeight);
  const short = Math.max(1, Math.min(cssWidth, cssHeight));
  const cap = Math.min(size.canvasMaxLong / long, size.canvasMaxShort / short);
  return Math.min(dpr, Math.max(1, cap));
}

/** ?fps=1일 때 확인 표시를 띄운다. */
export function showRenderInfo(game: Game) {
  if (params.get('fps') !== '1') return;
  const box = el('div', 'df-render-info');
  uiRoot().append(box);
  const update = () => {
    const ratio = 1 / game.scale.zoom;
    const cam = game.scene.getScenes(true)[0]?.cameras.main;
    const zoom = cam ? cam.zoom / ratio : 0;
    const view = zoom > 0 ? ` · 배율 ${zoom.toFixed(2)} · 캐릭터 ${Math.round(size.avatarHeight * zoom)}px` : '';
    box.textContent =
      `${renderMode} · DPR ${(window.devicePixelRatio || 1).toFixed(2)} · 캔버스 ×${ratio.toFixed(2)} ` +
      `${game.scale.width}×${game.scale.height}${view} · ${Math.round(game.loop.actualFps)}fps`;
  };
  update();
  setInterval(update, 500);
}
