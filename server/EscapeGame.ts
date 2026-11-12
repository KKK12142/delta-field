// 한 방의 방탈출 진행. 선생님이 고른 자료 파일(escape/*.yaml)로 미션을 채점하고 학생의 진행(Player)을 바꾼다.
// 모두에게 보여도 되는 것(미션 id, 잠긴 문, 아이템 이름, 힌트 카드 수)만 상태(ClassState.escape)에 넣는다.
import type { HintCard, MissionAnswerReply, MissionPressReply, MissionReward, MissionView } from '../shared/escape.ts';
import type { ClassState, Player } from '../shared/schema.ts';
import { OBJECT_MISSIONS, checkQuiz, quizFor, type EscapeSet, type Mission } from './escape.ts';

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
    replaceAll(e.pickups, [...set.missions.values()].filter((m) => m.type === 'pickup').map((m) => m.id));
    e.items.clear();
    for (const [id, name] of Object.entries(set.items)) e.items.set(id, name);
    e.labels.clear();
    for (const [id, name] of Object.entries(set.labels)) e.labels.set(id, name);
    e.hintTotal = set.hints.length;
    for (const p of this.state.players.values()) {
      p.items.clear();
      p.done.clear();
      p.hints.clear();
      p.pressed.clear();
      p.finished = false;
    }
    e.version += 1;
  }

  /** 지금 고른 자료 파일 이름(고르지 않았으면 '') */
  get file() {
    return this.set?.file ?? '';
  }

  /** 사물 id로 그 사물의 미션을 찾는다. */
  private missionOf(object: unknown): Mission | undefined {
    if (typeof object !== 'string') return undefined;
    const id = OBJECT_MISSIONS.get(object);
    return id ? this.set?.missions.get(id) : undefined;
  }

  /** 사물을 살펴본다. 단서·줍기·가져다주기·순서 맞추기는 이때 채점한다. 문제·숫자 자물쇠는 글만 보낸다(정답은 보내지 않는다). */
  open(p: Player, object: unknown): MissionView {
    if (!this.set) return { kind: 'none', text: NO_FILE };
    const m = this.missionOf(object);
    if (!m) return { kind: 'none', text: '살펴볼 것이 없습니다.' };
    if (p.done.includes(m.id)) {
      return { kind: 'done', text: m.done || (m.type === 'clue' ? m.text : m.type === 'exit' ? '이미 1부를 마쳤습니다.' : '이미 마쳤습니다.') };
    }
    if (m.requires && !p.items.includes(m.requires)) return { kind: 'locked', text: m.locked || '잠겨 있습니다.' };
    switch (m.type) {
      case 'clue':
      case 'pickup':
        return { kind: 'clue', text: m.text, reward: this.finish(p, m) };
      case 'deliver':
        return this.deliver(p, m);
      case 'order': {
        const pressed = this.pressedOf(p, m);
        const at = pressed.indexOf(object as string);
        return { kind: 'order', text: m.texts[object as string] ?? '', step: pressed.length, total: m.order.length, pressedAt: at + 1 };
      }
      case 'code':
        return { kind: 'code', text: m.text || '번호를 눌러 엽니다.', digits: m.code.length, example: m.example };
    }
    const q = quizFor(m, p.classGroup);
    // 문제가 없는 문·출구는 살펴보면 바로 열리거나 나간다.
    if (!q) return { kind: 'clue', text: m.text, reward: this.finish(p, m) };
    return { kind: 'quiz', question: q.question, choices: q.choices, example: m.example, mission: m.type };
  }

  /** 가져다주기: 필요한 아이템을 모두 들고 왔으면 내려놓고 마친다. 모자라면 무엇을 가져와야 하는지 알린다. */
  private deliver(p: Player, m: Mission): MissionView {
    const names = m.needs.map((id) => this.set?.items[id] ?? id);
    const have = m.needs.filter((id) => p.items.includes(id)).length;
    if (have < m.needs.length) {
      const text = m.locked || `${names.join(', ')}을(를) 모두 가져와야 합니다.`;
      return { kind: 'locked', text: `${text} (가져온 것 ${have}/${m.needs.length})` };
    }
    replaceAll(p.items, p.items.filter((id) => !m.needs.includes(id)));
    return { kind: 'clue', text: m.text || `${names.join(', ')}을(를) 내려놓았습니다.`, reward: this.finish(p, m) };
  }

  /** 순서 맞추기: 이 미션의 사물 가운데 지금 시도에서 맞게 누른 것(누른 순서) */
  private pressedOf(p: Player, m: Mission): string[] {
    return [...p.pressed].filter((id) => m.order.includes(id));
  }

  /**
   * 순서 맞추기에서 사물을 누른다. 다음 차례의 사물이면 한 칸 나아가고, 아니면 처음부터 다시 한다. 마지막까지 맞히면 마친다.
   * 이미 맞게 누른 사물을 다시 누르면 아무 일도 없다(예전에는 다시 살펴본 첫째 사물이 틀린 것으로 쳐져 처음으로 돌아갔다).
   */
  press(p: Player, object: unknown): MissionPressReply {
    const m = this.missionOf(object);
    const refuse = (error: string): MissionPressReply => ({ step: 0, total: 0, wrong: false, reward: null, error });
    if (!this.set || !m || m.type !== 'order' || !m.order.includes(object as string)) return refuse('누를 수 있는 사물이 아닙니다.');
    if (p.done.includes(m.id)) return refuse('이미 마친 미션입니다.');
    if (m.requires && !p.items.includes(m.requires)) return refuse(m.locked || '잠겨 있습니다.');
    const id = object as string;
    const pressed = this.pressedOf(p, m);
    const total = m.order.length;
    if (pressed.includes(id)) return { step: pressed.length, total, wrong: false, reward: null, error: null };
    const others = [...p.pressed].filter((x) => !m.order.includes(x));
    if (m.order[pressed.length] !== id) {
      replaceAll(p.pressed, others);
      return { step: 0, total, wrong: true, reward: null, error: null };
    }
    if (pressed.length + 1 < total) {
      p.pressed.push(id);
      return { step: pressed.length + 1, total, wrong: false, reward: null, error: null };
    }
    replaceAll(p.pressed, others);
    return { step: total, total, wrong: false, reward: this.finish(p, m), error: null };
  }

  /** 문제·숫자 자물쇠의 답을 채점한다. 맞으면 미션을 마치고 얻은 것을 돌려준다. 틀리면 다시 낼 수 있다. */
  answer(p: Player, object: unknown, answer: unknown): MissionAnswerReply {
    const m = this.missionOf(object);
    const q = m ? quizFor(m, p.classGroup) : null;
    if (!this.set || !m || (!q && m.type !== 'code')) return { correct: false, reward: null, error: '낼 수 있는 문제가 아닙니다.' };
    if (p.done.includes(m.id)) return { correct: false, reward: null, error: '이미 마친 미션입니다.' };
    if (m.requires && !p.items.includes(m.requires)) return { correct: false, reward: null, error: m.locked || '잠겨 있습니다.' };
    if (typeof answer !== 'string' || !answer.trim()) return { correct: false, reward: null, error: '답을 써서 냅니다.' };
    const right = m.type === 'code' ? answer.trim() === m.code : q !== null && checkQuiz(q, answer.slice(0, 100));
    if (!right) return { correct: false, reward: null, error: null };
    return { correct: true, reward: this.finish(p, m), error: null };
  }

  /** 미션을 마친다: 마친 미션에 넣고, 아이템·힌트 카드를 주고, 끝 지점(exit)이면 1부를 마친다. */
  private finish(p: Player, m: Mission): MissionReward {
    add(p.done, m.id);
    add(p.items, m.gives);
    add(p.hints, m.hint);
    if (m.type === 'exit') p.finished = true;
    return {
      item: m.gives ? (this.set?.items[m.gives] ?? '') : '',
      hint: this.set?.hints.find((h) => h.id === m.hint) ?? null,
      opened: m.type === 'open',
      finished: m.type === 'exit',
      picked: m.type === 'pickup',
      after: m.after,
    };
  }

  /** 이 학생이 얻은 힌트 카드(글 포함, 파일 순서) */
  hints(p: Player): HintCard[] {
    return (this.set?.hints ?? []).filter((h) => p.hints.includes(h.id));
  }
}
