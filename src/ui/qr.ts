// 첫 화면 제목 오른쪽의 접속 QR 코드(교사 요청 2026-11-13). 내용은 지금 페이지 주소라 개발 서버·공유·클라우드 어디서나 그 주소다.
// qrcode-generator로 칸을 만들고 캔버스에 칸 하나 = 1픽셀로 그린 뒤, 정수 배율의 CSS 크기로 키워(pixelated) 흐려지지 않게 한다.
import qrcode from 'qrcode-generator';
import { qr as Q } from '../theme';
import { el } from './dom';
import { isPhone, watchPhone } from './phone';

/** 이 페이지로 들어오는 주소(끝에 /) */
export function entryUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/** QR 그림과 그 아래 작은 글(주소, 안내)을 담은 칸 */
export function accessQr(): HTMLElement {
  watchPhone();
  const url = entryUrl();
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const full = n + 2 * Q.margin;
  const canvas = el('canvas', 'df-qr-code');
  canvas.width = full;
  canvas.height = full;
  canvas.dataset.text = url;
  canvas.dataset.margin = String(Q.margin);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `접속 QR 코드: ${url}`);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = Q.light;
    ctx.fillRect(0, 0, full, full);
    ctx.fillStyle = Q.dark;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.isDark(r, c)) ctx.fillRect(c + Q.margin, r + Q.margin, 1, 1);
  }
  const cell = Math.max(1, Math.floor((isPhone() ? Q.sizePhone : Q.size) / full));
  canvas.style.width = canvas.style.height = `${cell * full}px`;
  const box = el('figure', 'df-qr');
  const caption = el('figcaption', 'df-qr-caption');
  caption.append(el('span', 'df-qr-host', window.location.host), el('span', 'df-qr-help', '휴대폰 카메라로 찍으면 들어옵니다.'));
  box.append(canvas, caption);
  return box;
}
