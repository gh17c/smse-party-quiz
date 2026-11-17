import assert from 'node:assert/strict';
import test from 'node:test';
import * as practice from '../src/practice-session.js';

const questions = [
  { id: 's', topic: '党章基础', type: 'single', stem: '单选示例', options: [{ id: 'A', text: '选项甲' }, { id: 'B', text: '选项乙' }], answer: 'B', explanation: '解析', source: { title: '原文', url: 'https://example.org/source' } },
  { id: 'm', topic: '党章基础', type: 'multiple', stem: '多选示例', options: [{ id: 'A', text: '选项甲' }, { id: 'B', text: '选项乙' }], answer: ['A', 'B'], explanation: '解析', source: { title: '原文', url: 'https://example.org/source' } },
  { id: 'j', topic: '党章基础', type: 'judge', stem: '判断示例', options: [], answer: false, explanation: '解析', source: { title: '原文', url: 'https://example.org/source' } },
];

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('practice session supports bounded navigation and retains submitted wrong answers', () => {
  assert.equal(typeof practice.createPracticeSession, 'function');
  const session = practice.createPracticeSession('党章基础', questions);
  session.currentIndex = session.questions.findIndex((question) => question.id === 's');
  assert.equal(practice.answerPracticeQuestion(session, 'A', true), true);
  const originalIndex = session.currentIndex;
  practice.movePracticeQuestion(session, originalIndex === 2 ? -1 : 1);
  practice.movePracticeQuestion(session, originalIndex === 2 ? 1 : -1);
  assert.equal(session.currentIndex, originalIndex);
  assert.equal(session.answers[originalIndex], 'A');
  assert.equal(session.results[originalIndex], false);
  assert.equal(practice.answerPracticeQuestion(session, 'B', true), false);
  session.currentIndex = 0;
  practice.movePracticeQuestion(session, -1);
  assert.equal(session.currentIndex, 0);
  session.currentIndex = 2;
  practice.movePracticeQuestion(session, 1);
  assert.equal(session.currentIndex, 2);
});

test('draft selection is not counted as submitted and incomplete rounds cannot finish', () => {
  const session = practice.createPracticeSession('党章基础', questions);
  session.currentIndex = session.questions.findIndex((question) => question.id === 'm');
  assert.equal(practice.answerPracticeQuestion(session, ['A']), true);
  assert.equal(practice.getPracticeProgress(session).answeredCount, 0);
  assert.equal(practice.getPracticeProgress(session).complete, false);
  assert.equal(practice.answerPracticeQuestion(session, [], true), false);
  assert.equal(practice.answerPracticeQuestion(session, ['NOT-AN-OPTION'], true), false);
  for (let index = 0; index < session.questions.length; index += 1) {
    session.currentIndex = index;
    practice.answerPracticeQuestion(session, session.questions[index].answer, true);
  }
  assert.deepEqual(practice.getPracticeProgress(session), { answeredCount: 3, correctCount: 3, complete: true, firstUnanswered: -1 });
});

test('reopening restores exact question order, position, draft choices and false judge answers', () => {
  const storage = memoryStorage();
  const store = practice.createPracticeStore(storage, 'student-a');
  const session = practice.createPracticeSession('党章基础', questions);
  session.currentIndex = session.questions.findIndex((question) => question.id === 'j');
  practice.answerPracticeQuestion(session, false, true);
  const judgeIndex = session.currentIndex;
  session.currentIndex = session.questions.findIndex((question) => question.id === 'm');
  practice.answerPracticeQuestion(session, ['A']);
  assert.equal(store.save(session), true);
  const reopenedStore = practice.createPracticeStore(storage, 'student-a');
  const restored = reopenedStore.load('党章基础', questions);
  assert.deepEqual(restored.questions.map((question) => question.id), session.questions.map((question) => question.id));
  assert.equal(restored.currentIndex, session.currentIndex);
  assert.deepEqual(restored.answers[restored.currentIndex], ['A']);
  assert.equal(restored.results[restored.currentIndex], null);
  assert.equal(restored.answers[judgeIndex], false);
  assert.equal(restored.results[judgeIndex], true);
  assert.deepEqual(reopenedStore.last(), { topic: '党章基础', mode: 'practice' });
});

test('different accounts, topics and wrong-answer rounds keep separate drafts', () => {
  const storage = memoryStorage();
  const store = practice.createPracticeStore(storage, 'student-a');
  const topicOne = practice.createPracticeSession('党章基础', questions);
  store.save(topicOne);
  const topicTwoBank = questions.map((question) => ({ ...question, topic: '发展党员程序' }));
  const topicTwo = practice.createPracticeSession('发展党员程序', topicTwoBank);
  topicTwo.currentIndex = 1;
  store.save(topicTwo);
  const mistakes = practice.createPracticeSession('党章基础', [questions[0]], 'mistakes');
  store.save(mistakes);
  assert.equal(store.load('党章基础', questions).questions.length, 3);
  assert.equal(store.load('党章基础', questions, 'mistakes').questions.length, 1);
  assert.equal(store.load('发展党员程序', topicTwoBank).currentIndex, 1);
  assert.deepEqual(store.last(), { topic: '党章基础', mode: 'mistakes' });
  const otherStudent = practice.createPracticeStore(storage, 'student-b');
  assert.equal(otherStudent.load('党章基础', questions), null);
  assert.equal(otherStudent.last(), null);
});

test('completed practice restores its saved identity and cannot duplicate completion', () => {
  const storage = memoryStorage();
  const store = practice.createPracticeStore(storage, 'student-a');
  const session = practice.createPracticeSession('党章基础', [questions[2]]);
  practice.answerPracticeQuestion(session, false, true);
  session.saved = true;
  session.view = 'summary';
  store.save(session);
  const restored = practice.createPracticeStore(storage, 'student-a').load('党章基础', questions.slice(2));
  assert.equal(restored.id, session.id);
  assert.equal(restored.saved, true);
  assert.equal(restored.view, 'summary');
  assert.equal(practice.getPracticeProgress(restored).complete, true);
});

test('question edits reset stale answers, remove retired items and append new items safely', () => {
  const storage = memoryStorage();
  const store = practice.createPracticeStore(storage, 'student-a');
  const session = practice.createPracticeSession('党章基础', questions);
  session.currentIndex = session.questions.findIndex((question) => question.id === 's');
  practice.answerPracticeQuestion(session, 'B', true);
  store.save(session);
  const changedBank = [
    { ...questions[0], answer: 'A' }, questions[2], { ...questions[1], id: 'new' },
  ];
  const restored = practice.createPracticeStore(storage, 'student-a').load('党章基础', changedBank);
  assert.equal(restored.questions[restored.currentIndex].id, 's');
  assert.equal(restored.answers[restored.currentIndex], null);
  assert.equal(restored.results[restored.currentIndex], null);
  assert.deepEqual(restored.questions.map((question) => question.id).sort(), ['j', 'new', 's']);
  assert.equal(restored.saved, false);
});

test('corrupt storage and unavailable localStorage never break practice', () => {
  const corrupt = { getItem: () => '{broken', setItem() {} };
  const store = practice.createPracticeStore(corrupt, 'student-a');
  assert.equal(store.load('党章基础', questions), null);
  assert.equal(store.last(), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const fallback = practice.createPracticeStore(blocked, 'student-a');
  const session = practice.createPracticeSession('党章基础', questions);
  session.currentIndex = 2;
  assert.equal(fallback.save(session), false);
  assert.equal(fallback.load('党章基础', questions).currentIndex, 2);
  assert.equal(practice.createPracticeStore(null).load('党章基础', questions), null);
});

test('question map distinguishes drafts, submitted wrong answers and unselected false judge values', () => {
  assert.equal(typeof practice.getPracticeQuestionPage, 'function');
  const session = practice.createPracticeSession('党章基础', questions);
  session.questions = [...questions];
  practice.answerPracticeQuestion(session, 'A', true);
  session.currentIndex = 1;
  practice.answerPracticeQuestion(session, ['A']);
  session.currentIndex = 2;
  let map = practice.getPracticeQuestionPage(session);
  assert.deepEqual(map.items, [
    { index: 0, state: 'incorrect', current: false },
    { index: 1, state: 'draft', current: false },
    { index: 2, state: 'unanswered', current: true },
  ]);
  practice.answerPracticeQuestion(session, false, true);
  map = practice.getPracticeQuestionPage(session);
  assert.deepEqual(map.items[2], { index: 2, state: 'correct', current: true });
});

test('long question maps open around the current question and bound page selection', () => {
  const bank = Array.from({ length: 65 }, (_, index) => ({ ...questions[0], id: `item-${index}` }));
  const session = practice.createPracticeSession('党章基础', bank);
  session.currentIndex = 41;
  const current = practice.getPracticeQuestionPage(session);
  assert.equal(current.page, 1);
  assert.equal(current.pageCount, 3);
  assert.equal(current.items.length, 30);
  assert.equal(current.items[0].index, 30);
  assert.equal(current.items[29].index, 59);
  assert.equal(current.items.find((item) => item.current).index, 41);
  assert.equal(practice.getPracticeQuestionPage(session, -1).items[0].index, 0);
  assert.deepEqual(practice.getPracticeQuestionPage(session, 99).items.map((item) => item.index), [60, 61, 62, 63, 64]);
});

test('jumping from the question map keeps answers and persists the chosen position', () => {
  assert.equal(typeof practice.goToPracticeQuestion, 'function');
  const session = practice.createPracticeSession('党章基础', questions);
  session.questions = [...questions];
  practice.answerPracticeQuestion(session, 'B', true);
  assert.equal(practice.goToPracticeQuestion(session, 2), true);
  practice.answerPracticeQuestion(session, false);
  assert.equal(practice.goToPracticeQuestion(session, -1), false);
  assert.equal(practice.goToPracticeQuestion(session, 3), false);
  assert.equal(practice.goToPracticeQuestion(session, 1.5), false);
  assert.equal(session.currentIndex, 2);
  const storage = memoryStorage();
  practice.createPracticeStore(storage, 'student-a').save(session);
  const restored = practice.createPracticeStore(storage, 'student-a').load('党章基础', questions);
  assert.equal(restored.currentIndex, 2);
  assert.deepEqual(restored.answers, ['B', null, false]);
  assert.deepEqual(restored.results, [true, null, null]);
});
