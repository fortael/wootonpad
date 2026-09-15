const test = require('node:test');
const assert = require('node:assert/strict');
const { stripInheritedClaudeEnv, isNested } = require('../claude-env');

// The environment observed when the app was launched from inside a Claude Code
// session. Every one of these is the parent's, and the CLI reads them as its
// own. Copied from a real process rather than invented.
const NESTED = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/zakhar',
  ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
  CLAUDECODE: '1',
  CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
  CLAUDE_CODE_CHILD_SESSION: '1',
  CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1',
  CLAUDE_CODE_SESSION_ID: 'ddf5ff9a-995b-4dd3-8895-12329612efde',
  CLAUDE_CODE_HOST_SESSION_ID: 'local_a3455856',
  CLAUDE_CODE_MESSAGING_TOKEN: 'bf64314a98a52b27a86d2a44aadd048c',
  CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/54090.sock',
  CLAUDE_CODE_OAUTH_SCOPES: 'user:inference',
  CLAUDE_AGENT_SDK_VERSION: '0.3.266',
  CLAUDE_EFFORT: 'xhigh',
  CLAUDE_PID: '54090',
};

test('a nested launch is recognised by any of the three markers', () => {
  assert.equal(isNested({ CLAUDECODE: '1' }), true);
  assert.equal(isNested({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), true);
  assert.equal(isNested({ CLAUDE_CODE_SESSION_ID: 'abc' }), true);
  assert.equal(isNested({ PATH: '/bin' }), false);
  assert.equal(isNested({}), false);
});

// The one that was actually noticed: it turns off the title the CLI generates
// itself on the first turn, so every session started this way stayed unnamed.
test('the switch that disables session titling does not survive', () => {
  const out = stripInheritedClaudeEnv(NESTED);
  assert.equal('CLAUDE_CODE_DISABLE_TERMINAL_TITLE' in out, false);
});

test("a parent's session identity does not survive", () => {
  const out = stripInheritedClaudeEnv(NESTED);
  for (const key of [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_HOST_SESSION_ID',
    'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_OAUTH_SCOPES',
    'CLAUDE_AGENT_SDK_VERSION',
    'CLAUDE_EFFORT',
    'CLAUDE_PID',
  ]) {
    assert.equal(key in out, false, `${key} leaked through`);
  }
});

test('everything that is not Claude’s is left alone', () => {
  const out = stripInheritedClaudeEnv(NESTED);
  assert.equal(out.PATH, '/usr/bin:/bin');
  assert.equal(out.HOME, '/Users/zakhar');
  // Credentials and endpoints are the user's, not a session's.
  assert.equal(out.ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
});

// Configuration rather than session identity: exported in a shell profile and
// meant for every Claude the user runs, including this one.
test('deliberate configuration survives the strip', () => {
  const out = stripInheritedClaudeEnv({
    ...NESTED,
    CLAUDE_CONFIG_DIR: '/Users/zakhar/.switchboard/accounts/acc-1',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192',
  });
  assert.equal(out.CLAUDE_CONFIG_DIR, '/Users/zakhar/.switchboard/accounts/acc-1');
  assert.equal(out.CLAUDE_CODE_USE_BEDROCK, '1');
  assert.equal(out.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '8192');
});

// Not nested means there is no parent to have set these, so a CLAUDE_* variable
// can only be something the user meant. Taking it away would be the bug.
test('a normal launch keeps every variable it was given', () => {
  const plain = {
    PATH: '/usr/bin',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192',
    CLAUDE_CONFIG_DIR: '/somewhere',
  };
  assert.deepEqual(stripInheritedClaudeEnv(plain), plain);
});

test('the environment it was handed is not modified', () => {
  const input = { ...NESTED };
  const out = stripInheritedClaudeEnv(input);
  assert.deepEqual(input, NESTED);
  assert.notEqual(out, input);
});

test('an empty environment is not a nested one', () => {
  assert.deepEqual(stripInheritedClaudeEnv({}), {});
});

// The deny-list approach this replaced: a list of names falls one CLI release
// behind and then fails silently, which is the failure this module exists to
// prevent. Anything Claude's that is not explicitly kept goes.
test('a variable no release has invented yet still goes', () => {
  const out = stripInheritedClaudeEnv({ ...NESTED, CLAUDE_CODE_SOMETHING_NEW: '1' });
  assert.equal('CLAUDE_CODE_SOMETHING_NEW' in out, false);
});
