const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isImageType, fitWithin, mentionFor, baseName, shortBytes,
  promptText, promptContent, MAX_IMAGE_EDGE,
} = require('../src/vue/composer-attachments.js');

// ── Which files are images ────────────────────────────────────────

test('only the media types the API takes as a block count as images', () => {
  assert.equal(isImageType('image/png'), true);
  assert.equal(isImageType('IMAGE/JPEG'), true);
  assert.equal(isImageType('image/webp'), true);
  // Valid images the API will not accept — they go as a path instead.
  assert.equal(isImageType('image/svg+xml'), false);
  assert.equal(isImageType('image/heic'), false);
  assert.equal(isImageType('application/pdf'), false);
  assert.equal(isImageType(''), false);
  assert.equal(isImageType(undefined), false);
});

// ── Resizing ──────────────────────────────────────────────────────

test('an image that already fits is left alone', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(MAX_IMAGE_EDGE, 100), { width: MAX_IMAGE_EDGE, height: 100 });
});

test('a larger image is scaled by its longest edge, keeping its shape', () => {
  const fit = fitWithin(3000, 2000);
  assert.equal(fit.width, MAX_IMAGE_EDGE);
  assert.equal(fit.height, Math.round(2000 * (MAX_IMAGE_EDGE / 3000)));
  // A tall screenshot is bounded by its height, not its width.
  const tall = fitWithin(1000, 4000);
  assert.equal(tall.height, MAX_IMAGE_EDGE);
});

test('a sliver of an image still has a pixel in each direction', () => {
  const fit = fitWithin(6000, 1);
  assert.equal(fit.width, MAX_IMAGE_EDGE);
  assert.equal(fit.height, 1);
});

// ── Mentions ──────────────────────────────────────────────────────

test('a file inside the project is named the way the @ menu names it', () => {
  assert.equal(
    mentionFor('/Users/me/proj/src/app.js', '/Users/me/proj'),
    '@src/app.js',
  );
  // A trailing slash on the project is the same project.
  assert.equal(
    mentionFor('/Users/me/proj/src/app.js', '/Users/me/proj/'),
    '@src/app.js',
  );
});

test('a file outside the project keeps its absolute path — nothing else can find it', () => {
  assert.equal(mentionFor('/tmp/notes.md', '/Users/me/proj'), '@/tmp/notes.md');
  assert.equal(mentionFor('/Users/me/other/app.js', '/Users/me/proj'), '@/Users/me/other/app.js');
  // A sibling whose name merely starts the same is not inside it.
  assert.equal(mentionFor('/Users/me/proj-2/app.js', '/Users/me/proj'), '@/Users/me/proj-2/app.js');
});

test('with no project known, the absolute path is the only honest answer', () => {
  assert.equal(mentionFor('/tmp/a.txt', ''), '@/tmp/a.txt');
  assert.equal(mentionFor('', '/Users/me/proj'), '');
});

test('the base name is what the chip shows', () => {
  assert.equal(baseName('/Users/me/proj/src/app.js'), 'app.js');
  assert.equal(baseName('app.js'), 'app.js');
  assert.equal(baseName('/Users/me/proj/'), 'proj');
});

test('sizes are rounded to something a chip can hold', () => {
  assert.equal(shortBytes(512), '512 B');
  assert.equal(shortBytes(2048), '2 KB');
  assert.equal(shortBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(shortBytes(undefined), '0 B');
});

// ── The prompt ────────────────────────────────────────────────────

const image = { kind: 'image', mediaType: 'image/png', data: 'QUJD' };
const file = { kind: 'file', path: '/Users/me/proj/src/app.js', mention: '@src/app.js' };

test('with nothing attached, the prompt is the text that was typed', () => {
  assert.equal(promptText('  hello  ', []), 'hello');
  assert.equal(promptContent('hello', []), 'hello');
});

test('an attached file is named after the sentence, not spliced into it', () => {
  assert.equal(promptText('look at this', [file]), 'look at this\n\n@src/app.js');
  assert.equal(promptContent('look at this', [file]), 'look at this\n\n@src/app.js');
});

test('a file the sentence already names is not named twice', () => {
  assert.equal(promptText('what does @src/app.js do', [file]), 'what does @src/app.js do');
});

test('the same file attached twice is one reference', () => {
  assert.equal(promptText('', [file, { ...file }]), '@src/app.js');
});

test('a file with no sentence is still a prompt', () => {
  assert.equal(promptText('', [file]), '@src/app.js');
});

// The order is the CLI's own: the block first, the sentence after it. A prompt
// sent from here has to read back out of the `.jsonl` as one of its own.
test('an image goes as a block, ahead of the text', () => {
  const content = promptContent('what is this', [image]);
  assert.deepEqual(content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    { type: 'text', text: 'what is this' },
  ]);
});

test('an image with nothing typed is sent without an empty text block', () => {
  assert.deepEqual(promptContent('   ', [image]), [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
  ]);
});

test('images and files travel by their own doors in the same prompt', () => {
  const content = promptContent('compare these', [image, file]);
  assert.equal(content.length, 2);
  assert.equal(content[0].type, 'image');
  assert.deepEqual(content[1], { type: 'text', text: 'compare these\n\n@src/app.js' });
});

test('an image with no data is not sent as an empty block', () => {
  assert.equal(promptContent('hi', [{ kind: 'image', mediaType: 'image/png', data: '' }]), 'hi');
});
