import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer } from '../dev-server.mjs';

test('static server serves ES modules with a browser-compatible MIME type', async () => {
  const root = await mkdtemp(join(tmpdir(), 'party-quiz-static-'));
  await writeFile(join(root, 'app.js'), 'export const ready = true;');
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/app.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(await response.text(), 'export const ready = true;');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('static server refuses paths outside its root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'party-quiz-static-'));
  const server = createStaticServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/%2e%2e%2fpackage.json`);
    assert.equal(response.status, 403);
    const hiddenFile = await fetch(`http://127.0.0.1:${address.port}/.git/config`);
    assert.equal(hiddenFile.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
