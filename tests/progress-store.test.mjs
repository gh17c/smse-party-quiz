import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressStore } from '../src/progress-store.js';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem() { return value; },
    setItem(_key, next) { value = next; },
    removeItem() { value = null; },
  };
}

const record = (id) => ({
  id,
  mode: 'practice',
  topic: '党章基础',
  score: 1,
  total: 1,
  correctCount: 1,
  completedAt: '2026-11-12T00:00:00.000Z',
});

test('progress store starts empty and returns newly added records first', () => {
  const store = createProgressStore(memoryStorage());
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.add(record('one')), [record('one')]);
  assert.deepEqual(store.add(record('two')), [record('two'), record('one')]);
  assert.deepEqual(store.list(), [record('two'), record('one')]);
});

test('progress store retains only the latest 20 records', () => {
  const store = createProgressStore(memoryStorage());
  for (let index = 0; index < 23; index += 1) store.add(record(String(index)));
  assert.equal(store.list().length, 20);
  assert.equal(store.list()[0].id, '22');
  assert.equal(store.list()[19].id, '3');
});

test('progress store treats malformed saved JSON as empty and can clear history', () => {
  const storage = memoryStorage('{broken');
  const store = createProgressStore(storage);
  assert.deepEqual(store.list(), []);
  store.add(record('one'));
  store.clear();
  assert.deepEqual(store.list(), []);
});

test('progress store skips malformed objects inside a valid JSON history array', () => {
  const storage = memoryStorage(JSON.stringify([record('valid'), null, { id: 'partial' }]));
  const store = createProgressStore(storage);
  assert.deepEqual(store.list(), [record('valid')]);
});

test('progress store tolerates storage read and write failures', () => {
  const failingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  const store = createProgressStore(failingStorage);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.add(record('session-only')), [record('session-only')]);
  assert.doesNotThrow(() => store.clear());
});
