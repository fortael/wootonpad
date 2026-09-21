const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const groups = require('../session-groups');

function tmpRoot() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-groups-'));
  return { home, root: groups.groupsRoot(home) };
}

test('a group gets its own folder, a manifest and a CLAUDE.md naming every project', () => {
  const { home, root } = tmpRoot();
  try {
    const res = groups.createGroup(root, { projects: ['/repo/clip-service', '/repo/data-mart'], name: 'views field' });
    assert.ok(res.ok);
    assert.equal(res.group.id, 'group-1');
    assert.equal(res.group.dir, path.join(root, 'group-1'));

    const manifest = JSON.parse(fs.readFileSync(path.join(res.group.dir, groups.MANIFEST), 'utf8'));
    assert.deepEqual(manifest.projects, ['/repo/clip-service', '/repo/data-mart']);
    assert.equal(manifest.name, 'views field');

    const md = fs.readFileSync(path.join(res.group.dir, 'CLAUDE.md'), 'utf8');
    assert.match(md, /^# views field/);
    assert.match(md, /\/repo\/clip-service/);
    assert.match(md, /\/repo\/data-mart/);
    assert.match(md, /MEMORY\.md/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('MEMORY.md is asked for, not seeded', () => {
  const { home, root } = tmpRoot();
  try {
    const { group } = groups.createGroup(root, { projects: ['/a', '/b'] });
    assert.equal(fs.existsSync(path.join(group.dir, groups.MEMORY)), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a group needs at least two distinct projects', () => {
  const { home, root } = tmpRoot();
  try {
    assert.equal(groups.createGroup(root, { projects: ['/a'] }).ok, false);
    assert.equal(groups.createGroup(root, { projects: ['/a', '/a'] }).ok, false);
    assert.equal(groups.createGroup(root, { projects: [] }).ok, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('without a name, a group is named after its projects', () => {
  const { home, root } = tmpRoot();
  try {
    const { group } = groups.createGroup(root, { projects: ['/repo/clip-service', '/repo/data-mart'] });
    assert.equal(group.name, 'clip-service + data-mart');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('group ids count up from the highest, so a deleted one is never reused', () => {
  const { home, root } = tmpRoot();
  try {
    groups.createGroup(root, { projects: ['/a', '/b'] });
    const second = groups.createGroup(root, { projects: ['/a', '/b'] }).group;
    groups.createGroup(root, { projects: ['/a', '/b'] });
    fs.rmSync(second.dir, { recursive: true });
    assert.equal(groups.nextGroupId(root), 'group-4');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a path is a group path only under the groups root, and names its group', () => {
  const root = '/home/u/.claude/groups';
  assert.equal(groups.isGroupPath(root, '/home/u/.claude/groups/group-2'), true);
  assert.equal(groups.isGroupPath(root, '/home/u/.claude/groups'), true);
  assert.equal(groups.isGroupPath(root, '/home/u/.claude/groups-old/group-2'), false);
  assert.equal(groups.isGroupPath(root, '/repo/app'), false);
  assert.equal(groups.groupIdFromPath(root, '/home/u/.claude/groups/group-2'), 'group-2');
  assert.equal(groups.groupIdFromPath(root, '/home/u/.claude/groups'), null);
  assert.equal(groups.groupIdFromPath(root, '/repo/app'), null);
});

// Native Windows: the root comes from path.join (backslashes), the session's
// cwd from the transcript, which may use either separator and either case of
// drive letter. All of them are the same folder.
test('on Windows a group path matches whichever way it is spelled', () => {
  const root = 'C:\\Users\\u\\.claude\\groups';
  assert.equal(groups.isGroupPath(root, 'C:\\Users\\u\\.claude\\groups\\group-2'), true);
  assert.equal(groups.isGroupPath(root, 'C:/Users/u/.claude/groups/group-2'), true);
  assert.equal(groups.isGroupPath(root, 'c:\\Users\\u\\.claude\\groups\\group-2'), true);
  assert.equal(groups.isGroupPath(root, 'C:\\Users\\u\\.claude\\groups-old\\group-2'), false);
  assert.equal(groups.groupIdFromPath(root, 'C:\\Users\\u\\.claude\\groups\\group-2'), 'group-2');
  assert.equal(groups.groupIdFromPath(root + '\\', 'C:/Users/u/.claude/groups/group-2/'), 'group-2');
  assert.equal(groups.groupIdFromPath(root, root), null);
});

// A WSL-backed account's root is POSIX even on Windows, and must stay so —
// path.join there would turn it into \home\u\… (CLAUDE.md, WSL rule 2).
test('a POSIX root is joined as POSIX', () => {
  const seen = [];
  const hostPath = (p) => { seen.push(p); return p; };
  groups.readGroup('/home/u/.claude/groups', 'group-1', hostPath);
  assert.deepEqual(seen, ['/home/u/.claude/groups/group-1/wooton-group.json']);
  assert.equal(groups.groupsRoot('/home/u/.claude'), '/home/u/.claude/groups');
});

test('changing a group\'s projects rewrites CLAUDE.md from the manifest', () => {
  const { home, root } = tmpRoot();
  try {
    const { group } = groups.createGroup(root, { projects: ['/repo/a', '/repo/b'] });
    const res = groups.setProjects(root, group.id, ['/repo/a', '/repo/b', '/repo/c']);
    assert.ok(res.ok);
    assert.deepEqual(groups.readGroup(root, group.id).projects, ['/repo/a', '/repo/b', '/repo/c']);
    assert.match(fs.readFileSync(path.join(group.dir, 'CLAUDE.md'), 'utf8'), /\/repo\/c/);
    assert.equal(groups.setProjects(root, 'group-99', ['/x']).ok, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('groups list newest first and skip folders with no manifest', () => {
  const { home, root } = tmpRoot();
  try {
    const first = groups.createGroup(root, { projects: ['/a', '/b'], name: 'first' }).group;
    const manifest = path.join(first.dir, groups.MANIFEST);
    const older = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    older.created = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(manifest, JSON.stringify(older));
    groups.createGroup(root, { projects: ['/a', '/b'], name: 'second' });
    fs.mkdirSync(path.join(root, 'stray'));

    assert.deepEqual(groups.listGroups(root).map(g => g.name), ['second', 'first']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('a missing groups root lists nothing rather than throwing', () => {
  assert.deepEqual(groups.listGroups(path.join(os.tmpdir(), 'wootonpad-no-such-dir', 'groups')), []);
});
