const STORAGE_KEY = "free-adhd-memo:v1";
const API_BASE_KEY = "free-adhd-memo:api-base";
const AUTH_TOKEN_KEY = "free-adhd-memo:auth-token";
const scopeLabels = {
  day: "오늘",
  week: "이번 주",
  month: "이번 달",
};
const modeMinutes = {
  focus: 25,
  short: 5,
  long: 15,
};

let timerMode = "focus";
let secondsLeft = modeMinutes.focus * 60;
let timerId = null;
let activeTag = null;
let query = "";
let serverBacked = false;
let syncTimer = null;
let authenticated = false;

const urlParams = new URLSearchParams(window.location.search);
const requestedApiBase = urlParams.get("api");
if (requestedApiBase) {
  localStorage.setItem(API_BASE_KEY, requestedApiBase);
  urlParams.delete("api");
  const nextQuery = urlParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
}

const API_BASE_URL = (localStorage.getItem(API_BASE_KEY) || window.FREE_ADHD_API_BASE_URL || "").replace(/\/$/, "");
const SUPABASE_URL = window.FREE_ADHD_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.FREE_ADHD_SUPABASE_ANON_KEY || "";
const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
    .slice(8, 10)
    .join("")}-${hex.slice(10, 16).join("")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function starterData() {
  const createdAt = nowIso();
  return {
    todos: [
      {
        id: uid(),
        title: "오늘 제일 먼저 끝낼 작은 일 하나 고르기",
        scope: "day",
        done: false,
        createdAt,
      },
      {
        id: uid(),
        title: "이번 주에 미뤄진 일 1개만 정리하기",
        scope: "week",
        done: false,
        createdAt,
      },
    ],
    memos: [
      {
        id: uid(),
        body: "앱 시작. #free-adhd",
        createdAt,
        tags: ["free-adhd"],
      },
    ],
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return starterData();

  try {
    const parsed = JSON.parse(raw);
    return {
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      memos: Array.isArray(parsed.memos) ? parsed.memos : [],
    };
  } catch {
    return starterData();
  }
}

let data = loadData();

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setSyncStatus(label, state = "neutral") {
  const element = byId("syncStatus");
  element.textContent = label;
  element.dataset.state = state;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 401) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    showLogin();
  }
  return response;
}

function showLogin(message = "") {
  authenticated = false;
  byId("loginScreen").hidden = false;
  byId("loginError").textContent = message;
}

function hideLogin() {
  authenticated = true;
  byId("loginScreen").hidden = true;
  byId("loginError").textContent = "";
}

async function checkSession() {
  try {
    if (supabaseClient) {
      const { data: authData } = await supabaseClient.auth.getSession();
      if (authData.session?.access_token) {
        localStorage.setItem(AUTH_TOKEN_KEY, authData.session.access_token);
      }
    }
    const response = await apiFetch("/api/session");
    const session = await response.json();
    if (session.authenticated) {
      hideLogin();
      loadServerData();
      return;
    }
    showLogin();
  } catch {
    hideLogin();
    setSyncStatus("local only", "warn");
  }
}

async function loadServerData() {
  if (!authenticated) return;
  try {
    const response = await apiFetch("/api/data");
    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
    const serverData = await response.json();
    if (!Array.isArray(serverData.todos) || !Array.isArray(serverData.memos)) return;

    data = {
      todos: serverData.todos,
      memos: serverData.memos,
    };
    serverBacked = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSyncStatus("synced", "ok");
    render();
  } catch {
    serverBacked = false;
    setSyncStatus("local only", "warn");
  }
}

function queueServerSave() {
  if (!serverBacked || !authenticated) return;
  setSyncStatus("syncing", "neutral");
  clearTimeout(syncTimer);
  syncTimer = setTimeout(saveServerData, 250);
}

async function saveServerData() {
  try {
    const response = await apiFetch("/api/data", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    setSyncStatus("synced", "ok");
  } catch {
    setSyncStatus("offline", "warn");
  }
}

async function sendMutation(path, options = {}) {
  if (!serverBacked || !authenticated) return;
  setSyncStatus("syncing", "neutral");
  try {
    const response = await apiFetch(path, options);
    if (!response.ok) throw new Error(`Mutation failed: ${response.status}`);
    setSyncStatus("synced", "ok");
  } catch {
    setSyncStatus("offline", "warn");
  }
}

function byId(id) {
  return document.getElementById(id);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function minutesToLabel(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function renderLabels() {
  byId("todayLabel").textContent = formatDate(nowIso());
  byId("nowLabel").textContent = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTodos() {
  const columns = byId("todoColumns");
  columns.innerHTML = Object.keys(scopeLabels)
    .map((scope) => {
      const items = data.todos
        .filter((todo) => todo.scope === scope)
        .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt));

      const rows = items.length
        ? items
            .map(
              (todo) => `
                <div class="todo-row ${todo.done ? "done" : ""}">
                  <button type="button" data-action="toggle-todo" data-id="${todo.id}" title="완료 전환">
                    ${todo.done ? "✓" : "○"}
                  </button>
                  <span>${escapeHtml(todo.title)}</span>
                  <button type="button" data-action="delete-todo" data-id="${todo.id}" title="삭제">×</button>
                </div>
              `,
            )
            .join("")
        : `<p class="empty">없음</p>`;

      return `
        <div class="todo-column">
          <h3>${scopeLabels[scope]}</h3>
          ${rows}
        </div>
      `;
    })
    .join("");

  const focusList = byId("focusList");
  const queue = data.todos.filter((todo) => !todo.done).slice(0, 4);
  focusList.innerHTML = queue.length
    ? queue
        .map(
          (todo) => `
            <button class="focus-item" type="button" data-action="toggle-todo" data-id="${todo.id}">
              <span aria-hidden="true">○</span>
              <span>${escapeHtml(todo.title)}</span>
            </button>
          `,
        )
        .join("")
    : `<p class="empty">비어 있습니다. 쉬어도 됩니다.</p>`;
}

function renderTags() {
  const tags = Array.from(new Set(data.memos.flatMap((memo) => memo.tags))).sort((a, b) => a.localeCompare(b));
  byId("tagStrip").innerHTML = [
    `<button class="${activeTag ? "" : "active"}" type="button" data-action="tag-all">전체</button>`,
    ...tags.map(
      (tag) => `
        <button class="${activeTag === tag ? "active" : ""}" type="button" data-action="tag" data-tag="${escapeHtml(tag)}">
          <span aria-hidden="true">#</span>${escapeHtml(tag)}
        </button>
      `,
    ),
  ].join("");
}

function renderMemos() {
  const normalized = query.trim().toLowerCase();
  const memos = data.memos
    .filter((memo) => {
      const matchesQuery = normalized ? memo.body.toLowerCase().includes(normalized) : true;
      const matchesTag = activeTag ? memo.tags.includes(activeTag) : true;
      return matchesQuery && matchesTag;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  byId("memoList").innerHTML = memos.length
    ? memos
        .map(
          (memo) => `
            <article class="memo-card">
              <time>${formatTime(memo.createdAt)}</time>
              <p>${escapeHtml(memo.body)}</p>
              <button type="button" data-action="delete-memo" data-id="${memo.id}" title="메모 삭제">×</button>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">검색 결과가 없습니다.</p>`;
}

function renderInsights() {
  const today = new Date().toDateString();
  const todayMemoCount = data.memos.filter((memo) => new Date(memo.createdAt).toDateString() === today).length;
  const doneCount = data.todos.filter((todo) => todo.done).length;
  const tagCount = new Set(data.memos.flatMap((memo) => memo.tags)).size;

  byId("stats").innerHTML = `
    <div><strong>${todayMemoCount}</strong><span>오늘 메모</span></div>
    <div><strong>${doneCount}</strong><span>완료</span></div>
    <div><strong>${tagCount}</strong><span>태그</span></div>
  `;

  byId("activityGrid").innerHTML = Array.from({ length: 28 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (27 - index));
    const dayKey = date.toDateString();
    const count = data.memos.filter((memo) => new Date(memo.createdAt).toDateString() === dayKey).length;
    return `<span class="activity-cell level-${Math.min(count, 4)}" title="${date.getMonth() + 1}/${date.getDate()}: ${count}개"></span>`;
  }).join("");
}

function renderTimer() {
  byId("timerLabel").textContent = minutesToLabel(secondsLeft);
  byId("timerToggle").innerHTML = `${timerId ? '<span aria-hidden="true">Ⅱ</span>정지' : '<span aria-hidden="true">▶</span>시작'}`;

  document.querySelectorAll("#timerModes button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === timerMode);
  });
}

function render() {
  renderLabels();
  renderTodos();
  renderTags();
  renderMemos();
  renderInsights();
  renderTimer();
}

function toggleTodo(id) {
  const currentTodo = data.todos.find((todo) => todo.id === id);
  if (!currentTodo) return;
  const nextDone = !currentTodo.done;
  const completedAt = nextDone ? nowIso() : undefined;
  data.todos = data.todos.map((todo) =>
    todo.id === id
      ? {
          ...todo,
          done: nextDone,
          completedAt,
        }
      : todo,
  );
  saveData();
  render();
  sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      done: nextDone,
      completedAt,
    }),
  });
}

function deleteTodo(id) {
  data.todos = data.todos.filter((todo) => todo.id !== id);
  saveData();
  render();
  sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function deleteMemo(id) {
  data.memos = data.memos.filter((memo) => memo.id !== id);
  saveData();
  render();
  sendMutation(`/api/memos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function setTimerMode(mode) {
  timerMode = mode;
  secondsLeft = modeMinutes[mode] * 60;
  stopTimer();
  renderTimer();
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function toggleTimer() {
  if (timerId) {
    stopTimer();
    renderTimer();
    return;
  }

  timerId = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      secondsLeft = 0;
      stopTimer();
    }
    renderTimer();
  }, 1000);
  renderTimer();
}

function exportMarkdown() {
  const lines = data.memos
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((memo) => `## ${new Date(memo.createdAt).toLocaleString("ko-KR")}\n\n${memo.body}`);
  const blob = new Blob([lines.join("\n\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `free-adhd-memo-${nowIso().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

byId("memoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const textarea = byId("memoDraft");
  const body = textarea.value.trim();
  if (!body) return;

  const createdAt = nowIso();
  const memoId = uid();
  const extractedTodos = extractTodos(body).map((title) => ({
    id: uid(),
    title,
    scope: "day",
    done: false,
    createdAt,
    sourceMemoId: memoId,
  }));

  const memo = {
    id: memoId,
    body,
    createdAt,
    tags: extractTags(body),
  };
  data.memos.unshift(memo);
  data.todos.unshift(...extractedTodos);
  textarea.value = "";
  textarea.focus();
  saveData();
  render();
  sendMutation("/api/memos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      memo,
      todos: extractedTodos,
    }),
  });
});

byId("todoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("todoDraft");
  const title = input.value.trim();
  if (!title) return;

  const todo = {
    id: uid(),
    title,
    scope: byId("todoScope").value,
    done: false,
    createdAt: nowIso(),
  };
  data.todos.unshift(todo);
  input.value = "";
  saveData();
  render();
  sendMutation("/api/todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(todo),
  });
});

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "toggle-todo") toggleTodo(target.dataset.id);
  if (action === "delete-todo") deleteTodo(target.dataset.id);
  if (action === "delete-memo") deleteMemo(target.dataset.id);
  if (action === "tag-all") {
    activeTag = null;
    render();
  }
  if (action === "tag") {
    activeTag = target.dataset.tag;
    render();
  }
});

byId("queryInput").addEventListener("input", (event) => {
  query = event.target.value;
  renderMemos();
});

byId("timerModes").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (button) setTimerMode(button.dataset.mode);
});

byId("timerToggle").addEventListener("click", toggleTimer);
byId("timerReset").addEventListener("click", () => setTimerMode(timerMode));
byId("exportButton").addEventListener("click", exportMarkdown);
byId("resetButton").addEventListener("click", () => {
  data = starterData();
  activeTag = null;
  query = "";
  byId("queryInput").value = "";
  saveData();
  queueServerSave();
  render();
});
byId("googleLoginButton").addEventListener("click", async () => {
  if (!supabaseClient) {
    showLogin("Google 로그인 설정이 없습니다.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) showLogin("Google 로그인 요청에 실패했습니다.");
});
byId("logoutButton").addEventListener("click", async () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (supabaseClient) await supabaseClient.auth.signOut();
  serverBacked = false;
  setSyncStatus("signed out", "warn");
  showLogin();
});

render();
checkSession();
setInterval(renderLabels, 30000);
setInterval(loadServerData, 20000);
