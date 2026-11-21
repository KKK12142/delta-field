// 효과음(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md): 소리 파일 없이 WebAudio로 합성한다(음색·크기는 src/data/sfx.json).
// 브라우저는 사용자가 화면을 누르기 전에는 소리를 막으므로, 첫 터치·클릭·키 누름 때 AudioContext를 만들고 그 전의 소리는 내지 않는다.
// 켜기/끄기는 이 브라우저에 기억한다(localStorage df-sound, 못 쓰면 이번 화면에서만).
import data from '../data/sfx.json';

export type SoundName = keyof typeof data.sounds;

interface Tone {
  wave: string;
  f: number;
  f2?: number;
  t: number;
  d: number;
  v: number;
}

const STORE_KEY = 'df-sound';
const WAVES = new Set<OscillatorType>(['sine', 'square', 'triangle', 'sawtooth']);
/** 소리가 튀지 않게 켜는 시간(초) */
const ATTACK = 0.005;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** 합성 효과음. 화면마다 하나(sfx)를 함께 쓴다. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private on = readEnabled();
  private readonly lastAt = new Map<string, number>();
  private readonly listeners = new Set<(on: boolean) => void>();
  /** 확인용: 울린 소리 이름(최근 50개). 소리를 끈 동안·오디오가 아직 없을 때는 넣지 않는다. */
  readonly played: string[] = [];
  /** 확인용: 울리려 했던 소리 이름(최근 50개, 꺼짐·오디오 없음과 상관없이) */
  readonly requested: string[] = [];

  constructor() {
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  get enabled() {
    return this.on;
  }

  /** 오디오가 시작되었는지(첫 입력 뒤) */
  get started() {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** 켜기·끄기. 이 브라우저에 기억한다. */
  setEnabled(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
    } catch {
      // 저장하지 못해도 이번 화면에서는 따른다.
    }
    for (const l of this.listeners) l(on);
  }

  onChange(listener: (on: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 소리 하나를 울린다. 꺼져 있거나, 아직 사용자가 화면을 누르지 않았거나, 같은 소리를 방금(gap) 울렸으면 아무것도 하지 않는다. */
  play(name: SoundName) {
    push(this.requested, name);
    if (!this.on || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const sound = data.sounds[name] as { gap: number; tones: Tone[] } | undefined;
    if (!sound) return;
    const now = performance.now();
    if (now - (this.lastAt.get(name) ?? -Infinity) < sound.gap) return;
    this.lastAt.set(name, now);
    push(this.played, name);
    const t0 = this.ctx.currentTime + 0.01;
    for (const tone of sound.tones) this.tone(tone, t0);
  }

  private tone(tone: Tone, t0: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = t0 + tone.t;
    const end = start + tone.d;
    const osc = ctx.createOscillator();
    osc.type = WAVES.has(tone.wave as OscillatorType) ? (tone.wave as OscillatorType) : 'sine';
    osc.frequency.setValueAtTime(tone.f, start);
    if (tone.f2) osc.frequency.exponentialRampToValueAtTime(tone.f2, end);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.v), start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  /** 첫 입력 때 오디오를 만들거나 깨운다. */
  private unlock() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = data.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // 오디오를 쓸 수 없는 브라우저면 소리 없이 둔다.
    }
  }
}

function push(list: string[], name: string) {
  list.push(name);
  if (list.length > 50) list.shift();
}

/** 화면 전체가 함께 쓰는 효과음 */
export const sfx = new Sfx();
