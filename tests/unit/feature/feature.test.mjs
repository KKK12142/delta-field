// 이모트·효과음·바로 문제 내기의 규칙 확인(design/quick-specs/emote-sfx-quick-questions-2026-11-22.md).
// 실행: pnpm test:unit (Node 내장 node:test, 새 패키지 없음). 서버·공용 코드를 그대로 불러 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmoteRelay } from '../../../server/emotes.ts';
import { QuickQuestions } from '../../../server/quickQuestions.ts';
import { EMOTES, EMOTE_COOLDOWN_MS, EMOTE_PER_MINUTE } from '../../../shared/emotes.ts';
import { QUICK_FILE, QUICK_MAX_QUESTIONS, checkQuickSet, parsePaste, splitAnswers, splitChoices, toPasteLine } from '../../../shared/quickQuestions.ts';
import { matchAnswer } from '../../../shared/goldenbell.ts';
import { gbSounds, miniSounds } from '../../../src/audio/soundRules.ts';
import { GOLD_POINTS } from '../../../shared/minigame.ts';

// ---- 이모트 서버 ----

/** 가짜 방: 접속 id → {role, map}, 보낸 메시지를 모은다. */
function fakeRoom(people, phase = '') {
  const players = new Map(Object.entries(people).map(([id, p]) => [id, { ...p }]));
  const state = { players, goldenbell: { phase } };
  const inbox = Object.fromEntries(Object.keys(people).map((id) => [id, []]));
  const clients = Object.keys(people).map((id) => ({ sessionId: id, send: (type, m) => inbox[id].push({ type, ...m }) }));
  let now = 0;
  const relay = new EmoteRelay(state, () => clients, () => now);
  for (const id of Object.keys(people)) relay.listen(id);
  return { relay, inbox, state, client: (id) => clients.find((c) => c.sessionId === id), tick: (ms) => (now += ms) };
}

test('이모트: 같은 맵의 받겠다고 한 화면에만 보낸다', () => {
  const r = fakeRoom({ a: { role: 'student', map: 'school' }, b: { role: 'student', map: 'school' }, c: { role: 'student', map: 'goldenbell' }, t: { role: 'teacher', map: 'school' } });
  assert.equal(r.relay.handle(r.client('a'), { id: 'wave' }), true);
  assert.deepEqual(r.inbox.b, [{ type: 'emote', from: 'a', id: 'wave' }]);
  assert.equal(r.inbox.a.length, 1, '보낸 사람도 받는다');
  assert.equal(r.inbox.t.length, 1);
  assert.equal(r.inbox.c.length, 0, '다른 맵에는 가지 않는다');
  r.relay.forget('b');
  r.tick(EMOTE_COOLDOWN_MS);
  r.relay.handle(r.client('a'), { id: 'wave' });
  assert.equal(r.inbox.b.length, 1, '나간(또는 받겠다고 하지 않은) 화면에는 가지 않는다');
});

test('이모트: 모르는 이모트·재사용 대기·1분 상한', () => {
  const r = fakeRoom({ a: { role: 'student', map: 'school' }, b: { role: 'student', map: 'school' } });
  assert.equal(r.relay.handle(r.client('a'), { id: 'nope' }), false);
  assert.equal(r.relay.handle(r.client('a'), { id: 'heart' }), true);
  r.tick(EMOTE_COOLDOWN_MS - 1);
  assert.equal(r.relay.handle(r.client('a'), { id: 'heart' }), false, '재사용 대기 안');
  r.tick(1);
  assert.equal(r.relay.handle(r.client('a'), { id: 'heart' }), true, '대기가 끝나면 다시');
  for (let i = 2; i < EMOTE_PER_MINUTE; i++) {
    r.tick(EMOTE_COOLDOWN_MS);
    assert.equal(r.relay.handle(r.client('a'), { id: 'clap' }), true);
  }
  r.tick(EMOTE_COOLDOWN_MS);
  assert.equal(r.relay.handle(r.client('a'), { id: 'clap' }), false, `1분에 ${EMOTE_PER_MINUTE + 1}번째는 막는다`);
  r.tick(60_000);
  assert.equal(r.relay.handle(r.client('a'), { id: 'clap' }), true, '1분이 지나면 다시');
  assert.equal(r.inbox.b.length, EMOTE_PER_MINUTE + 1);
});

test('이모트: 골든벨 문제 중 학생 이모트는 보낸 학생과 선생님에게만', () => {
  const people = { a: { role: 'student', map: 'goldenbell' }, b: { role: 'student', map: 'goldenbell' }, t: { role: 'teacher', map: 'goldenbell' } };
  const r = fakeRoom(people, 'question');
  r.relay.handle(r.client('a'), { id: 'wave' });
  assert.equal(r.inbox.a.length, 1);
  assert.equal(r.inbox.t.length, 1);
  assert.equal(r.inbox.b.length, 0);
  r.relay.handle(r.client('t'), { id: 'wave' });
  assert.equal(r.inbox.b.length, 1, '선생님 이모트는 모두 받는다');
  r.state.goldenbell.phase = 'reveal';
  r.tick(EMOTE_COOLDOWN_MS);
  r.relay.handle(r.client('a'), { id: 'wave' });
  assert.equal(r.inbox.b.length, 2, '정답 공개 때는 다시 보인다');
});

test('이모트 목록: 8가지, id가 겹치지 않음', () => {
  assert.equal(EMOTES.length, 8);
  assert.equal(new Set(EMOTES.map((e) => e.id)).size, 8);
});

// ---- 바로 낸 문제 ----

test('붙여넣기: OX·객관식·단답형과 끝 칸 제한 시간', () => {
  const lines = parsePaste(
    [
      '관성은 질량에 비례한다 | O | 질량이 클수록 관성이 크다',
      '',
      '힘의 단위는? | N / J / W / Pa | 1',
      '속력의 단위는? | km/h / m/s | 2 | 해설 | 45초',
      '빛의 속력은? | =3×10^8 m/s, 3억 m/s',
      '천의 값은? | =1,000',
    ].join('\n'),
    20,
  );
  assert.equal(lines.length, 5, '빈 줄은 건너뛴다');
  assert.ok(lines.every((l) => 'question' in l), JSON.stringify(lines));
  const [ox, choice, units, short, thousand] = lines.map((l) => l.question);
  assert.deepEqual([ox.type, ox.answer, ox.seconds, ox.explain], ['ox', 'O', 20, '질량이 클수록 관성이 크다']);
  assert.deepEqual([choice.type, choice.choices, choice.answer], ['choice', ['N', 'J', 'W', 'Pa'], '1']);
  assert.deepEqual([units.choices, units.answer, units.seconds, units.explain], [['km/h', 'm/s'], '2', 45, '해설']);
  assert.deepEqual([short.type, short.answers], ['short', ['3×10^8 m/s', '3억 m/s']]);
  assert.deepEqual(thousand.answers, ['1,000'], '숫자 사이 쉼표는 나누지 않는다');
  assert.ok(matchAnswer('3억 m/s', short.answers) && matchAnswer('1000', thousand.answers));
});

test('붙여넣기: 틀린 줄은 줄 번호와 까닭', () => {
  const lines = parsePaste(['좋은 줄 | X', '정답 없음', '보기 하나 | A / | 1', '번호 밖 | A / B | 3', '종류 모름 | 몰라', ' | O', '시간 밖 | O | 2초'].join('\n'), 20);
  const errors = lines.filter((l) => 'error' in l);
  assert.deepEqual(errors.map((l) => l.line), [2, 3, 4, 5, 6, 7]);
  assert.ok(errors.every((l) => l.error.length > 5));
  assert.match(errors.find((l) => l.line === 4).error, /1~2/);
});

test('나누기 규칙과 한 줄로 되돌리기', () => {
  assert.deepEqual(splitChoices('a/b/c'), ['a', 'b', 'c']);
  assert.deepEqual(splitChoices('m/s / km/h'), ['m/s', 'km/h']);
  assert.deepEqual(splitAnswers('관성, 관성의 법칙、뉴턴 제1법칙'), ['관성', '관성의 법칙', '뉴턴 제1법칙']);
  const [l] = parsePaste('속력의 단위는? | km/h / m/s | 2 | 해설 | 45초', 20);
  assert.deepEqual(parsePaste(toPasteLine(l.question), 20)[0].question, l.question);
});

test('묶음 확인: 비었거나 너무 많거나 틀린 문제', () => {
  assert.ok(Array.isArray(checkQuickSet({ questions: [] })));
  const q = { type: 'ox', question: 'q', answer: 'O', explain: '', seconds: 10, choices: [], answers: [] };
  assert.ok(Array.isArray(checkQuickSet({ questions: Array(QUICK_MAX_QUESTIONS + 1).fill(q) })));
  const bad = checkQuickSet({ questions: [q, { ...q, answer: 'Y' }] });
  assert.deepEqual(bad, ['2번 문제: OX 문제의 정답은 O 또는 X로 씁니다.']);
  const ok = checkQuickSet({ title: '', questions: [q] });
  assert.equal(ok.title, '바로 낸 문제');
});

test('서버 묶음: @quick으로 읽고, 복사본이라 즉석 문제를 끼워도 묶음은 그대로', () => {
  const quick = new QuickQuestions();
  assert.equal(quick.read('quick.yaml'), undefined, '다른 파일 이름은 문제 파일로');
  assert.equal(typeof quick.read(QUICK_FILE), 'string', '보내기 전에는 까닭');
  assert.equal(typeof quick.store({ questions: [{ type: 'ox' }] }), 'string');
  const r = quick.store({ title: '시험', questions: [{ type: 'short', question: 'q', answers: ['a'], seconds: 10 }] });
  assert.deepEqual(r, { count: 1 });
  const set = quick.read(QUICK_FILE);
  assert.equal(set.title, '시험');
  assert.equal(set.questions[0].nonsense, false);
  set.questions.push(quick.one({ type: 'ox', question: 'x', answer: 'X', seconds: 5 }));
  assert.equal(quick.read(QUICK_FILE).questions.length, 1);
  assert.equal(typeof quick.one({ type: 'ox', question: 'x', answer: 'X', seconds: 1 }), 'string');
});

// ---- 효과음 규칙 ----

const gb = (o) => ({ phase: '', index: -1, timeLeft: 0, result: '', student: true, ...o });
test('효과음: 골든벨 문제 시작·째깍·결과·팡파르', () => {
  assert.deepEqual(gbSounds(null, gb({ phase: 'question', index: 0 })), [], '처음 본 상태는 울리지 않는다');
  assert.deepEqual(gbSounds(gb({ phase: 'ready' }), gb({ phase: 'question', index: 0, timeLeft: 10 })), ['question']);
  assert.deepEqual(gbSounds(gb({ phase: 'question', index: 0, timeLeft: 5 }), gb({ phase: 'question', index: 0, timeLeft: 4 })), []);
  assert.deepEqual(gbSounds(gb({ phase: 'question', index: 0, timeLeft: 4 }), gb({ phase: 'question', index: 0, timeLeft: 3 })), ['tick']);
  assert.deepEqual(gbSounds(gb({ phase: 'question', index: 0, timeLeft: 1 }), gb({ phase: 'reveal', index: 0, result: 'out' })), ['out']);
  assert.deepEqual(gbSounds(gb({ phase: 'question' }), gb({ phase: 'reveal', result: 'heart' })), ['correct']);
  assert.deepEqual(gbSounds(gb({ phase: 'question' }), gb({ phase: 'reveal', result: 'revived' })), ['revive']);
  assert.deepEqual(gbSounds(gb({ phase: 'reveal', result: 'wrong' }), gb({ phase: 'reveal', result: 'correct' })), ['correct'], '선생님이 인정');
  assert.deepEqual(gbSounds(gb({ phase: 'question', student: false }), gb({ phase: 'reveal', student: false })), ['reveal']);
  assert.deepEqual(gbSounds(gb({ phase: 'reveal' }), gb({ phase: 'end' })), ['fanfare']);
  assert.deepEqual(gbSounds(gb({ phase: 'reveal', index: 0 }), gb({ phase: 'question', index: 1, timeLeft: 3 })), ['question'], '새 문제는 째깍보다 시작 소리');
});

const mini = (o) => ({ kind: 'treasure', phase: '', timeLeft: 0, score: 0, out: false, ...o });
test('효과음: 미니게임(세기·시작·줍기·금·맞음·결과)', () => {
  const G = GOLD_POINTS;
  assert.deepEqual(miniSounds(null, mini({ phase: 'count', timeLeft: 3 }), G), [], '처음 본 상태는 울리지 않는다');
  assert.deepEqual(miniSounds(mini({}), mini({ phase: 'count', timeLeft: 3 }), G), ['countBeep']);
  assert.deepEqual(miniSounds(mini({ phase: 'count', timeLeft: 3 }), mini({ phase: 'count', timeLeft: 3 }), G), [], '같은 초는 한 번');
  assert.deepEqual(miniSounds(mini({ phase: 'count', timeLeft: 3 }), mini({ phase: 'count', timeLeft: 2 }), G), ['countBeep']);
  assert.deepEqual(miniSounds(mini({ phase: 'count', timeLeft: 1 }), mini({ phase: 'play', timeLeft: 20 }), G), ['miniStart']);
  assert.deepEqual(miniSounds(mini({ phase: 'play' }), mini({ phase: 'play', score: 1 }), G), ['pick']);
  assert.deepEqual(miniSounds(mini({ phase: 'play', score: 1 }), mini({ phase: 'play', score: 1 + G }), G), ['pickGold']);
  assert.deepEqual(miniSounds(mini({ phase: 'count', timeLeft: 1, score: 5 }), mini({ phase: 'play', score: 0 }), G), ['miniStart'], '새 판의 점수 초기화는 줍기가 아니다');
  assert.deepEqual(miniSounds(mini({ kind: 'dodge', phase: 'play', score: 1 }), mini({ kind: 'dodge', phase: 'play', score: 2 }), G), [], '공 피하기 버틴 시간은 소리 없음');
  assert.deepEqual(miniSounds(mini({ kind: 'dodge', phase: 'play' }), mini({ kind: 'dodge', phase: 'play', out: true }), G), ['hit']);
  assert.deepEqual(miniSounds(mini({ kind: 'tug', phase: 'play' }), mini({ kind: 'tug', phase: 'play', score: 1 }), G), [], '줄다리기는 누를 때 화면이 울린다(pulled)');
  assert.deepEqual(miniSounds(mini({ phase: 'play' }), mini({ phase: 'result' }), G), ['fanfare']);
});
