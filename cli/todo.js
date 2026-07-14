#!/usr/bin/env node
// Todo 터미널 클라이언트.
// 웹앱과 같은 API를 써서 todo/메모/타임테이블이 그대로 연동된다.
// 의존성 없음 (Node 18+).
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const API_BASE = (process.env.TODO_API_BASE || process.env.ADHD_API_BASE || "https://158-179-193-175.nip.io").replace(/\/$/, "");
const SUPABASE_URL = (process.env.TODO_SUPABASE_URL || process.env.ADHD_SUPABASE_URL || "https://mkvgbffihswfjzgegwlx.supabase.co").replace(/\/$/, "");
const ANON_KEY =
  process.env.TODO_SUPABASE_ANON_KEY ||
  process.env.ADHD_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdmdiZmZpaHN3Zmp6Z2Vnd2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA5NzksImV4cCI6MjA5ODU0Njk3OX0.MrKmcsAMCU9fepyD97HMuSSImARjtchiCAaGRzgqsQ8";
const CONFIG_DIR = join(homedir(), ".config", "todo");
const SESSION_FILE = join(CONFIG_DIR, "session.json");
const LEGACY_SESSION_FILE = join(homedir(), ".config", "free-adhd-memo", "session.json");
const CALLBACK_PORT = 8787;

const style = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
const bold = (text) => style(1, text);
const dim = (text) => style(2, text);
const strike = (text) => style(9, text);
const green = (text) => style(32, text);
const yellow = (text) => style(33, text);
const red = (text) => style(31, text);
const cyan = (text) => style(36, text);

const scopeLabels = { day: "오늘", week: "이번 주", month: "이번 달" };

function loadSession() {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  } catch {
    try {
      return JSON.parse(readFileSync(LEGACY_SESSION_FILE, "utf8"));
    } catch {
      return {};
    }
  }
}

function saveSession(session) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`);
}

function fail(message) {
  console.error(red(message));
  process.exit(1);
}

async function refreshTokens(session) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const tokens = await response.json();
  const next = {
    ...session,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    email: tokens.user?.email || session.email,
  };
  saveSession(next);
  return next;
}

async function api(path, options = {}) {
  let session = loadSession();
  if (session.refresh_token && session.expires_at && Date.now() > session.expires_at - 60_000) {
    session = (await refreshTokens(session)) || session;
  }
  const headers = { ...(options.headers || {}) };
  if (session.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  let response = await fetch(`${API_BASE}${path}`, { ...options, headers }).catch(() => {
    fail(`서버에 연결할 수 없습니다: ${API_BASE}`);
  });
  if (response.status === 401 && session.refresh_token) {
    const refreshed = await refreshTokens(session);
    if (refreshed) {
      headers.Authorization = `Bearer ${refreshed.access_token}`;
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }
  if (response.status === 401) fail("로그인이 필요합니다. 먼저 `todo login`을 실행하세요.");
  if (!response.ok) fail(`API 오류 (${response.status}): ${await response.text()}`);
  return response.json();
}

function openBrowser(url) {
  const candidates =
    process.platform === "win32"
      ? [["rundll32", "url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? [["open", url]]
        : [["xdg-open", url], ["wslview", url], ["explorer.exe", url]];

  const tryCandidate = (index) => {
    if (index >= candidates.length) return;
    const [command, ...rest] = candidates[index];
    const child = spawn(command, rest, { stdio: "ignore", detached: true });
    child.on("error", () => tryCandidate(index + 1));
    child.unref();
  };
  tryCandidate(0);
}

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function login() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirect = `http://localhost:${CALLBACK_PORT}`;
  const authorizeUrl =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256`;

  const code = await new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, redirect);
      const receivedCode = url.searchParams.get("code");
      const errorDescription = url.searchParams.get("error_description");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h2>로그인 처리 완료. 터미널로 돌아가세요.</h2>");
      if (receivedCode || errorDescription) {
        server.close();
        if (receivedCode) resolve(receivedCode);
        else reject(new Error(errorDescription));
      }
    });
    server.listen(CALLBACK_PORT, () => {
      console.log("브라우저에서 Google 로그인을 완료하세요.");
      console.log(dim(`브라우저가 안 열리면 직접 여세요:\n${authorizeUrl}\n`));
      openBrowser(authorizeUrl);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("로그인 대기 시간(3분)이 지났습니다."));
    }, 180_000).unref();
  }).catch((error) => fail(`로그인 실패: ${error.message}`));

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!response.ok) fail(`토큰 교환 실패: ${await response.text()}`);
  const tokens = await response.json();
  saveSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    email: tokens.user?.email,
  });
  console.log(green(`로그인 완료: ${tokens.user?.email || ""}`));
}

function extractTags(text) {
  return Array.from(text.matchAll(/#([\p{L}\p{N}_-]+)/gu)).map((match) => match[1]);
}

function extractTodos(text) {
  return text
    .split("\n")
    .map((line) => line.match(/^\s*(?:-\s*\[\s?\]|todo:)\s*(.+)$/i)?.[1]?.trim())
    .filter(Boolean);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "1분 미만";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortedTodos(todos) {
  const order = ["day", "week", "month"];
  return order.flatMap((scope) => {
    const roots = orderedSiblings(todos, scope);
    return roots.flatMap((root) => [root, ...orderedSiblings(todos, scope, root.id)]);
  });
}

function recordUndo(action) {
  const session = loadSession();
  session.lastAction = { ...action, at: new Date().toISOString() };
  saveSession(session);
}

function clearUndo() {
  const session = loadSession();
  delete session.lastAction;
  saveSession(session);
}

async function undoLast() {
  const action = loadSession().lastAction;
  if (!action) fail("되돌릴 작업이 없습니다. (add/done/rm 직후에만 가능)");
  if (action.kind === "create") {
    await api(`/api/todos/${encodeURIComponent(action.id)}`, { method: "DELETE" });
    console.log(yellow(`추가 취소: ${action.title}`));
  } else if (action.kind === "toggle") {
    await api(`/api/todos/${encodeURIComponent(action.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: action.done, completedAt: action.done ? action.completedAt || new Date().toISOString() : null }),
    });
    console.log(yellow(`완료 상태 되돌림: ${action.title}`));
  } else if (action.kind === "delete") {
    for (const todo of action.todos) {
      await api("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todo),
      });
    }
    const extra = action.todos.length > 1 ? dim(` (+하위 ${action.todos.length - 1}개)`) : "";
    console.log(green(`복구됨: ${action.todos[0].title}`) + extra);
  } else {
    fail("알 수 없는 작업이라 되돌릴 수 없습니다.");
  }
  clearUndo();
}

async function listTodos(args = []) {
  const data = await api("/api/data");
  const flat = sortedTodos(data.todos);
  if (args.includes("--json")) {
    console.log(JSON.stringify(flat.map((todo, index) => ({ number: index + 1, ...todo })), null, 2));
    return;
  }
  if (!flat.length) {
    console.log(dim("할 일이 없습니다. `todo add \"제목\"`으로 추가하세요."));
    return;
  }
  let index = 0;
  let currentScope = null;
  for (const todo of flat) {
    if (todo.scope !== currentScope) {
      currentScope = todo.scope;
      console.log(`\n${bold(cyan(scopeLabels[currentScope]))}`);
    }
    index += 1;
    const number = dim(String(index).padStart(2, " "));
    const mark = todo.done ? green("✓") : "○";
    const title = todo.done ? dim(strike(todo.title)) : todo.title;
    const category = todo.category ? cyan(`[${todo.category}] `) : "";
    const due = todo.dueDate ? dim(`  ~${todo.dueDate}`) : "";
    const note = todo.note ? dim(" ✎") : "";
    const children = flat.filter((item) => item.parentId === todo.id);
    const prefix = todo.parentId ? "    └ " : children.length ? "▾ " : "  ";
    const progress = children.length ? dim(` (${children.filter((item) => item.done).length}/${children.length})`) : "";
    console.log(`${number} ${prefix}${mark} ${category}${title}${progress}${due}${note}`);
  }
  console.log();
}

async function todoByNumber(number) {
  const data = await api("/api/data");
  const flat = sortedTodos(data.todos);
  const todo = flat[number - 1];
  if (!todo) fail(`${number}번 할 일이 없습니다. \`todo\`로 번호를 확인하세요.`);
  return todo;
}

async function addTodo(args) {
  const scope = args.includes("-m") ? "month" : args.includes("-w") ? "week" : "day";
  const dueIndex = args.indexOf("-d");
  const dueDate = dueIndex >= 0 ? args[dueIndex + 1] : null;
  const catIndex = args.indexOf("-c");
  const category = catIndex >= 0 ? args[catIndex + 1] : null;
  const title = args
    .filter(
      (arg, i) =>
        !arg.startsWith("-") && (dueIndex < 0 || i !== dueIndex + 1) && (catIndex < 0 || i !== catIndex + 1),
    )
    .join(" ")
    .trim();
  if (!title) fail('사용법: todo add "제목" [-w 이번주 | -m 이번달] [-d 2026-07-20] [-c 카테고리]');
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail("마감일은 YYYY-MM-DD 형식으로 넣으세요.");
  const id = randomUUID();
  await api("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      title,
      scope,
      done: false,
      createdAt: new Date().toISOString(),
      dueDate,
      category,
    }),
  });
  recordUndo({ kind: "create", id, title });
  console.log(green(`추가됨 (${scopeLabels[scope]}): ${title}`) + (category ? dim(` [${category}]`) : ""));
}

async function toggleTodo(number) {
  const todo = await todoByNumber(number);
  const done = !todo.done;
  await api(`/api/todos/${encodeURIComponent(todo.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done, completedAt: done ? new Date().toISOString() : undefined }),
  });
  recordUndo({ kind: "toggle", id: todo.id, title: todo.title, done: todo.done, completedAt: todo.completedAt || null });
  console.log(done ? green(`완료: ${todo.title}`) : yellow(`다시 미완료로: ${todo.title}`));
}

async function removeTodo(number) {
  const data = await api("/api/data");
  const flat = sortedTodos(data.todos);
  const todo = flat[number - 1];
  if (!todo) fail(`${number}번 할 일이 없습니다. \`todo\`로 번호를 확인하세요.`);
  const removed = [todo, ...data.todos.filter((item) => item.parentId === todo.id)];
  await api(`/api/todos/${encodeURIComponent(todo.id)}`, { method: "DELETE" });
  recordUndo({ kind: "delete", todos: removed });
  const extra = removed.length > 1 ? dim(` (하위 ${removed.length - 1}개 포함, \`todo undo\`로 복구)`) : dim(" (`todo undo`로 복구)");
  console.log(yellow(`삭제됨: ${todo.title}`) + extra);
}

async function addMemo(body) {
  if (!body.trim()) fail('사용법: todo memo "내용 #태그"');
  const createdAt = new Date().toISOString();
  const memoId = randomUUID();
  const todos = extractTodos(body).map((title) => ({
    id: randomUUID(),
    title,
    scope: "day",
    done: false,
    createdAt,
    sourceMemoId: memoId,
  }));
  await api("/api/memos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo: { id: memoId, body, createdAt, tags: extractTags(body), starred: false }, todos }),
  });
  console.log(green("메모 저장됨") + (todos.length ? dim(` (+ 할 일 ${todos.length}개 추출)`) : ""));
}

async function listMemos(count) {
  const data = await api("/api/data");
  const memos = data.memos.slice(0, count);
  if (!memos.length) {
    console.log(dim("메모가 없습니다."));
    return;
  }
  for (const memo of memos) {
    const date = new Date(memo.createdAt);
    const stamp = `${dateKey(date)} ${formatTime(memo.createdAt)}`;
    const star = memo.starred ? yellow("★ ") : "";
    console.log(`${dim(stamp)}  ${star}${memo.body.split("\n")[0]}`);
  }
}

async function showLog(args) {
  const data = await api("/api/data");
  const sessions = data.sessions || [];
  const today = dateKey(new Date());

  if (args.includes("--week")) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const startKey = dateKey(monday);
    const weekSessions = sessions.filter((session) => dateKey(new Date(session.startedAt)) >= startKey);
    if (!weekSessions.length) {
      console.log(dim("이번 주 기록이 없습니다."));
      return;
    }
    const totals = new Map();
    let totalMs = 0;
    for (const session of weekSessions) {
      const ms = new Date(session.endedAt) - new Date(session.startedAt);
      const label = session.label || "이름 없는 작업";
      totals.set(label, (totals.get(label) || 0) + ms);
      totalMs += ms;
    }
    console.log(bold(cyan("이번 주 타임테이블")));
    for (const [label, ms] of [...totals.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label.padEnd(20)} ${green(formatDuration(ms))}`);
    }
    console.log(dim(`  합계 ${formatDuration(totalMs)}`));
    return;
  }

  const todaySessions = sessions
    .filter((session) => dateKey(new Date(session.startedAt)) === today)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!todaySessions.length) {
    console.log(dim("오늘 기록이 없습니다. `todo track \"작업명\"`으로 시작하세요."));
    return;
  }
  console.log(bold(cyan("오늘 타임테이블")));
  let totalMs = 0;
  for (const session of todaySessions) {
    const ms = new Date(session.endedAt) - new Date(session.startedAt);
    totalMs += ms;
    console.log(
      `  ${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}  ${(session.label || "이름 없는 작업").padEnd(20)} ${dim(formatDuration(ms))}`,
    );
  }
  console.log(dim(`  합계 ${formatDuration(totalMs)}`));
}

async function trackStart(label) {
  const session = loadSession();
  if (session.tracking) {
    fail(`이미 기록 중입니다: "${session.tracking.label}" (${formatTime(session.tracking.startedAt)}~). 먼저 \`todo stop\`.`);
  }
  session.tracking = { id: randomUUID(), label: label.trim(), startedAt: new Date().toISOString() };
  saveSession(session);
  console.log(green(`기록 시작: ${session.tracking.label || "이름 없는 작업"} (${formatTime(session.tracking.startedAt)})`));
}

async function trackStop() {
  const session = loadSession();
  if (!session.tracking) fail("기록 중인 작업이 없습니다. `todo track \"작업명\"`으로 시작하세요.");
  const finished = { ...session.tracking, endedAt: new Date().toISOString() };
  await api("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(finished),
  });
  delete session.tracking;
  saveSession(session);
  const ms = new Date(finished.endedAt) - new Date(finished.startedAt);
  console.log(green(`기록 종료: ${finished.label || "이름 없는 작업"} · ${formatDuration(ms)}`));
}

function status() {
  const session = loadSession();
  console.log(`계정: ${session.email ? green(session.email) : dim("로그인 안 됨 (todo login)")}`);
  if (session.tracking) {
    const ms = Date.now() - new Date(session.tracking.startedAt).getTime();
    console.log(`기록 중: ${yellow(session.tracking.label || "이름 없는 작업")} · ${formatDuration(ms)} 경과`);
  } else {
    console.log(dim("기록 중인 작업 없음"));
  }
}

// 기본 ANSI 16색만 사용해서 사용자의 터미널 테마(색상 팔레트)를 그대로 따라간다.
const tuiColors = {
  reset: "\x1b[0m",
  coral: "\x1b[33m",
  mint: "\x1b[32m",
  blue: "\x1b[36m",
  cream: "\x1b[39m",
  muted: "\x1b[90m",
  danger: "\x1b[31m",
  selected: "\x1b[100m",
};

function terminalWidth(text) {
  return [...String(text)].reduce((width, char) => {
    const code = char.codePointAt(0);
    return width + (code >= 0x1100 && (code <= 0x115f || code >= 0x2e80) ? 2 : 1);
  }, 0);
}

function truncateTerminal(text, width) {
  if (width <= 0) return "";
  let result = "";
  let used = 0;
  for (const char of String(text)) {
    const size = terminalWidth(char);
    if (used + size > width) {
      while (result && terminalWidth(result) + 1 > width) result = [...result].slice(0, -1).join("");
      return width > 1 ? `${result}…` : "…";
    }
    result += char;
    used += size;
  }
  return result;
}

function padTerminal(text, width) {
  const clipped = truncateTerminal(text, width);
  return clipped + " ".repeat(Math.max(0, width - terminalWidth(clipped)));
}

function localTimestamp(value) {
  const date = new Date(value);
  return `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function todoOrderValue(todo) {
  return Number.isFinite(Number(todo.sortOrder)) ? Number(todo.sortOrder) : Number.MAX_SAFE_INTEGER;
}

function orderedSiblings(todos, scope, parentId = null) {
  return todos
    .filter((todo) => todo.scope === scope && (todo.parentId || null) === parentId)
    .sort((a, b) => todoOrderValue(a) - todoOrderValue(b) || a.createdAt.localeCompare(b.createdAt));
}

function categoryList(todos) {
  const names = todos.filter((todo) => !todo.parentId && todo.category).map((todo) => todo.category);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
}

function visibleTree(todos, collapsed, category = null) {
  const rows = [];
  for (const scope of ["day", "week", "month"]) {
    const roots = orderedSiblings(todos, scope).filter(
      (root) => !category || (root.category || null) === category,
    );
    for (const root of roots) {
      const children = orderedSiblings(todos, scope, root.id);
      rows.push({ todo: root, depth: 0, children, last: false });
      if (!collapsed.has(root.id)) {
        children.forEach((child, index) =>
          rows.push({ todo: child, depth: 1, children: [], last: index === children.length - 1 }),
        );
      }
    }
  }
  return rows;
}

function normalizedTreeItems(todos) {
  const items = [];
  for (const scope of ["day", "week", "month"]) {
    orderedSiblings(todos, scope).forEach((root, rootIndex) => {
      items.push({ id: root.id, parentId: null, sortOrder: rootIndex, scope });
      orderedSiblings(todos, scope, root.id).forEach((child, childIndex) => {
        items.push({ id: child.id, parentId: root.id, sortOrder: childIndex, scope });
      });
    });
  }
  return items;
}

function splitTerminalKeys(input) {
  const keys = [];
  const sequences = [
    "\x1b[1;2A",
    "\x1b[1;2B",
    "\x1b[1;2C",
    "\x1b[1;2D",
    "\x1b[1;5C",
    "\x1b[1;5D",
    "\x1b[Z",
    "\x1b[3~",
    "\x1b[H",
    "\x1b[F",
    "\x1bOH",
    "\x1bOF",
    "\x1b[A",
    "\x1b[B",
    "\x1b[C",
    "\x1b[D",
    "\x1bOA",
    "\x1bOB",
    "\x1bOC",
    "\x1bOD",
  ];
  let remaining = input;
  while (remaining) {
    const sequence = sequences.find((candidate) => remaining.startsWith(candidate));
    if (sequence) {
      keys.push(sequence);
      remaining = remaining.slice(sequence.length);
      continue;
    }
    const [char] = [...remaining];
    keys.push(char);
    remaining = remaining.slice(char.length);
  }
  return keys;
}

function createEditor(value = "") {
  return { value, cursor: [...value].length };
}

function editTerminalInput(editor, key) {
  const chars = [...editor.value];
  const cursor = Math.max(0, Math.min(editor.cursor, chars.length));
  const left = key === "\x1b[D" || key === "\x1bOD";
  const right = key === "\x1b[C" || key === "\x1bOC";
  const wordLeft = key === "\x1b[1;5D";
  const wordRight = key === "\x1b[1;5C";
  if (left) editor.cursor = Math.max(0, cursor - 1);
  else if (right) editor.cursor = Math.min(chars.length, cursor + 1);
  else if (wordLeft) {
    let next = cursor;
    while (next > 0 && /\s/.test(chars[next - 1])) next -= 1;
    while (next > 0 && !/\s/.test(chars[next - 1])) next -= 1;
    editor.cursor = next;
  } else if (wordRight) {
    let next = cursor;
    while (next < chars.length && !/\s/.test(chars[next])) next += 1;
    while (next < chars.length && /\s/.test(chars[next])) next += 1;
    editor.cursor = next;
  } else if (key === "\x1b[H" || key === "\x1bOH" || key === "\x01") editor.cursor = 0;
  else if (key === "\x1b[F" || key === "\x1bOF" || key === "\x05") editor.cursor = chars.length;
  else if (key === "\x7f" || key === "\b") {
    if (cursor > 0) {
      chars.splice(cursor - 1, 1);
      editor.value = chars.join("");
      editor.cursor = cursor - 1;
    }
  } else if (key === "\x1b[3~") {
    if (cursor < chars.length) {
      chars.splice(cursor, 1);
      editor.value = chars.join("");
    }
  } else if (key === "\x17") {
    let start = cursor;
    while (start > 0 && /\s/.test(chars[start - 1])) start -= 1;
    while (start > 0 && !/\s/.test(chars[start - 1])) start -= 1;
    chars.splice(start, cursor - start);
    editor.value = chars.join("");
    editor.cursor = start;
  } else if (key === "\x15") {
    chars.splice(0, cursor);
    editor.value = chars.join("");
    editor.cursor = 0;
  } else if (key === "\x0b") {
    chars.splice(cursor);
    editor.value = chars.join("");
  } else if (!key.startsWith("\x1b") && !/[\x00-\x1f]/.test(key)) {
    chars.splice(cursor, 0, key);
    editor.value = chars.join("");
    editor.cursor = cursor + 1;
  } else return false;
  return true;
}

function editorViewport(editor, width) {
  const chars = [...editor.value];
  const cursor = Math.max(0, Math.min(editor.cursor, chars.length));
  let start = 0;
  while (start < cursor && terminalWidth(chars.slice(start, cursor).join("")) >= width) start += 1;
  let end = start;
  let used = 0;
  while (end < chars.length) {
    const next = terminalWidth(chars[end]);
    if (used + next > width) break;
    used += next;
    end += 1;
  }
  return {
    text: chars.slice(start, end).join(""),
    cursorWidth: terminalWidth(chars.slice(start, cursor).join("")),
  };
}

async function runTui() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await listTodos();
    return;
  }

  const state = {
    todos: [],
    mode: "insert",
    input: createEditor(),
    selected: 0,
    selectedId: null,
    collapsed: new Set(),
    category: null,
    undoStack: [],
    prompt: null,
    message: "",
    busy: false,
    stopped: false,
    lastRender: "",
  };
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });

  const cleanup = () => {
    if (state.stopped) return;
    state.stopped = true;
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\x1b[?2026l\x1b[?25h\x1b[0 q\x1b[0m\x1b[?1049l");
    finish();
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  function rows() {
    return visibleTree(state.todos, state.collapsed, state.category);
  }

  function pushUndo(label, run) {
    state.undoStack.push({ label, run });
    if (state.undoStack.length > 50) state.undoStack.shift();
  }

  function syncSelection(preferredId = state.selectedId) {
    const currentRows = rows();
    if (!currentRows.length) {
      state.selected = 0;
      state.selectedId = null;
      return;
    }
    const preferredIndex = preferredId ? currentRows.findIndex((row) => row.todo.id === preferredId) : -1;
    state.selected = preferredIndex >= 0 ? preferredIndex : Math.min(state.selected, currentRows.length - 1);
    state.selectedId = currentRows[state.selected].todo.id;
  }

  async function refresh(preferredId) {
    const data = await api("/api/data");
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    if (state.category && !categoryList(state.todos).includes(state.category)) state.category = null;
    syncSelection(preferredId);
  }

  function selectedRow() {
    return rows()[state.selected] || null;
  }

  function renderTodoRow(row, selected, contentWidth) {
    const todo = row.todo;
    const mark = todo.done ? "[x]" : "[ ]";
    const children = row.children;
    const tree = row.depth
      ? `     ${row.last ? "└" : "├"} `
      : children.length
        ? `${state.collapsed.has(todo.id) ? "▸" : "▾"} `
        : "  ";
    const progress = children.length ? ` (${children.filter((child) => child.done).length}/${children.length})` : "";
    const created = contentWidth >= 46 ? localTimestamp(todo.createdAt) : localTimestamp(todo.createdAt).slice(11);
    const due = todo.dueDate && contentWidth >= 58 ? `  ⏳마감 ${todo.dueDate}` : "";
    const categoryTag = !row.depth && todo.category && !state.category ? `[${todo.category}] ` : "";
    const prefix = `${tree}${mark} `;
    const metadataWidth = terminalWidth(created) + terminalWidth(due);
    const leftWidth = Math.max(4, contentWidth - metadataWidth - 2);
    const left = padTerminal(`${prefix}${categoryTag}${todo.title}${progress}`, leftWidth);
    const gap = " ".repeat(Math.max(1, contentWidth - terminalWidth(left) - metadataWidth));
    const overdue = todo.dueDate && todo.dueDate < dateKey(new Date()) && !todo.done;
    const color = todo.done ? tuiColors.muted : row.depth ? tuiColors.cream : tuiColors.blue;
    const background = selected ? tuiColors.selected : "";
    const dueColor = overdue ? tuiColors.danger : tuiColors.muted;
    return `${background}${color}${left}${gap}${tuiColors.muted}${created}${dueColor}${due}${tuiColors.reset}`;
  }

  function render() {
    const width = Math.max(16, Math.min(process.stdout.columns || 90, 110));
    const height = Math.max(7, process.stdout.rows || 24);
    const inner = width - 4;
    const currentRows = rows();
    syncSelection();
    const rootCount = state.todos.filter((todo) => !todo.parentId).length;
    const modeLabel = state.prompt ? state.prompt.label : state.mode === "insert" ? "-- INSERT --" : "-- NORMAL --";
    const title = truncateTerminal(` To-Do (${rootCount}개)  ${modeLabel} `, width - 2);
    const top = `┌${title}${"─".repeat(Math.max(0, width - terminalWidth(title) - 2))}┐`;
    const categories = categoryList(state.todos);
    const showTabs = categories.length > 0;
    let tabsRow = "";
    if (showTabs) {
      let tabText = "";
      let tabWidth = 0;
      for (const category of [null, ...categories]) {
        const label = ` ${category || "전체"} `;
        const labelWidth = terminalWidth(label) + 1;
        if (tabWidth + labelWidth > inner) break;
        const active = category === state.category;
        tabText += (active ? `${tuiColors.selected}${label}${tuiColors.reset}` : `${tuiColors.muted}${label}${tuiColors.reset}`) + " ";
        tabWidth += labelWidth;
      }
      const hint = "Tab 전환";
      const hintWidth = terminalWidth(hint);
      const gap = inner - tabWidth;
      const tail = gap >= hintWidth ? `${" ".repeat(gap - hintWidth)}${tuiColors.muted}${hint}${tuiColors.reset}` : " ".repeat(Math.max(0, gap));
      tabsRow = `│ ${tabText}${tail} │`;
    }
    const headingLeft = width >= 32 ? " 목록  [ ] 내용 " : " 목록 ";
    const headingRight = width >= 58 ? " 생성시각 / 마감 " : width >= 24 ? " 시각 " : "";
    const dividerFill = "─".repeat(Math.max(0, width - terminalWidth(headingLeft) - terminalWidth(headingRight) - 2));
    const divider = `├${headingLeft}${dividerFill}${headingRight}┤`;
    const listHeight = Math.max(1, height - 7 - (showTabs ? 1 : 0));
    let start = Math.max(0, state.selected - Math.floor(listHeight / 2));
    start = Math.min(start, Math.max(0, currentRows.length - listHeight));
    const body = [];
    let lastScope = null;
    for (let index = start; index < Math.min(currentRows.length, start + listHeight); index += 1) {
      const row = currentRows[index];
      if (row.todo.scope !== lastScope && body.length < listHeight) {
        lastScope = row.todo.scope;
        const labelColor = row.todo.scope === "day" ? tuiColors.coral : row.todo.scope === "week" ? tuiColors.mint : tuiColors.blue;
        body.push(`│ ${labelColor}${padTerminal(`· ${scopeLabels[row.todo.scope]}`, inner)}${tuiColors.reset} │`);
        if (body.length >= listHeight) break;
      }
      body.push(`│ ${renderTodoRow(row, index === state.selected, inner)} │`);
    }
    if (!currentRows.length) body.push(`│ ${tuiColors.muted}${padTerminal("할 일이 없습니다. 아래에서 바로 입력해 보세요.", inner)}${tuiColors.reset} │`);
    while (body.length < listHeight) body.push(`│ ${" ".repeat(inner)} │`);
    const editor = state.prompt || (state.mode === "insert" ? state.input : null);
    const promptTitle = state.prompt
      ? ` ${state.prompt.label} · Enter 저장 · Esc 취소 `
      : state.mode === "insert"
        ? " 새 할 일 · Enter 추가 · Esc 명령모드 "
        : " 명령 ";
    const safePromptTitle = truncateTerminal(promptTitle, width - 2);
    const promptDivider = `├${safePromptTitle}${"─".repeat(Math.max(0, width - terminalWidth(safePromptTitle) - 2))}┤`;
    const status = state.message ? truncateTerminal(state.message, Math.min(12, Math.floor(inner / 3))) : "";
    const statusWidth = status ? terminalWidth(status) + 2 : 0;
    const editorWidth = Math.max(1, inner - statusWidth);
    const viewport = editor ? editorViewport(editor, editorWidth) : null;
    const normalHelp = "i 입력  s 하위  e 편집  t 마감  c 분류  Space 완료  d 삭제  u 되돌림  Tab 탭  q 종료";
    const promptContent = editor
      ? `${padTerminal(viewport.text, editorWidth)}${status ? `  ${status}` : ""}`
      : padTerminal(state.message || normalHelp, inner);
    const promptLine = `│ ${promptContent} │`;
    const bottom = `└${"─".repeat(width - 2)}┘`;
    const cursorColumn = Math.min(width - 2, 3 + (viewport?.cursorWidth || 0));
    const cursorRow = listHeight + 4 + (showTabs ? 1 : 0);
    const cursorPosition = editor ? `\x1b[${cursorRow};${cursorColumn}H\x1b[5 q\x1b[?25h` : "\x1b[?25l";
    const screen = `${top}\n${showTabs ? `${tabsRow}\n` : ""}${divider}\n${body.join("\n")}\n${promptDivider}\n${promptLine}\n${bottom}\x1b[J`;
    const renderKey = `${width}x${height}\n${screen}\n${cursorPosition}`;
    if (renderKey === state.lastRender) return;
    state.lastRender = renderKey;
    process.stdout.write(
      `\x1b[?2026h\x1b[?25l\x1b[H${screen}${cursorPosition}\x1b[?2026l`,
    );
  }

  async function mutate(callback) {
    if (state.busy) return;
    state.busy = true;
    state.message = "저장 중…";
    render();
    try {
      await callback();
      state.message = "저장됨";
    } finally {
      state.busy = false;
      render();
    }
  }

  async function createTodoFromInput(title, parentId = null) {
    const parent = parentId ? state.todos.find((todo) => todo.id === parentId) : null;
    const scope = parent?.scope || "day";
    const created = await api("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: randomUUID(),
        title,
        scope,
        parentId,
        done: false,
        createdAt: new Date().toISOString(),
        category: parentId ? undefined : state.category || undefined,
      }),
    });
    if (parentId) state.collapsed.delete(parentId);
    pushUndo(`추가: ${title}`, async () => {
      await api(`/api/todos/${encodeURIComponent(created.id)}`, { method: "DELETE" });
      await refresh();
    });
    await refresh(created.id);
  }

  async function saveTree(todos, preferredId) {
    const before = normalizedTreeItems(state.todos);
    await api("/api/todos/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: normalizedTreeItems(todos) }),
    });
    pushUndo("이동", async () => {
      await api("/api/todos/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: before }),
      });
      await refresh(preferredId);
    });
    await refresh(preferredId);
  }

  async function patchTodo(todoId, patch) {
    await api(`/api/todos/${encodeURIComponent(todoId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await refresh(todoId);
  }

  async function submitPrompt() {
    const prompt = state.prompt;
    if (!prompt) return;
    const value = prompt.value.trim();
    const before = state.todos.find((todo) => todo.id === prompt.todoId);
    state.prompt = null;
    if (prompt.kind === "child" && value) {
      await mutate(() => createTodoFromInput(value, prompt.todoId));
    } else if (prompt.kind === "edit" && value && before) {
      const previousTitle = before.title;
      await mutate(async () => {
        await patchTodo(prompt.todoId, { title: value });
        pushUndo(`편집: ${previousTitle}`, () => patchTodo(prompt.todoId, { title: previousTitle }));
      });
    } else if (prompt.kind === "due") {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        state.message = "마감일 형식: YYYY-MM-DD";
        state.prompt = prompt;
        render();
        return;
      }
      const previousDue = before?.dueDate || null;
      await mutate(async () => {
        await patchTodo(prompt.todoId, { dueDate: value || null });
        pushUndo("마감일 변경", () => patchTodo(prompt.todoId, { dueDate: previousDue }));
      });
    } else if (prompt.kind === "category") {
      const previousCategory = before?.category || "";
      await mutate(async () => {
        await patchTodo(prompt.todoId, { category: value });
        pushUndo("카테고리 변경", () => patchTodo(prompt.todoId, { category: previousCategory }));
      });
      if (state.category && value !== state.category) state.category = null;
    }
  }

  async function handleKey(key) {
    state.message = "";
    if (key === "\x03") {
      cleanup();
      return;
    }
    if (state.prompt) {
      if (key === "\x1b") {
        state.prompt = null;
      } else if (key === "\r" || key === "\n") {
        await submitPrompt();
      } else editTerminalInput(state.prompt, key);
      render();
      return;
    }

    if (key === "\t" || key === "\x1b[Z") {
      const tabs = [null, ...categoryList(state.todos)];
      const index = tabs.indexOf(state.category);
      state.category = tabs[(index + (key === "\t" ? 1 : tabs.length - 1)) % tabs.length];
      state.selected = 0;
      state.selectedId = null;
      syncSelection();
      render();
      return;
    }

    const currentRows = rows();
    const editingInput = state.mode === "insert" && state.input.value.length > 0;
    const up = key === "\x1b[A" || key === "\x1bOA" || (state.mode === "normal" && key === "k");
    const down = key === "\x1b[B" || key === "\x1bOB" || (state.mode === "normal" && key === "j");
    const left =
      (!editingInput && (key === "\x1b[D" || key === "\x1bOD")) || (state.mode === "normal" && key === "h");
    const right =
      (!editingInput && (key === "\x1b[C" || key === "\x1bOC")) || (state.mode === "normal" && key === "l");
    const shiftUp = key === "\x1b[1;2A";
    const shiftDown = key === "\x1b[1;2B";
    const shiftLeft = !editingInput && key === "\x1b[1;2D";
    const shiftRight = !editingInput && key === "\x1b[1;2C";

    if (up || down) {
      if (currentRows.length) {
        state.selected = Math.max(0, Math.min(currentRows.length - 1, state.selected + (down ? 1 : -1)));
        state.selectedId = currentRows[state.selected].todo.id;
      }
    } else if (left || right) {
      const row = selectedRow();
      if (row?.depth === 0 && row.children.length) {
        if (left) state.collapsed.add(row.todo.id);
        else state.collapsed.delete(row.todo.id);
        syncSelection(row.todo.id);
      }
    } else if (shiftUp || shiftDown) {
      const row = selectedRow();
      if (row) {
        const siblings = orderedSiblings(state.todos, row.todo.scope, row.todo.parentId || null);
        const visible =
          row.todo.parentId || !state.category
            ? siblings
            : siblings.filter((todo) => (todo.category || null) === state.category);
        const visibleIndex = visible.findIndex((todo) => todo.id === row.todo.id);
        const other = visible[visibleIndex + (shiftDown ? 1 : -1)];
        if (visibleIndex >= 0 && other) {
          const index = siblings.findIndex((todo) => todo.id === row.todo.id);
          const otherIndex = siblings.findIndex((todo) => todo.id === other.id);
          [siblings[index], siblings[otherIndex]] = [siblings[otherIndex], siblings[index]];
          const orderById = new Map(siblings.map((todo, siblingIndex) => [todo.id, siblingIndex]));
          const next = state.todos.map((todo) =>
            orderById.has(todo.id) ? { ...todo, sortOrder: orderById.get(todo.id) } : todo,
          );
          await mutate(() => saveTree(next, row.todo.id));
        }
      }
    } else if (shiftLeft) {
      const row = selectedRow();
      if (row?.depth === 0) {
        const roots = orderedSiblings(state.todos, row.todo.scope).filter(
          (todo) => !state.category || (todo.category || null) === state.category,
        );
        const index = roots.findIndex((todo) => todo.id === row.todo.id);
        const parent = roots[index - 1];
        if (parent) {
          const childCount = orderedSiblings(state.todos, row.todo.scope, parent.id).length;
          const next = state.todos.map((todo) =>
            todo.id === row.todo.id ? { ...todo, parentId: parent.id, sortOrder: childCount } : todo,
          );
          state.collapsed.delete(parent.id);
          await mutate(() => saveTree(next, row.todo.id));
        }
      }
    } else if (shiftRight) {
      const row = selectedRow();
      if (row?.depth === 1) {
        const parent = state.todos.find((todo) => todo.id === row.todo.parentId);
        if (parent) {
          const next = state.todos.map((todo) =>
            todo.id === row.todo.id ? { ...todo, parentId: null, sortOrder: todoOrderValue(parent) + 0.5 } : todo,
          );
          await mutate(() => saveTree(next, row.todo.id));
        }
      }
    } else if (state.mode === "insert") {
      if (key === "\x1b") {
        state.mode = "normal";
      } else if (key === "\r" || key === "\n") {
        const title = state.input.value.trim();
        if (title) {
          state.input = createEditor();
          await mutate(() => createTodoFromInput(title));
        }
      } else editTerminalInput(state.input, key);
    } else if (key === "i" || key === "a" || key === "\x1b") {
      state.mode = "insert";
    } else if (key === "q") {
      cleanup();
      return;
    } else {
      const row = selectedRow();
      if (row && key === "s") {
        const parent = row.depth === 0 ? row.todo : state.todos.find((todo) => todo.id === row.todo.parentId);
        state.prompt = { kind: "child", label: "하위 목표", ...createEditor(), todoId: parent.id };
      } else if (row && key === "e") {
        state.prompt = { kind: "edit", label: "내용 편집", ...createEditor(row.todo.title), todoId: row.todo.id };
      } else if (row && key === "t") {
        state.prompt = {
          kind: "due",
          label: "마감일 YYYY-MM-DD (비우면 해제)",
          ...createEditor(row.todo.dueDate || ""),
          todoId: row.todo.id,
        };
      } else if (row && key === "c") {
        const target = row.depth === 0 ? row.todo : state.todos.find((todo) => todo.id === row.todo.parentId);
        state.prompt = {
          kind: "category",
          label: "카테고리 (비우면 해제)",
          ...createEditor(target.category || ""),
          todoId: target.id,
        };
      } else if (row && key === " ") {
        const wasDone = row.todo.done;
        const previousCompletedAt = row.todo.completedAt || null;
        await mutate(async () => {
          await patchTodo(row.todo.id, { done: !wasDone, completedAt: !wasDone ? new Date().toISOString() : null });
          pushUndo(`완료 토글: ${row.todo.title}`, () =>
            patchTodo(row.todo.id, { done: wasDone, completedAt: wasDone ? previousCompletedAt || new Date().toISOString() : null }),
          );
        });
      } else if (row && key === "d") {
        const removed = [row.todo, ...state.todos.filter((todo) => todo.parentId === row.todo.id)];
        await mutate(async () => {
          await api(`/api/todos/${encodeURIComponent(row.todo.id)}`, { method: "DELETE" });
          pushUndo(`삭제: ${row.todo.title}`, async () => {
            for (const todo of removed) {
              await api("/api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(todo),
              });
            }
            await refresh(removed[0].id);
          });
          await refresh();
        });
      } else if (key === "u") {
        const entry = state.undoStack.pop();
        if (!entry) {
          state.message = "되돌릴 작업 없음";
        } else {
          await mutate(entry.run);
          state.message = `되돌림: ${entry.label}`;
        }
      }
    }
    render();
  }

  await refresh();
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
  render();
  let keyQueue = Promise.resolve();
  process.stdin.on("data", (input) => {
    for (const key of splitTerminalKeys(input)) {
      keyQueue = keyQueue.then(() => handleKey(key)).catch((error) => {
        state.message = error.message || String(error);
        state.busy = false;
        render();
      });
    }
  });
  process.stdout.on("resize", render);
  await finished;
}

function help() {
  console.log(`${bold("todo")} — Todo 터미널 클라이언트

  todo                     Vim 스타일 대화형 TUI (비대화형 터미널에서는 목록)
  todo list [--json]       할 일 목록 (번호 포함, --json은 스크립트/AI용 JSON 출력)
  todo add "제목" [옵션]    할 일 추가  (-w 이번주, -m 이번달, -d 2026-07-20 마감일, -c 카테고리)
  todo done <번호>          완료 토글 (toggle 도 같음)
  todo rm <번호>            삭제 (하위 포함)
  todo undo                마지막 add/done/rm 되돌리기
  todo memo "내용 #태그"    메모 기록 (- [ ] 줄은 할 일로 자동 추출)
  todo memos [개수]         최근 메모 (기본 10개)
  todo log [--week]        오늘 타임테이블 / 이번 주 작업별 합계
  todo track "작업명"       시간 기록 시작
  todo stop                시간 기록 종료 (서버에 저장)
  todo status              로그인/기록 상태
  todo login / logout      Google 로그인 / 로그아웃`);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case undefined:
    await runTui();
    break;
  case "list":
    await listTodos(args);
    break;
  case "add":
    await addTodo(args);
    break;
  case "done":
  case "toggle":
    await toggleTodo(Number(args[0]) || fail(`사용법: todo ${command} <번호>`));
    break;
  case "rm":
    await removeTodo(Number(args[0]) || fail("사용법: todo rm <번호>"));
    break;
  case "undo":
    await undoLast();
    break;
  case "memo":
    await addMemo(args.join(" "));
    break;
  case "memos":
    await listMemos(Number(args[0]) || 10);
    break;
  case "log":
    await showLog(args);
    break;
  case "track":
    await trackStart(args.join(" ") || fail('사용법: todo track "작업명"'));
    break;
  case "stop":
    await trackStop();
    break;
  case "status":
    status();
    break;
  case "login":
    await login();
    break;
  case "logout":
    rmSync(SESSION_FILE, { force: true });
    rmSync(LEGACY_SESSION_FILE, { force: true });
    console.log("로그아웃 완료.");
    break;
  case "help":
  case "-h":
  case "--help":
    help();
    break;
  default:
    help();
    process.exit(1);
}
