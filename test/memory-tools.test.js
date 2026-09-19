const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isMemoryPath, isMemoryCall, describeMemoryCall, memoryReadText, memoryCallLines,
} = require('../src/vue/memory-tools.js');

const AUTO = '/Users/me/.claude/projects/-Users-me-app/memory';

test('memory files: MEMORY.md anywhere, any .md in a memory folder', () => {
  assert.equal(isMemoryPath(`${AUTO}/MEMORY.md`), true);
  assert.equal(isMemoryPath(`${AUTO}/project-clip.md`), true);
  assert.equal(isMemoryPath('/Users/me/.claude/groups/group-3/MEMORY.md'), true);
  assert.equal(isMemoryPath('C:\\Users\\me\\memory\\notes.md'), true);
  assert.equal(isMemoryPath('/repo/src/memory.ts'), false);
  assert.equal(isMemoryPath('/repo/docs/memory/diagram.png'), false);
  assert.equal(isMemoryPath('/repo/README.md'), false);
});

test('only the file tools count as working with memory', () => {
  assert.equal(isMemoryCall('Read', { file_path: `${AUTO}/MEMORY.md` }), true);
  assert.equal(isMemoryCall('Edit', { file_path: `${AUTO}/x.md` }), true);
  assert.equal(isMemoryCall('Bash', { file_path: `${AUTO}/MEMORY.md` }), false);
  assert.equal(isMemoryCall('Read', { file_path: '/repo/app.js' }), false);
});

test('the header names the act and which memory', () => {
  assert.deepEqual(describeMemoryCall('Read', { file_path: `${AUTO}/MEMORY.md` }),
    { verb: 'Recalled memory', icon: 'brain', file: 'MEMORY.md', tool: 'Read' });
  assert.equal(describeMemoryCall('Write', { file_path: `${AUTO}/user-prefs.md` }).verb, 'Saved memory');
  assert.equal(describeMemoryCall('Edit', { file_path: '/x/groups/group-3/MEMORY.md' }).file, 'group-3/MEMORY.md');
});

test('a Read comes back as the file, without gutter or reminders', () => {
  const raw = '     1→# Memory\n     2→- [Clip](clip.md)\n\n<system-reminder>\nwhatever\n</system-reminder>\n';
  assert.equal(memoryReadText(raw), '# Memory\n- [Clip](clip.md)');
  assert.equal(memoryReadText('1\tone\n2\ttwo'), 'one\ntwo');
});

test('what a call put in: a Write\'s file, an Edit\'s lines out and in', () => {
  assert.deepEqual(memoryCallLines('Write', { content: 'a\nb\n' }), [{ kind: 'plain', text: 'a' }, { kind: 'plain', text: 'b' }]);
  assert.deepEqual(memoryCallLines('Edit', { old_string: 'old', new_string: 'new\nmore' }), [
    { kind: 'removed', text: 'old' }, { kind: 'added', text: 'new' }, { kind: 'added', text: 'more' },
  ]);
  assert.equal(memoryCallLines('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] }).length, 4);
});
