import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(([, attrs]) => Object.fromEntries(
  [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
));
test('external executable scripts are HTTPS, version-pinned and integrity-protected', () => {
  const external = scripts.filter(s => s.src && /^(https?:)?\/\//.test(s.src));
  assert.equal(external.length, 1);
  assert.equal(external[0].src, 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js');
  assert.equal(external[0].crossorigin, 'anonymous');
  assert.equal(external[0].integrity, 'sha384-c6Uo4N9c3SOEigMVzP6IshUG1wQ5uMp3xeoQFiHWAQ86joWdgyajkvopySyKy/Z6');
});
test('self-hosted analytics matches its pinned integrity and retains the endpoint', async () => {
  const analytics = scripts.find(s => s['data-goatcounter']);
  assert.equal(analytics.src, 'vendor/goatcounter-count.js');
  assert.equal(analytics['data-goatcounter'], 'https://guitarllm.goatcounter.com/count');
  const data = await readFile(new URL('../vendor/goatcounter-count.js', import.meta.url));
  assert.equal(analytics.integrity, `sha384-${createHash('sha384').update(data).digest('base64')}`);
  assert.equal(createHash('sha256').update(data).digest('hex'), '792b7abd26c1fb6ae62906833e09a301251e2641816e69e4f95aba518f3fe3f0');
});
