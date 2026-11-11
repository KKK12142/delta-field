// 가짜 학생(봇). Node에서 Colyseus SDK로 서버에 붙어 화면처럼 위치와 진행 상태를 보낸다.
// scripts/loadtest.mjs(35명 시험)와 scripts/bots.mjs(선생님 방에 봇만 넣기)가 함께 쓴다.
import goldenbellMap from '../../src/data/goldenbell.json' with { type: 'json' };
import school from '../../src/data/school.json' with { type: 'json' };
import characters from '../../src/data/characters.json' with { type: 'json' };
import { isFloor } from '../../src/data/room.ts';
import { activeZones } from '../../shared/goldenbell.ts';
import { CLASS_GROUPS, MOVE_INTERVAL_MS } from '../../shared/protocol.ts';
import { motion } from '../../src/theme.ts';

// 봇이 받는 데이터 양을 세려고, SDK를 불러오기 전에 WebSocket을 감싼다.
let received = 0;
const NativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class extends NativeWebSocket {
  constructor(...args) {
    super(...args);
    this.addEventListener('message', (e) => {
      received += e.data?.byteLength ?? e.data?.size ?? e.data?.length ?? 0;
    });
  }
};
const { Client } = await import('@colyseus/sdk');

/** 이 프로세스의 봇이 지금까지 받은 데이터(바이트) */
export const bytesIn = () => received;

const randomIn = (col, row, w, h) => ({ col: col + Math.random() * w, row: row + Math.random() * h });
/** 학교 맵에서 사물이 없는 바닥 칸 [열, 행] */
const covered = (c, r) => school.objects.some((o) => c >= o.col && c < o.col + o.w && r >= o.row && r < o.row + o.h);
const floorTiles = school.layout.flatMap((line, r) => [...line].flatMap((ch, c) => (isFloor(ch) && !covered(c, r) ? [[c, r]] : [])));
/** 학교 맵의 걸을 수 있는 바닥 칸 아무 데나. 봇은 그 자리로 곧장 가며 벽과 문을 따지지 않는다(서버도 따지지 않는다). */
const randomSchool = () => {
  const [c, r] = floorTiles[Math.floor(Math.random() * floorTiles.length)];
  return randomIn(c + 0.2, r + 0.2, 0.6, 0.6);
};

/** 단답형 문제에 봇이 내는 답(아무거나) */
const BOT_ANSWERS = ['1', '2', '모름', '정답'];

export class Bot {
  constructor(i, gameUrl) {
    this.gameUrl = gameUrl;
    this.nickname = `봇${String(i + 1).padStart(2, '0')}`;
    this.character = characters[i % characters.length].id;
    // 반은 번갈아 고른다(shared/protocol.ts CLASS_GROUPS).
    this.classGroup = CLASS_GROUPS[i % CLASS_GROUPS.length].id;
    this.map = 'school';
    this.pos = randomIn(school.start.col - 1.5, school.start.row - 1.5, 3, 1.5);
    this.target = { ...this.pos };
    this.wander = false;
    this.answered = -1;
    this.sent = 0;
    this.pings = [];
  }

  async join(code) {
    const t0 = performance.now();
    this.room = await new Client(this.gameUrl).joinById(code, { nickname: this.nickname, character: this.character, classGroup: this.classGroup });
    this.joinMs = performance.now() - t0;
    this.room.send('move', { ...this.pos, map: this.map });
  }

  me() {
    return this.room?.state.players?.get(this.room.sessionId);
  }

  /** 목표로 한 걸음. 서 있으면 보내지 않는다(실제 화면과 같다). */
  step(dt) {
    const me = this.me();
    if (!me) return;
    if (me.map !== this.map) {
      // 서버가 맵을 옮겼으면 서버가 세워 준 자리에서 다시 시작한다.
      this.map = me.map;
      this.pos = { col: me.col, row: me.row };
      this.target = { ...this.pos };
      this.answered = -1;
    }
    if (this.map === 'goldenbell') {
      const gb = this.room.state.goldenbell;
      if (gb.phase === 'question' && this.answered !== gb.index) {
        this.answered = gb.index;
        if (gb.type === 'short') {
          // 단답형은 걸어가지 않고 아무 답이나 하나 낸다(선생님 창에 답 묶음이 몇 개 생기게).
          this.room.send('gbSubmit', { text: BOT_ANSWERS[Math.floor(Math.random() * BOT_ANSWERS.length)] });
        } else {
          const zones = activeZones(goldenbellMap.zones, gb.type, gb.choices.length);
          const z = zones[Math.floor(Math.random() * zones.length)];
          this.target = randomIn(z.col + 0.6, z.row + 0.6, z.w - 1.2, z.h - 1.2);
        }
      }
    } else if (this.wander && Math.hypot(this.target.col - this.pos.col, this.target.row - this.pos.row) < 0.05) {
      this.target = randomSchool();
    }
    const dx = this.target.col - this.pos.col;
    const dy = this.target.row - this.pos.row;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const s = Math.min(d, motion.speed * dt);
    this.pos = { col: this.pos.col + (dx / d) * s, row: this.pos.row + (dy / d) * s };
    this.room.send('move', { ...this.pos, map: this.map });
    this.sent++;
  }

  /** 학교 맵에서 가끔 사물을 살펴보는 것처럼 진행 상태를 보낸다(CCTV에 보인다). */
  sendStatus() {
    const pick = [
      { activity: '', object: '' },
      { activity: 'look', object: 'blackboard' },
      { activity: 'quiz', object: 'teacher-desk' },
    ][Math.floor(Math.random() * 3)];
    this.room.send('status', { ...pick, items: [], done: Math.random() < 0.5 ? ['blackboard'] : [], escaped: false });
  }

  ping() {
    this.room.ping((ms) => this.pings.push(ms));
  }
}


/** 봇들을 MOVE_INTERVAL_MS마다 한 걸음씩, 1초마다 가끔 진행 상태를 보내게 한다. 멈추는 함수를 돌려준다. */
export function runBots(bots) {
  const loop = setInterval(() => {
    for (const b of bots) b.step(MOVE_INTERVAL_MS / 1000);
  }, MOVE_INTERVAL_MS);
  const status = setInterval(() => {
    for (const b of bots) if (b.map === 'school' && Math.random() < 0.2) b.sendStatus();
  }, 1000);
  return () => {
    clearInterval(loop);
    clearInterval(status);
  };
}
