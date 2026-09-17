const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { stageArgv, commitArgv, commitPathsArgv, untrackedArgv } = require('../git-staging.js');

// The bug, in one sentence: committing from the panel ran `git add -A`, which
// stages untracked files, while the list the panel shows is `git diff HEAD`,
// which does not. So .DS_Store went into commits having never been on screen.
//
// These run real git in a temp repo rather than asserting on a string, because
// the thing that was wrong was what git does with a flag, not what we meant.

function git(cwd, argv) {
  return execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wootonpad-git-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'one\n');
  git(dir, ['add', 'tracked.txt']);
  git(dir, ['commit', '-qm', 'first']);
  return dir;
}

/** What the last commit actually contains. */
function committedFiles(dir) {
  return git(dir, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean);
}

test('an untracked file is not committed', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk');

    git(dir, stageArgv());
    git(dir, commitArgv('edit'));

    assert.deepEqual(committedFiles(dir), ['tracked.txt']);
    // Still there, still untracked — not committed, not deleted, not ignored.
    assert.ok(fs.existsSync(path.join(dir, '.DS_Store')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The regression guard proper: this is what the old code did.
test('`git add -A` is what put it there', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk');

    git(dir, ['add', '-A']);
    git(dir, commitArgv('edit'));

    assert.deepEqual(committedFiles(dir).sort(), ['.DS_Store', 'tracked.txt']);
    assert.ok(!stageArgv().includes('-A'), 'the app must not stage with -A');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a deleted file is still committed', () => {
  const dir = repo();
  try {
    fs.unlinkSync(path.join(dir, 'tracked.txt'));
    git(dir, stageArgv());
    git(dir, commitArgv('drop it'));
    assert.deepEqual(committedFiles(dir), ['tracked.txt']);
    assert.equal(git(dir, ['ls-files']).trim(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A file staged by hand in a terminal is in `git diff HEAD`, so the panel was
// showing it, so committing it is the commit matching the list.
test('a new file the user staged themselves is committed', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, 'new.txt'), 'hello\n');
    git(dir, ['add', 'new.txt']);
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk');

    git(dir, stageArgv());
    git(dir, commitArgv('add new'));

    assert.deepEqual(committedFiles(dir), ['new.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The count the panel prints beside the commit box.
test('the untracked list is what a commit will skip', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(dir, 'scratch.txt'), 'x');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n');
    fs.writeFileSync(path.join(dir, 'ignored.txt'), 'x');

    const others = git(dir, untrackedArgv()).split('\n').filter(Boolean).sort();
    // .gitignore itself is untracked too, and an ignored file is not listed:
    // --exclude-standard is what keeps the count honest.
    assert.deepEqual(others, ['.DS_Store', '.gitignore', 'scratch.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Unchecking a file ─────────────────────────────────────────────
//
// The boxes in the tree. `git commit -- <paths>` commits the working-tree state
// of those paths and leaves everything else alone — no stash, no index dance —
// which is what "not this one, this time" has to mean.

test('only the named files are committed', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(dir, 'other.txt'), 'x\n');
    git(dir, ['add', 'other.txt']);
    git(dir, ['commit', '-qm', 'second']);
    fs.writeFileSync(path.join(dir, 'other.txt'), 'y\n');

    git(dir, commitPathsArgv('just the one', ['tracked.txt']));

    assert.deepEqual(committedFiles(dir), ['tracked.txt']);
    // The one left out is still a pending change, not lost and not stashed.
    assert.match(git(dir, ['status', '--short']), /other\.txt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a deleted file can be committed by name', () => {
  const dir = repo();
  try {
    fs.unlinkSync(path.join(dir, 'tracked.txt'));
    git(dir, commitPathsArgv('drop it', ['tracked.txt']));
    assert.deepEqual(committedFiles(dir), ['tracked.txt']);
    assert.equal(git(dir, ['ls-files']).trim(), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A file added from the untracked section and then left checked.
test('a newly added file can be committed by name', () => {
  const dir = repo();
  try {
    fs.writeFileSync(path.join(dir, 'new.txt'), 'hello\n');
    git(dir, ['add', '--', 'new.txt']);
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'two\n');

    git(dir, commitPathsArgv('add new', ['new.txt']));

    assert.deepEqual(committedFiles(dir), ['new.txt']);
    assert.match(git(dir, ['status', '--short']), /tracked\.txt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the pathspec is closed off so a filename cannot become a flag', () => {
  assert.deepEqual(
    commitPathsArgv('m', ['--amend']),
    ['commit', '-m', 'm', '--', '--amend'],
  );
});
