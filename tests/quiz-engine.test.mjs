import assert from 'node:assert/strict';
import test from 'node:test';
import { getTopicNames, getTopicQuestions, getUsableQuestions, isCorrect, normalizeAnswer, selectRandomQuestions } from '../src/quiz-engine.js';
import { questionBank } from '../src/questions.js';

const question = (type, answer) => ({ type, answer });

test('single-choice and judge answers require an exact match', () => {
  assert.equal(isCorrect(question('single', 'b'), 'b'), true);
  assert.equal(isCorrect(question('single', 'b'), 'a'), false);
  assert.equal(isCorrect(question('judge', true), true), true);
  assert.equal(isCorrect(question('judge', true), false), false);
});

test('multiple-choice answers match as a complete set regardless of order', () => {
  const item = question('multiple', ['a', 'c']);
  assert.deepEqual(normalizeAnswer(item, ['c', 'a', 'a']), ['a', 'c']);
  assert.equal(isCorrect(item, ['c', 'a']), true);
  assert.equal(isCorrect(item, ['a']), false);
  assert.equal(isCorrect(item, ['a', 'b', 'c']), false);
});

test('topic selection excludes malformed questions and returns an empty list for missing topics', () => {
  const valid = {
    id: 'good', topic: '党章基础', type: 'single', stem: '题干',
    options: [{ id: 'A', text: '答案' }], answer: 'A', explanation: '解析',
    source: { title: '来源', url: 'https://example.org/source' },
  };
  const malformed = { ...valid, id: 'bad', answer: 'missing-option' };
  const malformedSource = { ...valid, id: 'bad-source', source: { title: '来源', url: {} } };
  const malformedOption = { ...valid, id: 'bad-option', options: [{ id: 'A', text: 1 }] };
  assert.deepEqual(getTopicQuestions([valid, malformed, malformedSource, malformedOption], '党章基础'), [valid]);
  assert.deepEqual(getTopicQuestions([valid], '不存在的专题'), []);
  assert.deepEqual(getTopicQuestions(null, '党章基础'), []);
  assert.deepEqual(getUsableQuestions([valid, null, malformed]), [valid]);
  assert.deepEqual(getTopicNames([valid, null, malformed]), ['党章基础']);
});

test('random question selection is repeatable with an injected random source', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const picked = selectRandomQuestions(items, 2, () => 0);
  assert.deepEqual(picked.map(({ id }) => id), ['b', 'c']);
  assert.equal(new Set(picked.map(({ id }) => id)).size, 2);
});

test('the sample bank covers three question types and has source links', () => {
  assert.ok(new Set(questionBank.map(({ topic }) => topic)).size >= 2);
  assert.deepEqual(new Set(questionBank.map(({ type }) => type)), new Set(['single', 'multiple', 'judge']));
  assert.ok(questionBank.every(({ source }) => source?.title && source.url.startsWith('https://')));
});

test('party discipline categories exclude exam and competition rules', () => {
  const question = questionBank.find(({ id }) => id === 'd06');
  assert.deepEqual(question.answer, ['A', 'B', 'C']);
  assert.equal(isCorrect(question, ['A', 'B', 'C']), true);
  assert.equal(isCorrect(question, ['A', 'B', 'C', 'D']), false);
});
