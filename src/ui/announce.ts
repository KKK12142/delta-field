// 선생님 전체 공지: 보내는 창(선생님)과 화면 가운데 알림(모두). 알림은 장면을 옮겨도 이어지게 main.ts에서 한 번 만든다.
import { MAX_ANNOUNCE } from '../../shared/protocol.ts';
import type { Net } from '../net/connection';
import { motion } from '../theme';
import type { Dialog } from './dialog';
import { el, uiRoot } from './dom';

/** 화면 가운데 공지(이어 하기 안내에도 쓴다). 겉모양은 2부 열림·강당으로 모으기 알림(df-banner)과 같고, 누르면 바로 닫힌다. */
export class AnnounceBanner {
  private readonly node = el('div', 'df-banner df-announce');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.node.hidden = true;
    this.node.setAttribute('role', 'status');
    this.node.addEventListener('click', () => this.hide());
    uiRoot().append(this.node);
  }

  /** 글은 textContent로 넣는다(HTML로 읽지 않음). */
  show(text: string, title = '선생님 공지') {
    this.node.replaceChildren(el('strong', 'df-banner-title', title), el('span', 'df-banner-text', text));
    this.node.title = '누르면 닫힙니다.';
    // 그사이 뜬 대화상자·안내보다 위에 보이게 맨 뒤로 옮긴다.
    uiRoot().append(this.node);
    this.node.hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), motion.announceMs);
  }

  hide() {
    clearTimeout(this.timer);
    this.node.hidden = true;
  }
}

/** 선생님: 공지 글을 쓰고 보낸다. 서버가 거절하면 까닭을 창에 적는다. */
export function askAnnounce(dialog: Dialog, net: Net): Promise<boolean> {
  return dialog.write(
    '전체 공지',
    `모든 학생과 선생님 화면 가운데에 ${motion.announceMs / 1000}초 동안 보입니다. 지금 들어와 있는 사람만 봅니다.`,
    MAX_ANNOUNCE,
    '보내기',
    async (text) => {
      try {
        return (await net.announce(text)).error;
      } catch {
        return '서버에서 답을 받지 못했습니다. 잠시 뒤 다시 보냅니다.';
      }
    },
  );
}
