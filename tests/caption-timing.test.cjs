const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: () => ({}), window: { setTimeout }, clearTimeout, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 }, DOMException });
  return exports;
}
const { sanitizeAndSequenceCaptions: normalize } = load('services/captionNormalization.ts');
const { updateCaptionTiming: edit, shiftAllCaptionsList: shift } = load('services/captionTiming.ts');
const fixtures = () => Array.from({ length: 120 }, (_, id) => ({ id, start: id * .8 + .1, end: id * .8 + .75, text: 'זה משפט קצר שמדברים בקצב רגיל' }));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('Fast speech keeps its acoustic timestamps across an entire 100 second recording', () => {
  const input = fixtures(), output = normalize(input, 100);
  assert.equal(output.length, 120);
  output.forEach((cue, i) => { close(cue.start, input[i].start); close(cue.end, input[i].end); });
  assert.equal(JSON.stringify(normalize(output, 100)), JSON.stringify(output));
});

test('A single outlier cannot rescale or compress the rest of the recording', () => {
  assert.throws(() => normalize([...fixtures(), { id: 999, start: 99999, end: 999999, text: 'חריגה' }], 100));
  const input = fixtures(), output = normalize(input.map(c => ({ ...c, start: c.start * 1000, end: c.end * 1000 })), 100);
  output.forEach((cue, i) => close(cue.start, input[i].start));
});

test('Ripple correction in the second half keeps the already synchronized first half intact', () => {
  const input = fixtures(), saved = JSON.stringify(input);
  const output = edit(input, 60, 'start', input[60].start + .25, { ripple: true, duration: 100 });
  assert.equal(JSON.stringify(output.slice(0, 60)), JSON.stringify(input.slice(0, 60)));
  output.slice(60).forEach((cue, index) => { const original = input[index + 60]; close(cue.start - original.start, .25); close(cue.end - original.end, .25); });
  assert.equal(JSON.stringify(input), saved);
});

test('Media boundaries never squeeze the last captions into a short overlapping burst', () => {
  const input = fixtures();
  for (const field of ['start', 'end']) for (let at = -10; at <= 130; at += 1.371) {
    const output = edit(input, 60, field, at, { ripple: true, duration: 100 });
    close(output.at(-1).end - output.at(-1).start, input.at(-1).end - input.at(-1).start);
    assert.ok(output.at(-1).end <= 100);
    for (let i = 61; i < output.length; i++) close(output[i].start - output[i - 1].end, input[i].start - input[i - 1].end);
  }
  const all = shift(input, 30, 100);
  all.forEach((cue, i) => close(cue.end - cue.start, input[i].end - input[i].start));
});

test('A paused preview waits for the decoded frame, including adjacent frames', async () => {
  const { seekComposition } = load('v2/media.ts');
  class Video extends EventTarget {
    readyState = 2; seeking = false; value = 0; decoded = false;
    get currentTime() { return this.value; }
    set currentTime(value) { this.value = value; this.seeking = true; setTimeout(() => { this.seeking = false; this.decoded = true; this.dispatchEvent(new Event('seeked')); }, 100); }
  }
  const video = new Video(), pool = { assets: new Map([['base', { id: 'base', kind: 'video', duration: 100 }]]), videos: new Map([['base', video]]) };
  await seekComposition({ baseAssetId: 'base', layers: [] }, pool, 1 / 30);
  assert.equal(video.decoded, true);
  close(video.currentTime, 1 / 30);
  const controller = new AbortController();
  const pending = seekComposition({ baseAssetId: 'base', layers: [] }, pool, 90, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
