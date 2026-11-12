// 한 방의 방탈출 진행. 선생님이 고른 자료 파일(escape/*.yaml)로 미션을 채점하고 학생의 진행(Player)을 바꾼다.
// 모두에게 보여도 되는 것(미션 id, 잠긴 문, 아이템 이름, 힌트 카드 수)만 상태(ClassState.escape)에 넣는다.
import type { HintCard, MissionAnswerReply, MissionReward, MissionView } from '../shared/escape.ts';
import type { ClassState, Player } from '../shared/schema.ts';
import { checkQuiz, quizFor, type EscapeSet, type Mission } from './escape.ts';

/** 목록이 달라졌을 때만 바꾼다(바뀐 값만 보내므로). */
function replaceAll(list: string[] & { clear(): void }, values: string[]) {
  if (list.length === values.length && values.every((v, i) => list[i] === v)) return;
  list.clear();
  list.push(...values);
}

const add = (list: string[] & { push(...v: string[]): number }, id: string) => {
  if (id && !list.includes(id)) list.push(id);
};

const NO_FILE = '선생님이 아직 방탈출 자료를 고르지 않았습니다.';

export class EscapeGame {
  private set: EscapeSet | null = null;
  private readonly state: ClassState;

  constructor(state: ClassState) {
    this.state = state;
  }

  get loaded() {
    return this.set !== null;
  }

  /** 자료 파일을 바꾸고 모든 사람의 방탈출 진행(물건, 마친 미션, 탈출, 힌트 카드)을 처음으로 돌린다. */
  load(set: EscapeSet) {
    this.set = set;
    const e = this.state.escape;
    e.file = set.file;
    e.title = set.title;
    replaceAll(e.missions, [...set.missions.keys()]);
    replaceAll(e.doors, [...set.missions.values()].filter((m) => m.type === 'open').map((m) => m.id));
    e.items.clear();
    for (const [id, name] of Object.entries(set.items)) e.items.set(id, name);
    e.hintTotal = set.hints.length;
    for (const p of this.state.players.values()) {
      this.restart(p);
      p.hints.clear();
    }
    e.version += 1;
  }

  /** 다시 하기: 물건, 마친 미션, 탈출을 처음으로(얻은 힌트 카드는 수첩에 남긴다) */
  restart(p: Player) {
    p.items.clear();
    p.done.clear();
    p.escaped = false;
  }

  private mission(id: unknown): Mission | undefined {
    return typeof id === 'string' ? this.set?.missions.get(id) : undefined;
  }

  /** 사물을 살펴본다. 단서는 이때 마친다. 문제는 글과 보기만 보낸다(정답은 보내지 않는다). */
  open(p: Player, id: unknown): MissionView {
    if (!this.set) return { kind: 'none', text: NO_FILE };
    const m = this.mission(id);
    if (!m) return { kind: 'none', text: '살펴볼 것이 없습니다.' };
    if (p.done.includes(m.id)) {
      return { kind: 'done', text: m.done || (m.type === 'clue' ? m.text : m.type === 'exit' ? '이미 탈출했습니다.' : '이미 마쳤습니다.') };
    }
    if (m.requires && !p.items.includes(m.requires)) return { kind: 'locked', text: m.locked || '잠겨 있습니다.' };
    if (m.type === 'clue') return { kind: 'clue', text: m.text, reward: this.finish(p, m) };
    const q = quizFor(m, p.classGroup);
    // 문제가 없는 문·출구는 살펴보면 바로 열리거나 나간다.
    if (!q) return { kind: 'clue', text: '', reward: this.finish(p, m) };
    return { kind: 'quiz', question: q.question, choices: q.choices, example: m.example, mission: m.type };
  }

  /** 문제의 답을 채점한다. 맞으면 미션을 마치고 얻은 것을 돌려준다. 틀리면 다시 낼 수 있다. */
  answer(p: Player, id: unknown, answer: unknown): MissionAnswerReply {
    const m = this.mission(id);
    const q = m ? quizFor(m, p.classGroup) : null;
    if (!this.set || !m || !q) return { correct: false, reward: null, error: '낼 수 있는 문제가 아닙니다.' };
    if (p.done.includes(m.id)) return { correct: false, reward: null, error: '이미 마친 미션입니다.' };
    if (m.requires && !p.items.includes(m.requires)) return { correct: false, reward: null, error: m.locked || '잠겨 있습니다.' };
    if (typeof answer !== 'string' || !answer.trim()) return { correct: false, reward: null, error: '답을 써서 냅니다.' };
    if (!checkQuiz(q, answer.slice(0, 100))) return { correct: false, reward: null, error: null };
    return { correct: true, reward: this.finish(p, m), error: null };
  }

  /** 미션을 마친다: 마친 미션에 넣고, 아이템·힌트 카드를 주고, 출구면 탈출한다. */
  private finish(p: Player, m: Mission): MissionReward {
    add(p.done, m.id);
    add(p.items, m.gives);
    add(p.hints, m.hint);
    if (m.type === 'exit') p.escaped = true;
    return {
      item: m.gives ? (this.set?.items[m.gives] ?? '') : '',
      hint: this.set?.hints.find((h) => h.id === m.hint) ?? null,
      opened: m.type === 'open',
      escaped: m.type === 'exit',
    };
  }

  /** 이 학생이 얻은 힌트 카드(글 포함, 파일 순서) */
  hints(p: Player): HintCard[] {
    return (this.set?.hints ?? []).filter((h) => p.hints.includes(h.id));
  }
}
