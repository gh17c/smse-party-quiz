import test from 'node:test';
import assert from 'node:assert/strict';
import { requireActiveSession, userHistoryKey } from '../src/auth-client.js';

test('history storage is partitioned by authenticated user', () => {
  assert.equal(userHistoryKey(null), 'smse-party-quiz-history');
  assert.equal(userHistoryKey({ id: 'student-a' }), 'smse-party-quiz-history:student-a');
  assert.notEqual(userHistoryKey({ id: 'student-a' }), userHistoryKey({ id: 'student-b' }));
});

test('an unconfigured auth provider keeps the existing local-only mode', async () => {
  assert.deepEqual(await requireActiveSession(), { enabled: false, session: null, user: null });
});
