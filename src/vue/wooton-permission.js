// wooton-permission.js — asking to use one of Buddy's own tools, as a question.
//
// A tool-permission prompt is normally a sentence and a clipped payload (see
// permission-describe.js), which for a tool this build has never heard of means
// raw JSON. Buddy's tools are not that: every one of them is defined in
// wooton-mcp.js, and each input field means something the user already knows —
// a TODO's title and checklist, the session about to be deleted, the projects
// a group will span. So these prompts are drawn the way AskUserQuestion is
// drawn: a question, the subject laid out as fields, and the answers as a
// numbered list of options with a label and a line of explanation each.
//
// Pure data; RequestDialog.vue draws it. Nothing here touches the DOM.

import { describeWootonCall, wootonToolName } from './wooton-tools.js';
import { parseDueToken } from '../../todo-due.js';

const clipText = (text, max = 600) => {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * A TODO body split into what the note will look like: checklist items, and
 * whatever prose sits around them. The model writes these as Markdown; showing
 * the Markdown source is the JSON problem one layer down.
 */
export function splitChecklist(body) {
  const items = [];
  const prose = [];
  for (const raw of String(body || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const box = /^[-*]\s*\[( |x|X)\]\s*(.*)$/.exec(line);
    if (box) {
      // An item's own date is shown as a date, not as a `due:` token in its text.
      const { due, text } = parseDueToken(box[2]);
      items.push({ text: due ? `${text} · due ${due}` : text, done: box[1] !== ' ' });
    }
    else prose.push(line.replace(/^#+\s*/, ''));
  }
  return { items, note: prose.join('\n') };
}

// Per tool: the question, what "yes" is called and what it does, what "always"
// is called, and which input fields are worth laying out. Anything not listed
// falls back to a field per input key — still not JSON.
const TOOLS = {
  create_todo: {
    question: 'Add this TODO?',
    effect: "Writes a note to your account's TODOs",
    allow: 'Add it',
    always: "Add TODOs without asking",
    fields(input) {
      const { items, note } = splitChecklist(input.body);
      return [
        input.title && { kind: 'text', label: 'Title', value: input.title, strong: true },
        input.due && { kind: 'text', label: 'Due', value: String(input.due) },
        items.length && { kind: 'checklist', label: 'Checklist', items },
        note && { kind: 'block', label: 'Note', value: clipText(note) },
      ];
    },
  },
  set_todo_due: {
    question: 'Change this due date?',
    effect: 'Rewrites the date in the note',
    allow: 'Change it',
    always: 'Change due dates without asking',
    fields: input => [
      { kind: 'text', label: 'Note', value: input.filename },
      { kind: 'text', label: 'Item', value: Number.isInteger(input.index) ? `#${input.index}` : 'the whole list' },
      { kind: 'text', label: 'Due', value: String(input.due ?? 'none'), strong: true },
    ],
  },
  toggle_todo: {
    question: 'Tick off this TODO item?',
    effect: 'Marks the item done',
    allow: 'Tick it',
    always: 'Tick items without asking',
    fields: input => [
      { kind: 'text', label: 'Note', value: input.filename },
      { kind: 'text', label: 'Item', value: `#${input.index}` },
    ],
  },
  create_session: {
    question: 'Start a session?',
    effect: 'Opens a new session and sends it the brief',
    allow: 'Start it',
    always: 'Start sessions without asking',
    fields: input => [
      input.name && { kind: 'text', label: 'Name', value: input.name, strong: true },
      input.prompt && { kind: 'block', label: 'Brief', value: clipText(input.prompt) },
    ],
  },
  create_group_session: {
    question: 'Start a group session?',
    effect: 'Creates a group folder and starts a session in it',
    allow: 'Start it',
    always: 'Start group sessions without asking',
    fields: input => [
      input.name && { kind: 'text', label: 'Name', value: input.name, strong: true },
      input.prompt && { kind: 'block', label: 'Brief', value: clipText(input.prompt) },
    ],
  },
  send_to_session: {
    question: 'Send this to the session?',
    effect: 'The session gets it as its next prompt',
    allow: 'Send it',
    always: 'Send to sessions without asking',
    fields: input => [input.text && { kind: 'block', label: 'Message', value: clipText(input.text) }],
  },
  stop_session: {
    question: 'Stop this session?',
    effect: 'Ends the process — the transcript stays',
    allow: 'Stop it',
    always: 'Stop sessions without asking',
    fields: () => [],
  },
  archive_session: {
    question: 'Archive this session?',
    effect: 'Hides it from the list — you can unarchive it',
    allow: 'Archive it',
    always: 'Archive sessions without asking',
    fields: () => [],
  },
  delete_session: {
    question: 'Delete this session for good?',
    effect: 'Removes the transcript from disk',
    allow: 'Delete it',
    // Never offered: a standing yes to something irreversible is how a wrong
    // guess by the model becomes a lost transcript.
    always: null,
    warning: 'The transcript is deleted from disk. This cannot be undone.',
    fields: () => [],
  },
  set_group_projects: {
    question: "Change the group's projects?",
    effect: "Rewrites the group's CLAUDE.md with the new list",
    allow: 'Change them',
    always: 'Change groups without asking',
    fields: input => [{ kind: 'text', label: 'Group', value: input.groupId }],
  },
};

/** Any input, as fields — the fallback for a tool not in the table. */
function genericFields(input, skip) {
  const out = [];
  for (const [key, value] of Object.entries(input || {})) {
    if (skip.has(key) || value === undefined || value === null || value === '') continue;
    const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    if (Array.isArray(value)) out.push({ kind: 'list', label, items: value.map(v => String(v)) });
    else if (typeof value === 'object') out.push({ kind: 'block', label, value: clipText(JSON.stringify(value, null, 2)) });
    else if (String(value).includes('\n') || String(value).length > 80) out.push({ kind: 'block', label, value: clipText(value) });
    else out.push({ kind: 'text', label, value: String(value) });
  }
  return out;
}

/**
 * @param {string} toolName   `mcp__wooton__…`
 * @param {object} input
 * @param {{ suggestions?: unknown[] }} [request]
 * @returns {{
 *   question: string, icon: string, kind: 'read'|'write'|'danger',
 *   projects: string[], sessions: string[], warning: string,
 *   fields: Array<object>,
 *   choices: Array<{ id: string, label: string, description: string, tone?: string }>,
 * }}
 */
export function describeWootonPermission(toolName, input, request) {
  const it = (input && typeof input === 'object') ? input : {};
  const name = wootonToolName(toolName);
  const call = describeWootonCall(toolName, it);
  const spec = TOOLS[name];

  // Projects and sessions are drawn as chips above the fields, so they are
  // taken out of the per-key fallback rather than listed twice.
  const consumed = new Set(['projectPath', 'projects', 'sessionId']);
  const fields = (spec ? spec.fields(it) : genericFields(it, consumed)).filter(Boolean);

  const choices = [{
    id: 'allow',
    label: spec?.allow || 'Yes',
    description: spec?.effect || '',
    tone: call.kind === 'danger' ? 'danger' : 'primary',
  }];
  // The CLI offers "always" only when it has a rule to write for it; a tool
  // that must never be pre-approved does not offer it at all.
  if (request?.suggestions?.length && spec?.always !== null) {
    choices.push({
      id: 'always',
      label: spec?.always || "Yes, and don't ask again",
      description: 'Adds this to your permission rules',
    });
  }
  choices.push({ id: 'deny', label: "Don't", description: 'Tell Buddy what to do instead', tone: 'muted' });

  return {
    question: spec?.question || `${call.verb || 'Use this tool'}?`,
    icon: call.icon,
    kind: call.kind,
    projects: call.projects,
    sessions: call.sessions,
    warning: spec?.warning || '',
    fields,
    choices,
  };
}
