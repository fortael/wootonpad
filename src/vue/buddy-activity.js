// buddy-activity.js — what Buddy is doing right now, in a few words.
//
// The mascot's bubble speaks only while the assistant works, and what it says
// is the work itself: the tool it just called, said as something in progress
// ("Checking what is due"), or that it is thinking or writing the answer. A
// fixed "On it" under a busy robot read as a blinking label; a line that
// changes with every step is what makes it look alive.
//
// Pure: fed the live SDK messages of the Chat session (see ChatSidebarApp.vue).

import { isWootonTool, wootonToolName } from './wooton-tools.js';

// Buddy's own tools, said as they happen. One per tool in wooton-mcp.js;
// anything missing falls back to "Working".
const DOING = {
  list_projects: 'Looking at projects',
  list_sessions: 'Going through sessions',
  read_session: 'Reading a session',
  peek_active_sessions: 'Peeking at running sessions',
  search_sessions: 'Searching sessions',
  list_groups: 'Checking groups',
  git_status: 'Checking git',
  unpushed_work: 'Looking for unpushed commits',
  account_limits: 'Checking usage limits',
  list_todos: 'Reading TODOs',
  todo_agenda: 'Checking what is due',
  list_project_files: 'Browsing files',
  read_project_file: 'Reading a file',
  list_containers: 'Checking containers',
  create_session: 'Starting a session',
  create_group_session: 'Starting a group session',
  send_to_session: 'Messaging a session',
  stop_session: 'Stopping a session',
  archive_session: 'Archiving',
  delete_session: 'Deleting a session',
  set_group_projects: 'Regrouping projects',
  create_todo: 'Writing a TODO',
  toggle_todo: 'Ticking a box',
  set_todo_due: 'Moving a deadline',
  archive_todo: 'Tidying TODOs',
  stop_containers: 'Stopping containers',
  open_url: 'Opening a link',
  open_in_app: 'Opening an editor',
  open_folder: 'Opening a folder',
  open_terminal: 'Opening a terminal',
};

// The SDK's own tools Buddy is allowed.
const BUILT_IN = {
  Agent: 'Sending a helper',
  Task: 'Sending a helper',
  ToolSearch: 'Finding the right tool',
  AskUserQuestion: 'Asking you',
  TodoWrite: 'Making a plan',
  WebSearch: 'Searching the web',
  WebFetch: 'Reading a web page',
};

const baseName = p => String(p || '').split('/').filter(Boolean).pop() || '';

/** A tool call as a line: "Reading README.md", "Searching “censor”". */
export function toolActivity(name, input = {}) {
  if (isWootonTool(name)) {
    const own = wootonToolName(name);
    if (own === 'read_project_file' && input.path) return `Reading ${baseName(input.path)}`;
    if (own === 'search_sessions' && input.query) return `Searching “${String(input.query).slice(0, 24)}”`;
    return DOING[own] || 'Working';
  }
  return BUILT_IN[name] || 'Working';
}

/**
 * The line one SDK message moves the bubble to, or null to leave it as it is.
 * A turn opening (`system/init`) and a tool coming back are thinking; a tool
 * call is that tool; text is the answer being written.
 */
export function activityFor(message) {
  if (!message) return null;
  if (message.type === 'system' && message.subtype === 'init') return 'Thinking';
  const content = message.message?.content;
  if (!Array.isArray(content)) return null;
  if (message.type === 'user') {
    return content.some(b => b?.type === 'tool_result') ? 'Thinking' : null;
  }
  if (message.type !== 'assistant') return null;
  // The last block is the newest thing it did.
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block?.type === 'tool_use') return toolActivity(block.name, block.input || {});
    if (block?.type === 'text' && block.text?.trim()) return 'Writing the answer';
    if (block?.type === 'thinking') return 'Thinking';
  }
  return null;
}
