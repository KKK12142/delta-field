// 선생님 창에서 바로 낸 골든벨 문제(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// 방의 메모리에만 두고(파일·상태에 남기지 않음) 문제 파일과 같은 QuestionSet 꼴로 내어 준다. 정답은 서버만 갖는다.
import { QUICK_FILE, checkQuickQuestion, checkQuickSet, type QuickQuestion } from '../shared/quickQuestions.ts';
import type { GbQuestion, QuestionSet } from './questions.ts';

const toGb = (q: QuickQuestion): GbQuestion => ({ ...q, choices: [...q.choices], answers: [...q.answers], nonsense: false });

export class QuickQuestions {
  private set: QuestionSet | null = null;

  /** 선생님이 보낸 묶음을 확인해 둔다(앞의 묶음은 바뀐다). 틀리면 까닭 글 */
  store(message: unknown): { count: number } | string {
    const r = checkQuickSet(message);
    if (Array.isArray(r)) return r.slice(0, 5).join('\n');
    this.set = { title: r.title, questions: r.questions.map(toGb) };
    return { count: r.questions.length };
  }

  /** 문제 파일 이름이 QUICK_FILE이면 바로 낸 묶음의 복사본(즉석 문제를 끼워도 묶음이 바뀌지 않게), 아니면 undefined. 묶음이 없으면 까닭 글 */
  read(file: unknown): QuestionSet | string | undefined {
    if (file !== QUICK_FILE) return undefined;
    if (!this.set) return '바로 낸 문제가 없습니다. 바로 내기 창에서 문제를 다시 보냅니다.';
    return { title: this.set.title, questions: this.set.questions.map((q) => ({ ...q })) };
  }

  /** 즉석 문제 하나를 확인한다. 틀리면 까닭 글 */
  one(raw: unknown): GbQuestion | string {
    const r = checkQuickQuestion(raw);
    return typeof r === 'string' ? r : toGb(r);
  }
}
