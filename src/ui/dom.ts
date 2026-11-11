// HTML 요소를 만드는 작은 도우미. 글은 늘 textContent로 넣는다.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function uiRoot(): HTMLElement {
  const root = document.getElementById('ui');
  if (!root) throw new Error('화면 요소 #ui를 찾지 못했습니다.');
  return root;
}

/** 터치로 조작하는 기기인지. 주소 끝에 ?touch=1을 붙이면 터치 조작 화면을 강제로 띄운다. */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).get('touch') === '1') return true;
  return matchMedia('(pointer: coarse)').matches;
}

/** 받침이 있으면 '을', 없으면 '를' */
export function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 === 0 ? '를' : '을';
}
