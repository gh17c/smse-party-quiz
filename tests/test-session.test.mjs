import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestSession, getAnsweredCount, getRemainingSeconds, scoreTestSession } from '../src/test-session.js';

const paper = [
  { id: 'single', type: 'single', answer: 'B' },
  { id: 'multiple', type: 'multiple', answer: ['A', 'C'] },
  { id: 'judge', type: 'judge', answer: true },
];

test('test session starts with a fixed end time and an empty answer sheet', () => {
  const session = createTestSession(paper, 10_000, 60);

  assert.equal(session.startedAt, 10_000);
  assert.equal(session.expiresAt, 70_000);
  assert.deepEqual(session.answers, [null, null, null]);
  assert.equal(getRemainingSeconds(session, 10_000), 60);
});

test('remaining time never becomes negative and rounds up partial seconds', () => {
  const session = createTestSession(paper, 10_000, 60);

  assert.equal(getRemainingSeconds(session, 69_001), 1);
  assert.equal(getRemainingSeconds(session, 70_000), 0);
  assert.equal(getRemainingSeconds(session, 85_000), 0);
});

test('answered count includes false judge answers and excludes empty multiple answers', () => {
  const session = createTestSession(paper, 0, 60);
  session.answers = ['B', [], false];

  assert.equal(getAnsweredCount(session), 2);
});

test('test scoring follows exact, partial multiple, wrong multiple, and unanswered rules', () => {
  const session = createTestSession(paper, 0, 60);
  session.answers = ['B', ['A'], false];

  assert.deepEqual(scoreTestSession(session), {
    results: [2, 1, 0],
    score: 3,
    correctCount: 1,
    answeredCount: 3,
  });
});
