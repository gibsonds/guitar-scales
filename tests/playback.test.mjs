import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function stopScalePlayback()');
const end = html.indexOf('\n    /**', start);

function player(startAudio = () => Promise.resolve(), contextState = 'running') {
  const elements = Object.fromEntries(['playButton', 'playbackStatus', 'instrumentSelect'].map(id => [id, {
    textContent: '', disabled: false, value: 'guitar', setAttribute() {},
  }]));
  const timers = new Map();
  let timerId = 0;
  const sounds = [];
  let disposed = 0;
  const context = vm.createContext({
    document: { getElementById: id => elements[id] },
    Tone: { start: startAudio, getContext: () => ({ state: contextState }), now: () => 0 },
    trackEvent() {},
    collectScaleNotes: () => [{ midi: 60 }, { midi: 62 }, { midi: 64 }],
    midiToNoteName: midi => midi,
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    sounds,
    dispose() { disposed++; },
  });
  vm.runInContext(`let synth = null; let isPlaying = false; let scalePlayback = null;
    function initAudio() { synth = { triggerAttackRelease(note) { sounds.push(note); }, dispose }; }
    ${html.slice(start, end)}`, context);
  return {
    elements, timers, sounds, get disposed() { return disposed; },
    play: () => vm.runInContext('playScale()', context),
    fire(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay === delay) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('Stop cancels remaining notes, silences voices and allows another play', async () => {
  const p = player();
  await p.play();
  assert.equal(p.elements.playButton.textContent, '■ Stop');
  assert.equal(p.elements.playButton.disabled, false);
  assert.deepEqual(p.sounds, [60]);
  await p.play();
  p.fire(300);
  assert.deepEqual(p.sounds, [60]);
  assert.equal(p.disposed, 1);
  assert.equal(p.timers.size, 0);
  await p.play();
  p.fire(300);
  p.fire(600);
  assert.deepEqual(p.sounds, [60, 60, 62, 64]);
  p.fire(1400);
  assert.equal(p.elements.playButton.textContent, '▶ Play');
  assert.equal(p.timers.size, 0);
});

test('rejected or suspended audio restores Play and provides feedback', async () => {
  for (const p of [player(() => Promise.reject(new Error('blocked'))), player(undefined, 'suspended')]) {
    await p.play();
    assert.equal(p.elements.playButton.textContent, '▶ Play');
    assert.match(p.elements.playbackStatus.textContent, /Audio could not start/);
    assert.equal(p.timers.size, 0);
    assert.deepEqual(p.sounds, []);
  }
});

test('hung audio startup times out and can be retried', async () => {
  let attempts = 0;
  const p = player(() => ++attempts === 1 ? new Promise(() => {}) : Promise.resolve());
  const pending = p.play();
  p.fire(5000);
  await pending;
  assert.equal(p.elements.playButton.textContent, '▶ Play');
  assert.match(p.elements.playbackStatus.textContent, /Audio could not start/);
  await p.play();
  assert.deepEqual(p.sounds, [60]);
  assert.equal(p.elements.playbackStatus.textContent, '');
});

test('Stop during startup prevents late audio from starting or resetting a newer play', async () => {
  let resume;
  let attempts = 0;
  const p = player(() => ++attempts === 1 ? new Promise(resolve => { resume = resolve; }) : Promise.resolve());
  const first = p.play();
  await p.play();
  await first;
  assert.equal(p.timers.size, 0);
  await p.play();
  resume();
  await Promise.resolve();
  assert.deepEqual(p.sounds, [60]);
  assert.equal(p.elements.playButton.textContent, '■ Stop');
});

test('a note scheduling failure restores Play and cancels subsequent notes', async () => {
  const p = player();
  await p.play();
  // Fail after the first note, as with an unavailable audio voice.
  p.sounds.push = () => { throw new Error('voice unavailable'); };
  p.fire(300);
  assert.equal(p.elements.playButton.textContent, '▶ Play');
  assert.match(p.elements.playbackStatus.textContent, /Audio could not start/);
  assert.equal(p.timers.size, 0);
});
