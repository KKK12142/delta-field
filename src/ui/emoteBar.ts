// 화면 아래 왼쪽 단추 줄: 소리 켜기/끄기와 이모트 8가지(키보드 1~8). 휴대폰은 이모트를 "이모트" 단추 하나로 접어 두고 누르면 편다.
// 이모트를 보내는 일과 말풍선은 src/three/emotes3d.ts가 맡는다. 겉모양은 src/ui/feature.css.
import { EMOTES, EMOTE_COOLDOWN_MS } from '../../shared/emotes.ts';
import type { Sfx } from '../audio/sfx';
import { el, uiRoot } from './dom';
import { isPhone, watchPhone } from './phone';
import { uiIcon } from './pictures';
import './feature.css';

export class EmoteBar {
  private readonly node = el('div', 'df-fx-bar');
  private readonly sound = el('button', 'df-button df-button-small df-button-light df-fx-sound');
  private readonly fold = el('button', 'df-button df-button-small df-button-light df-fx-fold', '이모트');
  private readonly list = el('div', 'df-fx-emotes');
  private readonly buttons: HTMLButtonElement[] = [];
  private coolUntil = 0;
  private coolTimer: ReturnType<typeof setTimeout> | undefined;
  /** 휴대폰에서 펼쳤는지 */
  private open = false;
  private readonly offSound: () => void;
  private readonly onResize = () => this.layout();

  /** onEmote: 이모트 단추를 눌렀을 때(이모트 id) */
  constructor(
    private readonly sfx: Sfx,
    onEmote: (id: string) => void,
  ) {
    watchPhone();
    this.node.setAttribute('aria-label', '소리와 이모트');
    this.sound.type = 'button';
    this.sound.addEventListener('click', () => {
      this.sound.blur();
      sfx.setEnabled(!sfx.enabled);
    });
    this.offSound = sfx.onChange(() => this.showSound());
    this.showSound();
    this.fold.type = 'button';
    this.fold.setAttribute('aria-expanded', 'false');
    this.fold.addEventListener('click', () => {
      this.fold.blur();
      this.open = !this.open;
      this.layout();
    });
    EMOTES.forEach((e, i) => {
      const b = el('button', 'df-button df-button-light df-fx-emote');
      b.type = 'button';
      b.title = `${e.label} (${i + 1})`;
      b.setAttribute('aria-label', `${e.label}, 키 ${i + 1}`);
      // 키 번호(작게) 다음에 글, 글이 없으면 도트 그림(하트)
      b.append(el('span', 'df-fx-key', String(i + 1)));
      if (e.text) b.append(el('span', 'df-fx-emote-text', e.text));
      else b.append(uiIcon('ui', e.icon, 'df-fx-emote-icon'));
      b.addEventListener('click', () => {
        b.blur();
        onEmote(e.id);
      });
      this.buttons.push(b);
      this.list.append(b);
    });
    this.node.append(this.sound, this.fold, this.list);
    uiRoot().append(this.node);
    window.addEventListener('resize', this.onResize);
    this.layout();
  }

  /** 보낸 뒤 재사용 대기 동안 단추를 흐리게 한다. 휴대폰이면 보낸 뒤 다시 접는다. */
  cooldown() {
    this.coolUntil = performance.now() + EMOTE_COOLDOWN_MS;
    this.node.classList.add('is-cooling');
    clearTimeout(this.coolTimer);
    this.coolTimer = setTimeout(() => this.node.classList.remove('is-cooling'), EMOTE_COOLDOWN_MS);
    if (isPhone() && this.open) {
      this.open = false;
      this.layout();
    }
  }

  /** 재사용 대기 중인지 */
  get cooling() {
    return performance.now() < this.coolUntil;
  }

  destroy() {
    clearTimeout(this.coolTimer);
    this.offSound();
    window.removeEventListener('resize', this.onResize);
    this.node.remove();
  }

  private showSound() {
    const on = this.sfx.enabled;
    this.sound.textContent = on ? '소리 켬' : '소리 끔';
    this.sound.setAttribute('aria-pressed', String(on));
    this.sound.title = on ? '누르면 효과음을 끕니다.' : '누르면 효과음을 켭니다.';
    this.sound.classList.toggle('is-off', !on);
  }

  private layout() {
    const phone = isPhone();
    this.fold.hidden = !phone;
    this.list.hidden = phone && !this.open;
    this.fold.setAttribute('aria-expanded', String(this.open));
    this.fold.textContent = this.open ? '이모트 닫기' : '이모트';
  }
}
