import { fontFiles, fontWaitMs } from '../theme';

/**
 * 도트 글꼴(Galmuri)을 읽어 문서에 넣는다. 게임 화면(Phaser)의 글자는 만들 때의 글꼴로 그려지므로 이것을 기다린 뒤 장면을 시작한다.
 * 못 읽거나 fontWaitMs가 지나면 기다리지 않는다(글자는 시스템 글꼴로 보인다).
 */
export async function loadFonts(): Promise<void> {
  const loads = Object.entries(fontFiles).map(async ([family, file]) => {
    const face = new FontFace(family, `url("${file}") format("woff2")`, { display: 'block' });
    document.fonts.add(face);
    await face.load();
  });
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, fontWaitMs));
  await Promise.race([Promise.allSettled(loads), timeout]);
}
