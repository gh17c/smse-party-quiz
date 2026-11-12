import assert from 'node:assert/strict';
import test from 'node:test';
import { isCorrect, normalizeAnswer, selectRandomQuestions } from '../src/quiz-engine.js';
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
