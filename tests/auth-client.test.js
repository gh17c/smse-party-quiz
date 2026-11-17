import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_CONFIG, isAuthConfigured } from '../src/auth-config.js';
import { studentLoginEmail, userHistoryKey } from '../src/auth-client.js';
import * as authClient from '../src/auth-client.js';

test('history storage is partitioned by authenticated user', () => {
  assert.equal(userHistoryKey(null), 'smse-party-quiz-history');
  assert.equal(userHistoryKey({ id: 'student-a' }), 'smse-party-quiz-history:student-a');
  assert.notEqual(userHistoryKey({ id: 'student-a' }), userHistoryKey({ id: 'student-b' }));
});

test('configured authentication requires login', () => {
  assert.equal(isAuthConfigured, true);
  assert.equal(AUTH_CONFIG.requireLogin, true);
});

test('registration saves the student name with the account and starts a session', async (t) => {
  assert.equal(typeof authClient.signUp, 'function');
  const values = new Map();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { setItem: (key, value) => values.set(key, value) },
  } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/auth/v1/signup');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      email: 'test2026001@students.smse-party-quiz.invalid',
      password: 'test-password-only',
      data: { student_id: 'test2026001', full_name: '测试同学' },
    });
    return new Response(JSON.stringify({
      access_token: 'test-access-token', refresh_token: 'test-refresh-token',
      expires_in: 3600, expires_at: 4102444800, token_type: 'bearer',
      user: { id: 'test-student', email: 'test2026001@students.smse-party-quiz.invalid',
        user_metadata: { student_id: 'test2026001', full_name: '测试同学' } },
    }), { status: 200 });
  });
  const session = await authClient.signUp(' TEST2026001 ', ' 测试同学 ', 'test-password-only');
  assert.equal(session.user.user_metadata.full_name, '测试同学');
  const saved = JSON.parse(values.get('smse-party-quiz-auth-session'));
  assert.equal(saved.user.id, 'test-student');
  assert.equal(saved.access_token, 'test-access-token');
});

test('registration rejects a missing name and short passwords before sending data', async (t) => {
  assert.equal(typeof authClient.signUp, 'function');
  t.mock.method(globalThis, 'fetch', () => assert.fail('invalid registration must not reach Supabase'));
  await assert.rejects(authClient.signUp('test2026001', ' ', 'test-password-only'), /姓名/);
  await assert.rejects(authClient.signUp('test2026001', '测试同学', '12345'), /6/);
});

test('registration without a returned session does not claim immediate login', async (t) => {
  assert.equal(typeof authClient.signUp, 'function');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    id: 'test-student', identities: [{ id: 'test-identity' }],
  }), { status: 200 }));
  await assert.rejects(authClient.signUp('test2026001', '测试同学', 'test-password-only'), /确认|管理员/);
});

test('duplicate registration gets a useful message without replacing the existing account', async (t) => {
  assert.equal(typeof authClient.signUp, 'function');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    code: 422, error_code: 'user_already_exists', msg: 'User already registered',
  }), { status: 422 }));
  await assert.rejects(authClient.signUp('test2026001', '测试同学', 'test-password-only'), /已注册/);
});

test('registration explains a disabled signup service using its Supabase error code', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    code: 422, error_code: 'signup_disabled', msg: 'Signups not allowed for this instance',
  }), { status: 422 }));
  await assert.rejects(authClient.signUp('test2026001', '测试同学', 'test-password-only'), /暂未开放/);
});

test('student IDs map to internal Supabase email aliases', () => {
  assert.equal(studentLoginEmail(' 12023117 '), '12023117@students.smse-party-quiz.invalid');
  assert.throws(() => studentLoginEmail('bad id'), /有效的学号/);
  assert.throws(() => studentLoginEmail(''), /有效的学号/);
});
