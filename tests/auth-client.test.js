import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_CONFIG, isAuthConfigured } from '../src/auth-config.js';
import { userHistoryKey } from '../src/auth-client.js';

test('history storage is partitioned by authenticated user', () => {
  assert.equal(userHistoryKey(null), 'smse-party-quiz-history');
  assert.equal(userHistoryKey({ id: 'student-a' }), 'smse-party-quiz-history:student-a');
  assert.notEqual(userHistoryKey({ id: 'student-a' }), userHistoryKey({ id: 'student-b' }));
});

test('configured invite-only authentication requires login', () => {
  assert.equal(isAuthConfigured, true);
  assert.equal(AUTH_CONFIG.requireLogin, true);
});
