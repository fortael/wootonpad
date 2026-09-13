// "Is this MCP server actually reachable?"
//
// The accounts panel lists what a Claude home has configured; this answers
// whether the thing on the other end responds. Same handshake the CLI performs
// on startup — an `initialize` JSON-RPC call — so a green here means the CLI
// would connect too, not merely that a port is open.
//
// The config passed in is always resolved from the account's own files by the
// caller (see resolveServerConfig). The renderer names a server; it never
// supplies the command this module runs.

const { spawn } = require('child_process');

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 8000;
// A streaming-HTTP server answers `initialize` and then holds the response
// open. Once the status line is in, waiting on the rest of the body proves
// nothing, so the read gets its own short leash.
const BODY_READ_MS = 2000;

function initializeRequest() {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'wootonpad', version: '1.0.0' },
    },
  };
}

// The states the panel renders. 'auth' is separated from the other failures on
// purpose: it is the one a user fixes with `claude mcp` rather than by fixing
// the server.
const STATE = {
  OK: 'ok',
  AUTH: 'auth',
  UNREACHABLE: 'unreachable',
  NOT_FOUND: 'not-found',
  TIMEOUT: 'timeout',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

function serverInfoFrom(text) {
  if (!text) return null;
  // Streaming transports wrap the payload in SSE frames; the JSON object is
  // what matters either way.
  const start = text.indexOf('{');
  if (start < 0) return null;
  for (const line of text.split(/\r?\n/)) {
    const body = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
    if (!body.startsWith('{')) continue;
    try {
      const msg = JSON.parse(body);
      if (msg?.result?.serverInfo) return msg.result.serverInfo;
      if (msg?.error) return { error: msg.error.message || String(msg.error.code || 'error') };
    } catch {}
  }
  return null;
}

function describeHttpStatus(status) {
  if (status === 401 || status === 403) {
    return { state: STATE.AUTH, message: `Authentication required (HTTP ${status}) — sign the server in with \`claude mcp\`.` };
  }
  if (status === 404) return { state: STATE.ERROR, message: 'HTTP 404 — no MCP endpoint at that URL.' };
  if (status === 405) return { state: STATE.ERROR, message: 'HTTP 405 — endpoint rejected the initialize POST.' };
  return { state: STATE.ERROR, message: `HTTP ${status}.` };
}

async function probeHttp(config, timeoutMs) {
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(config.headers && typeof config.headers === 'object' ? config.headers : {}),
  };
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(initializeRequest()),
      signal: controller.signal,
    });
    const bodyTimer = setTimeout(() => controller.abort(), BODY_READ_MS);
    let text = '';
    try { text = await res.text(); } catch {}
    clearTimeout(bodyTimer);

    if (!res.ok) return { ...describeHttpStatus(res.status), status: res.status };

    const info = serverInfoFrom(text);
    if (info?.error) return { state: STATE.ERROR, status: res.status, message: `Server replied with an error: ${info.error}` };
    if (info?.name) {
      return {
        state: STATE.OK,
        status: res.status,
        message: `Connected — ${info.name}${info.version ? ' ' + info.version : ''}.`,
        serverInfo: info,
      };
    }
    return { state: STATE.OK, status: res.status, message: `Endpoint answered (HTTP ${res.status}).` };
  } catch (err) {
    return httpError(err, controller.signal.aborted, timeoutMs);
  } finally {
    clearTimeout(overall);
  }
}

// SSE servers open the stream first and take the POST on a URL they hand back
// in the first event, so the reachable question is answered by the GET alone.
async function probeSse(config, timeoutMs) {
  const controller = new AbortController();
  const overall = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(config.url, {
      method: 'GET',
      headers: { accept: 'text/event-stream', ...(config.headers || {}) },
      signal: controller.signal,
    });
    controller.abort(); // the stream stays open by design; the status is enough
    if (!res.ok) return { ...describeHttpStatus(res.status), status: res.status };
    return { state: STATE.OK, status: res.status, message: 'SSE endpoint reachable.' };
  } catch (err) {
    return httpError(err, controller.signal.aborted, timeoutMs);
  } finally {
    clearTimeout(overall);
  }
}

function httpError(err, aborted, timeoutMs) {
  if (aborted) return { state: STATE.TIMEOUT, message: `No response within ${Math.round(timeoutMs / 1000)}s.` };
  const code = err?.cause?.code || err?.code || '';
  if (code === 'ECONNREFUSED') return { state: STATE.UNREACHABLE, message: 'Connection refused — nothing listening there.' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { state: STATE.UNREACHABLE, message: 'Host not found.' };
  if (code) return { state: STATE.UNREACHABLE, message: `${code}.` };
  return { state: STATE.ERROR, message: err?.message || 'Request failed.' };
}

// A stdio server is a process: start it, speak the handshake on its stdin, and
// see whether a JSON-RPC reply comes back. Killed as soon as it answers — this
// is a probe, not a session.
function probeStdio(config, { timeoutMs, wrapArgv, env }) {
  return new Promise((resolve) => {
    const argv = [config.command, ...(Array.isArray(config.args) ? config.args.map(String) : [])];
    const [file, args] = wrapArgv ? wrapArgv(argv) : [argv[0], argv.slice(1)];

    let child;
    try {
      child = spawn(file, args, {
        env: { ...process.env, ...env, ...(config.env && typeof config.env === 'object' ? config.env : {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      resolve({ state: STATE.ERROR, message: err?.message || 'Could not start the command.' });
      return;
    }

    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      // A server that ignores SIGTERM must not be left behind.
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1500).unref?.();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        state: STATE.TIMEOUT,
        message: `Started, but did not answer initialize within ${Math.round(timeoutMs / 1000)}s.`,
        detail: stderr.trim().slice(-400) || undefined,
      });
    }, timeoutMs);

    child.on('error', (err) => {
      if (err?.code === 'ENOENT') {
        finish({ state: STATE.NOT_FOUND, message: `Command not found: ${config.command}` });
      } else if (err?.code === 'EACCES') {
        finish({ state: STATE.ERROR, message: `Not executable: ${config.command}` });
      } else {
        finish({ state: STATE.ERROR, message: err?.message || 'Could not start the command.' });
      }
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 64 * 1024) stdout = stdout.slice(-8192);
      const info = serverInfoFrom(stdout);
      if (info?.error) {
        finish({ state: STATE.ERROR, message: `Server replied with an error: ${info.error}` });
      } else if (info?.name) {
        finish({
          state: STATE.OK,
          message: `Connected — ${info.name}${info.version ? ' ' + info.version : ''}.`,
          serverInfo: info,
        });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });

    child.on('close', (code) => {
      finish({
        state: STATE.ERROR,
        message: `Process exited (code ${code}) before completing the handshake.`,
        detail: stderr.trim().slice(-400) || undefined,
      });
    });

    try {
      child.stdin.write(JSON.stringify(initializeRequest()) + '\n');
    } catch (err) {
      finish({ state: STATE.ERROR, message: err?.message || 'Could not write to the process.' });
    }
    child.stdin.on('error', () => {});
  });
}

async function probeMcpServer(config, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  const type = String(config?.type || '').toLowerCase() || (config?.command ? 'stdio' : config?.url ? 'http' : '');

  let result;
  if (!config) {
    result = { state: STATE.ERROR, message: 'Server is no longer in this account’s configuration.' };
  } else if (type === 'stdio') {
    result = await probeStdio(config, { timeoutMs, wrapArgv: options.wrapArgv, env: options.env });
  } else if (type === 'sse') {
    result = await probeSse(config, timeoutMs);
  } else if (type === 'http') {
    result = await probeHttp(config, timeoutMs);
  } else if (config?.url) {
    result = await probeHttp(config, timeoutMs);
  } else {
    result = { state: STATE.UNSUPPORTED, message: `Cannot probe a "${config?.type || 'unknown'}" server.` };
  }

  return { ...result, durationMs: Date.now() - started, checkedAt: Date.now() };
}

module.exports = { probeMcpServer, STATE, PROTOCOL_VERSION };
