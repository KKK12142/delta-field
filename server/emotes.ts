// 이모트 전달(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md). 상태에 남기지 않고 같은 맵의 접속자에게 한 번 보낸다.
// 한 사람의 재사용 대기와 1분 상한을 지키고, 골든벨 문제를 푸는 중에는 학생 이모트를 다른 학생에게 보내지 않는다(남 따라가기 방지).
import type { Client } from '@colyseus/core';
import { EMOTE_COOLDOWN_MS, EMOTE_IDS, EMOTE_PER_MINUTE, type EmoteBroadcast, type EmoteMessage } from '../shared/emotes.ts';
import type { ClassState } from '../shared/schema.ts';

const MINUTE_MS = 60_000;

export class EmoteRelay {
  /** 접속 id → 최근 1분 안에 보낸 시각들(ms) */
  private readonly sent = new Map<string, number[]>();
  /** 이모트를 받겠다고 알린 접속 id(3D 화면). 2D 화면과 봇에게는 보내지 않는다(받는 곳이 없다). */
  private readonly listeners = new Set<string>();

  private readonly state: ClassState;
  private readonly clients: () => Iterable<Client>;
  private readonly now: () => number;

  constructor(state: ClassState, clients: () => Iterable<Client>, now: () => number = Date.now) {
    this.state = state;
    this.clients = clients;
    this.now = now;
  }

  /** 이 접속이 이모트를 받는다('emoteListen'). */
  listen(sessionId: string) {
    this.listeners.add(sessionId);
  }

  /** 받은 이모트를 확인해 보낸다. 받지 않으면(모르는 이모트, 너무 잦음) 아무것도 보내지 않는다. 보냈으면 true */
  handle(client: Client, message: EmoteMessage): boolean {
    const sender = this.state.players.get(client.sessionId);
    const id = typeof message?.id === 'string' ? message.id : '';
    if (!sender || !EMOTE_IDS.has(id)) return false;
    const now = this.now();
    const times = (this.sent.get(client.sessionId) ?? []).filter((t) => now - t < MINUTE_MS);
    if ((times.length && now - times[times.length - 1] < EMOTE_COOLDOWN_MS) || times.length >= EMOTE_PER_MINUTE) {
      this.sent.set(client.sessionId, times);
      return false;
    }
    times.push(now);
    this.sent.set(client.sessionId, times);
    const gb = this.state.goldenbell;
    // 골든벨 문제를 푸는 중의 학생 이모트는 보낸 학생 자신과 선생님에게만
    const hush = sender.role === 'student' && sender.map === 'goldenbell' && gb.phase === 'question';
    const out: EmoteBroadcast = { from: client.sessionId, id };
    for (const c of this.clients()) {
      const p = this.state.players.get(c.sessionId);
      if (!p || p.map !== sender.map || !this.listeners.has(c.sessionId)) continue;
      if (hush && c.sessionId !== client.sessionId && p.role !== 'teacher') continue;
      c.send('emote', out);
    }
    return true;
  }

  /** 나간 사람의 기록을 지운다. */
  forget(sessionId: string) {
    this.sent.delete(sessionId);
    this.listeners.delete(sessionId);
  }
}
