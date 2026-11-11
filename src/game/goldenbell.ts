// 골든벨 화면에 보일 글을 서버 상태에서 만든다. 화면(HTML)은 이 글을 그대로 넣기만 한다.
import {
  GB_LIVES,
  GB_REVIVE_CORRECT,
  GB_REVIVE_LIVES,
  activeZones,
  isCorrectResult,
  answerKey,
  zoneAt,
  type Zones,
} from '../../shared/goldenbell.ts';
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
  /** 단답형 답 칸을 보일지(학생, 푸는 중) */
  answerBox: boolean;
  /** 해설(정답 공개 때, 문제 파일에 있으면) */
  explain: string;
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
  /** 단답형 정답 공개 뒤 낸 답 묶음(같은 꼴의 답끼리) */
  answers: AnswerGroup[];
}

/** 단답형에서 같은 꼴(answerKey)로 낸 답 묶음 */
export interface AnswerGroup {
  /** 고른 꼴. 답을 내지 않은 묶음은 '' */
  key: string;
  /** 보일 글(가장 많이 쓴 표기) */
  text: string;
  names: string[];
  /** 'correct' 채점에서 정답 | 'accepted' 선생님이 인정 | 'wrong' 오답 | 'none' 내지 않음 */
  mark: 'correct' | 'accepted' | 'wrong' | 'none';
}

/** 머리 위에 띄우는 목숨: ♥♥♡. 탈락하면 해골 3개가 되고, 맞힐 때마다 하나씩 없어져 다 없어지면 다시 살아난다. */
export function livesTag(p: Player) {
  if (p.gbOut) return '💀'.repeat(Math.max(0, GB_REVIVE_CORRECT - p.gbRevive));
  return `${'♥'.repeat(p.gbLives)}${'♡'.repeat(Math.max(0, GB_LIVES - p.gbLives))}`;
}

/** 학생에게 보이는 순위 수 */
const RANKING_FOR_STUDENTS = 10;

const typeName = (type: string) => ({ ox: 'OX', choice: '객관식', short: '단답형' })[type] ?? type;

/** 정답을 사람이 읽는 글로: OX·단답형은 그대로, 객관식은 "2. 3 m/s²" */
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

/** 한 문제의 내 결과. 단답형은 내 답과, 선생님이 인정한 답이면 그것도 앞에 붙인다. */
function resultOf(gb: GoldenBell, p: Player): { text: string; tone: Tone } {
  const r = judgedText(p, gb.type === 'short' ? '답을 내지 않아 틀린 것으로 셉니다. ' : '구역 밖에 있어 틀린 것으로 셉니다. ');
  if (gb.type !== 'short' || !p.gbAnswer || !r.text) return r;
  const accepted = gb.accepted.includes(answerKey(p.gbAnswer)) ? '선생님이 정답으로 인정했습니다. ' : '';
  return { ...r, text: `내 답: ${p.gbAnswer} · ${accepted}${r.text}` };
}

function judgedText(p: Player, noAnswer: string): { text: string; tone: Tone } {
  const outside = p.gbAnswer === '' ? noAnswer : '';
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
  const view: CardView = { head: '', question: '', line: '', result: '', tone: '', ranking: [], answerBox: false, explain: '' };
  switch (gb.phase) {
    case 'ready':
      view.head = `골든벨 · ${gb.title}`;
      view.question = '선생님이 첫 문제를 내면 시작합니다.';
      view.line =
        'OX 문제는 O·X 구역으로, 객관식은 1~4 구역으로 걸어가 섭니다. 시간이 끝날 때 서 있는 구역이 내 답입니다. 단답형은 답을 글자로 써서 냅니다.';
      break;
    case 'question':
      view.head = `${n}/${gb.total}번 문제 · ${typeName(gb.type)} · 남은 시간 ${gb.timeLeft}초`;
      view.question = gb.question;
      view.line =
        gb.type === 'short'
          ? '답을 써서 냅니다. 시간 안에는 고쳐 낼 수 있고, 마지막에 낸 답으로 채점합니다.'
          : gb.type === 'choice'
            ? '보기는 바닥의 번호 구역에 적혀 있습니다. 시간이 끝날 때 서 있는 구역이 내 답입니다.'
            : '시간이 끝날 때 서 있는 구역이 내 답입니다.';
      view.answerBox = gb.type === 'short' && !teacher && me !== undefined;
      break;
    case 'reveal': {
      view.head = `${n}/${gb.total}번 문제 · 정답 공개`;
      view.question = gb.question;
      view.line = `정답: ${answerText(gb)}`;
      view.explain = gb.explain ? `해설: ${gb.explain}` : '';
      if (me && !teacher) {
        const r = resultOf(gb, me);
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
    ? `탈락 ${livesTag(me)} · ${GB_REVIVE_CORRECT - me.gbRevive}문제를 맞히면 다시 살아납니다`
    : `목숨 ${livesTag(me)}`;
  let where = '';
  if (gb.phase === 'question' && gb.type !== 'short') {
    const zone = zoneAt(activeZones(zones, gb.type, gb.choices.length), me.col, me.row);
    where = `서 있는 곳: ${zone || '구역 밖'}`;
  }
  return { lives, score: `점수 ${me.gbScore}점`, where };
}

/** 선생님 창. 지금 구역마다 몇 명이 서 있는지, 정답 공개 뒤에는 맞힌 수와 남은 학생 수를 보인다. */
export function panelView(gb: GoldenBell, players: Player[], zones: Zones): PanelView {
  const list = students(players);
  const n = gb.index + 1;
  const view: PanelView = { title: `골든벨 · ${gb.title}`, status: '', counts: [], next: null, ranking: [], answers: [] };
  const alive = list.filter((p) => !p.gbOut).length;
  const survivors = `남은 학생 ${alive}명 · 탈락 ${list.length - alive}명`;
  switch (gb.phase) {
    case 'ready':
      view.status = '학생이 모두 들어오면 첫 문제를 냅니다.';
      view.counts = [`학생 ${list.length}명`];
      view.next = { label: '첫 문제', enabled: true };
      break;
    case 'question': {
      view.status = `${n}/${gb.total}번 문제 · ${typeName(gb.type)} · 남은 시간 ${gb.timeLeft}초`;
      view.next = { label: '다음 문제', enabled: false };
      if (gb.type === 'short') {
        view.counts = [`답을 낸 학생 ${gb.submitted}명 · 내지 않은 학생 ${Math.max(0, list.length - gb.submitted)}명`, survivors];
        break;
      }
      const active = activeZones(zones, gb.type, gb.choices.length);
      const count = (label: string) => list.filter((p) => zoneAt(active, p.col, p.row) === label).length;
      view.counts = [
        [...active.map((z) => `${z.label} ${count(z.label)}명`), `구역 밖 ${count('')}명`].join(' · '),
        survivors,
      ];
      break;
    }
    case 'reveal': {
      view.status = `${n}/${gb.total}번 정답 공개 · 정답 ${answerText(gb)}`;
      const right = list.filter((p) => isCorrectResult(p.gbResult)).length;
      view.counts = [`맞힌 학생 ${right}명 · 틀린 학생 ${list.length - right}명`, survivors];
      view.next = { label: n >= gb.total ? '결과 보기' : '다음 문제', enabled: true };
      if (gb.type === 'short') view.answers = answerGroups(gb, list);
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

/**
 * 단답형 낸 답을 같은 꼴(answerKey)끼리 묶는다. 많이 낸 답부터, 답을 내지 않은 묶음은 맨 뒤에 둔다.
 * 같은 꼴이면 채점 결과도 같으므로 묶음 안 아무 학생의 결과로 정답 여부를 정한다.
 */
export function answerGroups(gb: GoldenBell, list: Player[]): AnswerGroup[] {
  const groups = new Map<string, Player[]>();
  for (const p of list) {
    const key = answerKey(p.gbAnswer);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const result: AnswerGroup[] = [...groups].map(([key, ps]) => {
    const names = ps.map((p) => p.nickname).sort((a, b) => a.localeCompare(b, 'ko'));
    if (!key) return { key, text: '(답을 내지 않음)', names, mark: 'none' };
    const mark = gb.accepted.includes(key) ? 'accepted' : isCorrectResult(ps[0].gbResult) ? 'correct' : 'wrong';
    return { key, text: mostCommon(ps.map((p) => p.gbAnswer)), names, mark };
  });
  return result.sort((a, b) => Number(a.mark === 'none') - Number(b.mark === 'none') || b.names.length - a.names.length);
}

function mostCommon(texts: string[]) {
  const count = new Map<string, number>();
  for (const t of texts) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0][0];
}
