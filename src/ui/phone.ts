// 휴대폰 모양(교사 요청 2026-11-13): 화면 짧은 쪽이 screen.phoneShort 이하면 <html>에 is-phone, 세로면 is-portrait를 붙인다.
// 안내(src/ui/ui.css의 .is-phone 규칙)가 글자와 칸을 줄여 맵이 화면 절반 넘게 보이게 한다. 태블릿·PC 모양은 그대로다.
import { screen } from '../theme';

let watching = false;

/** 지금 휴대폰 크기인지 */
export function isPhone() {
  return Math.min(window.innerWidth, window.innerHeight) <= screen.phoneShort;
}

/** 창 크기가 바뀔 때마다 is-phone·is-portrait를 맞춘다(여러 번 불러도 한 번만 건다). */
export function watchPhone() {
  if (watching) return;
  watching = true;
  const apply = () => {
    const root = document.documentElement;
    root.classList.toggle('is-phone', isPhone());
    root.classList.toggle('is-portrait', window.innerHeight > window.innerWidth);
  };
  apply();
  window.addEventListener('resize', apply);
}
