// 골든벨 화면에 보일 글을 서버 상태에서 만든다. 화면(HTML)은 이 글을 그대로 넣기만 한다.
import { GB_LIVES, GB_REVIVE_CORRECT, GB_REVIVE_LIVES, activeZones, zoneAt, type Zones } from '../../shared/goldenbell.ts';
import type { GoldenBell, Player } from '../../shared/schema.ts';

/** 학생에게 보이는 결과의 느낌(색) */
export type Tone = '' | 'good' | 'bad';

/** 위쪽 문제 카드 */
export interface CardView {
  head: string;
  question: string;
  /** 안내 또는 정답 */
  line: string;
  /** 내 결과(학생만) */
  result: string;
  tone: Tone;
  /** 끝났을 때의 순위(학생은 위쪽 몇 명만) */
  ranking: string[];
}

/** 학생 오른쪽 위: 내 목숨·점수·서 있는 곳 */
export interface MineView {
  lives: string;
  score: string;
  where: string;
}

/** 선생님 오른쪽 창 */
export interface PanelView {
  title: string;
  status: string;
  counts: string[];
  /** 다음 단추. null이면 감춘다. */
  next: { label: string; enabled: boolean } | null;
  ranking: string[];
}

/** 학생에게 보이는 순위 수 */
const RANKING_FOR_STUDENTS = 10;

const typeName = (type: string) => (type === 'ox' ? 'OX' : '객관식');

/** 정답을 사람이 읽는 글로: OX는 그대로, 객관식은 "2. 3 m/s²" */
function answerText(gb: GoldenBell) {
  if (gb.type !== 'choice') return gb.answer;
  const n = Number(gb.answer);
  return `${n}. ${gb.choices[n - 1] ?? ''}`;
}

function students(players: Player[]) {
  return players.filter((p) => p.role === 'student' && p.map === 'goldenbell');
}

/** 점수 순위. 같은 점수는 같은 등수, 같은 점수끼리는 닉네임 순 */
export function ranking(players: Player[]): string[] {
  const list = students(players).sort((a, b) => b.gbScore - a.gbScore || a.nickname.localeCompare(b.nickname, 'ko'));
  return list.map((p) => `${list.filter((q) => q.gbScore > p.gbScore).length + 1}위 ${p.nickname} ${p.gbScore}점`);
}

/** 한 문제의 내 결과 */
function resultOf(p: Player): { text: string; tone: Tone } {
  const outside = p.gbAnswer === '' ? '구역 밖에 있어 틀린 것으로 셉니다. ' : '';
  const left = GB_REVIVE_CORRECT - p.gbRevive;
  switch (p.gbResult) {
    case 'correct':
      return p.gbOut
        ? { text: `맞았습니다. ${left}문제를 더 맞히면 다시 살아납니다.`, tone: 'good' }
        : { text: '맞았습니다. 점수가 1점 올랐습니다.', tone: 'good' };
    case 'revived':
      return { text: `맞았습니다. 목숨 ${GB_REVIVE_LIVES}개로 다시 살아났습니다.`, tone: 'good' };
    case 'wrong':
      return p.gbOut
        ? { text: `${outside}틀렸습니다. ${left}문제를 맞히면 다시 살아납니다.`, tone: 'bad' }
        : { text: `${outside}틀렸습니다. 목숨이 ${p.gbLives}개 남았습니다.`, tone: 'bad' };
    case 'out':
      return {
        text: `${outside}틀렸습니다. 목숨을 모두 잃어 탈락했습니다. ${GB_REVIVE_CORRECT}문제를 맞히면 다시 살아납니다.`,
        tone: 'bad',
      };
    default:
      return { text: '', tone: '' };
  }
}

export function cardView(gb: GoldenBell, me: Player | undefined, players: Player[], teacher: boolean): CardView {
  const n = gb.index + 1;
  const view: CardView = { head: '', question: '', line: '', result: '', tone: '', ranking: [] };
  switch (gb.phase) {
    case 'ready':
      view.head = `골든벨 · ${gb.title}`;
      view.question = '선생님이 첫 문제를 내면 시작합니다.';
      view.line = 'OX 문제는 O·X 구역으로, 객관식은 1~4 구역으로 걸어가 섭니다. 시간이 끝날 때 서 있는 구역이 내 답입니다.';
      break;
    case 'question':
      view.head = `${n}/${gb.total}번 문제 · ${typeName(gb.type)} · 남은 시간 ${gb.timeLeft}초`;
      view.question = gb.question;
      view.line =
        gb.type === 'choice'
          ? '보기는 바닥의 번호 구역에 적혀 있습니다. 시간이 끝날 때 서 있는 구역이 내 답입니다.'
          : '시간이 끝날 때 서 있는 구역이 내 답입니다.';
      break;
    case 'reveal': {
      view.head = `${n}/${gb.total}번 문제 · 정답 공개`;
      view.question = gb.question;
      view.line = `정답: ${answerText(gb)}`;
      if (me && !teacher) {
        const r = resultOf(me);
        view.result = r.text;
        view.tone = r.tone;
      }
      break;
    }
    case 'end': {
      view.head = `골든벨 · ${gb.title}`;
      view.question = '골든벨이 끝났습니다.';
      if (me && !teacher) view.line = `내 점수 ${me.gbScore}점`;
      // 선생님은 오른쪽 창에서 모든 학생의 순위를 본다.
      if (!teacher) view.ranking = ranking(players).slice(0, RANKING_FOR_STUDENTS);
      break;
    }
  }
  return view;
}

export function mineView(gb: GoldenBell, me: Player, zones: Zones): MineView {
  const lives = me.gbOut
    ? `탈락 · ${GB_REVIVE_CORRECT - me.gbRevive}문제를 맞히면 다시 살아납니다`
    : `목숨 ${'♥'.repeat(me.gbLives)}${'♡'.repeat(Math.max(0, GB_LIVES - me.gbLives))}`;
  let where = '';
  if (gb.phase === 'question') {
    const zone = zoneAt(activeZones(zones, gb.type, gb.choices.length), me.col, me.row);
    where = `서 있는 곳: ${zone || '구역 밖'}`;
  }
  return { lives, score: `점수 ${me.gbScore}점`, where };
}

/** 선생님 창. 지금 구역마다 몇 명이 서 있는지, 정답 공개 뒤에는 맞힌 수와 남은 학생 수를 보인다. */
export function panelView(gb: GoldenBell, players: Player[], zones: Zones): PanelView {
  const list = students(players);
  const n = gb.index + 1;
  const view: PanelView = { title: `골든벨 · ${gb.title}`, status: '', counts: [], next: null, ranking: [] };
  const alive = list.filter((p) => !p.gbOut).length;
  const survivors = `남은 학생 ${alive}명 · 탈락 ${list.length - alive}명`;
  switch (gb.phase) {
    case 'ready':
      view.status = '학생이 모두 들어오면 첫 문제를 냅니다.';
      view.counts = [`학생 ${list.length}명`];
      view.next = { label: '첫 문제', enabled: true };
      break;
    case 'question': {
      view.status = `${n}/${gb.total}번 문제 · 남은 시간 ${gb.timeLeft}초`;
      const active = activeZones(zones, gb.type, gb.choices.length);
      const count = (label: string) => list.filter((p) => zoneAt(active, p.col, p.row) === label).length;
      view.counts = [
        [...active.map((z) => `${z.label} ${count(z.label)}명`), `구역 밖 ${count('')}명`].join(' · '),
        survivors,
      ];
      view.next = { label: '다음 문제', enabled: false };
      break;
    }
    case 'reveal': {
      view.status = `${n}/${gb.total}번 정답 공개 · 정답 ${answerText(gb)}`;
      const right = list.filter((p) => p.gbAnswer === gb.answer).length;
      view.counts = [`맞힌 학생 ${right}명 · 틀린 학생 ${list.length - right}명`, survivors];
      view.next = { label: n >= gb.total ? '결과 보기' : '다음 문제', enabled: true };
      break;
    }
    case 'end':
      view.status = '모든 문제를 마쳤습니다.';
      view.counts = [survivors];
      view.ranking = ranking(players);
      break;
  }
  return view;
}
