import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(([, attrs]) => Object.fromEntries(
  [...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
));
test('Tone is self-hosted for the production CSP and matches its pinned integrity', async () => {
  const external = scripts.filter(s => s.src && /^(https?:)?\/\//.test(s.src));
  assert.equal(external.length, 0);
  const tone = scripts.find(s => s.src === 'vendor/tone-14.8.49.js');
  assert.ok(tone);
  assert.equal(tone.crossorigin, 'anonymous');
  const data = await readFile(new URL('../vendor/tone-14.8.49.js', import.meta.url));
  const integrity = `sha384-${createHash('sha384').update(data).digest('base64')}`;
  assert.equal(integrity, 'sha384-c6Uo4N9c3SOEigMVzP6IshUG1wQ5uMp3xeoQFiHWAQ86joWdgyajkvopySyKy/Z6');
  assert.equal(tone.integrity, integrity);
});
test('self-hosted analytics matches its pinned integrity and retains the endpoint', async () => {
  const analytics = scripts.find(s => s['data-goatcounter']);
  assert.equal(analytics.src, 'vendor/goatcounter-count.js');
  assert.equal(analytics['data-goatcounter'], 'https://guitarllm.goatcounter.com/count');
  const data = await readFile(new URL('../vendor/goatcounter-count.js', import.meta.url));
  assert.equal(analytics.integrity, `sha384-${createHash('sha384').update(data).digest('base64')}`);
  assert.equal(createHash('sha256').update(data).digest('hex'), '792b7abd26c1fb6ae62906833e09a301251e2641816e69e4f95aba518f3fe3f0');
});
