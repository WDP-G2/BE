/**
 * Chặn mọi commit/push gắn Cursor Agent (author, committer, Co-authored-by).
 */

var CURSOR_AGENT_PATTERNS = [
  /cursoragent@cursor\.com/i,
  /\bco-authored-by:\s*cursor\b/i,
  /\bco-authored-by:.*cursoragent/i,
];

var CURSOR_AUTHOR_PATTERNS = [/^cursor$/i, /^cursor agent$/i, /cursoragent/i];

function isCursorAgentIdentity(name, email) {
  name = name || "";
  email = email || "";
  var combined = (name + " " + email).trim();
  if (CURSOR_AGENT_PATTERNS.some(function (re) { return re.test(combined); })) return true;
  if (CURSOR_AUTHOR_PATTERNS.some(function (re) { return re.test(String(name).trim()); })) return true;
  return String(email).trim().toLowerCase() === "cursoragent@cursor.com";
}

function messageHasCursorAgent(message) {
  message = message || "";
  return CURSOR_AGENT_PATTERNS.some(function (re) { return re.test(message); });
}

function stripCursorAgentFromMessage(message) {
  return String(message || "")
    .split(/\r?\n/)
    .filter(function (line) { return !/^\s*Co-authored-by:\s*Cursor\b/i.test(line); })
    .filter(function (line) { return !/cursoragent@cursor\.com/i.test(line); })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function assertNoCursorAgent(options) {
  options = options || {};
  var name = options.name;
  var email = options.email;
  var message = options.message;
  var context = options.context || "commit";

  if (isCursorAgentIdentity(name, email)) {
    throw new Error(
      "[BLOCKED] " + context + ': author/committer "' + name + " <" + email + '>" bị chặn (Cursor Agent).',
    );
  }
  if (messageHasCursorAgent(message)) {
    throw new Error(
      "[BLOCKED] " + context + ": message chứa Co-authored-by Cursor / cursoragent@cursor.com.",
    );
  }
}

module.exports = {
  CURSOR_AGENT_PATTERNS: CURSOR_AGENT_PATTERNS,
  CURSOR_AUTHOR_PATTERNS: CURSOR_AUTHOR_PATTERNS,
  isCursorAgentIdentity: isCursorAgentIdentity,
  messageHasCursorAgent: messageHasCursorAgent,
  stripCursorAgentFromMessage: stripCursorAgentFromMessage,
  assertNoCursorAgent: assertNoCursorAgent,
};
