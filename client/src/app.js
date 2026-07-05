const STORAGE_KEY = "free-adhd-memo:v1";
const API_BASE_KEY = "free-adhd-memo:api-base";
const AUTH_TOKEN_KEY = "free-adhd-memo:auth-token";
const TIMER_KEY = "free-adhd-memo:timer-minutes";
const DASHBOARD_WIDTH_KEY = "free-adhd-memo:dashboard-width";
const SIDE_ORDER_KEY = "free-adhd-memo:side-order";
const scopeLabels = {
  day: "오늘",
  week: "이번 주",
  month: "이번 달",
};
const defaultModeMinutes = {
  focus: 25,
  short: 5,
  long: 15,
};

function loadTimerMinutes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TIMER_KEY) || "{}");
    return {
      focus: Number(parsed.focus) > 0 ? Number(parsed.focus) : defaultModeMinutes.focus,
      short: Number(parsed.short) > 0 ? Number(parsed.short) : defaultModeMinutes.short,
      long: Number(parsed.long) > 0 ? Number(parsed.long) : defaultModeMinutes.long,
    };
  } catch {
    return { ...defaultModeMinutes };
  }
}

function saveTimerMinutes() {
  localStorage.setItem(TIMER_KEY, JSON.stringify(modeMinutes));
}

const modeMinutes = loadTimerMinutes();

let timerMode = "focus";
let secondsLeft = modeMinutes.focus * 60;
let timerId = null;
let activeTag = null;
let query = "";
let starOnly = false;
let serverBacked = false;
let syncTimer = null;
let authenticated = false;
let calendarViewMode = false;
let calendarMonth = new Date();
let selectedCalendarDate = null;

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
      byId("accountLabel").textContent = authData.session?.user?.email || "";
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

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function renderCalendar() {
  if (!calendarViewMode) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  byId("calendarMonthLabel").textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  const countByDate = data.todos.reduce((acc, todo) => {
    if (!todo.dueDate) return acc;
    acc[todo.dueDate] = (acc[todo.dueDate] || 0) + 1;
    return acc;
  }, {});

  const leadingBlanks = Array.from({ length: firstDay.getDay() }, () => `<div class="calendar-day empty"></div>`);
  const dayCells = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = dateKey(new Date(year, month, day));
    const count = countByDate[key] || 0;
    const classes = ["calendar-day"];
    if (key === todayKey) classes.push("today");
    if (key === selectedCalendarDate) classes.push("selected");
    return `
      <button type="button" class="${classes.join(" ")}" data-action="select-calendar-day" data-date="${key}">
        <span>${day}</span>
        ${count ? `<span class="calendar-day-count">${count}</span>` : ""}
      </button>
    `;
  });

  byId("calendarGrid").innerHTML = [...leadingBlanks, ...dayCells].join("");
  renderCalendarDayDetail();
}

function renderCalendarDayDetail() {
  const detail = byId("calendarDayDetail");
  if (!selectedCalendarDate) {
    detail.innerHTML = `<p class="empty">날짜를 선택하면 그날 마감인 할 일을 보고 추가할 수 있습니다.</p>`;
    return;
  }

  const items = data.todos
    .filter((todo) => todo.dueDate === selectedCalendarDate)
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
    : `<p class="empty">이 날짜에 마감인 할 일이 없습니다.</p>`;

  detail.innerHTML = `
    <h4>${formatDate(`${selectedCalendarDate}T00:00:00`)}</h4>
    <form class="calendar-quick-add" id="calendarQuickAdd">
      <input id="calendarQuickAddInput" placeholder="이 날짜에 할 일 추가" />
      <button type="submit" title="추가"><span aria-hidden="true">+</span></button>
    </form>
    ${rows}
  `;

  byId("calendarQuickAdd").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = byId("calendarQuickAddInput");
    const title = input.value.trim();
    if (!title) return;
    addTodo({ title, scope: "day", dueDate: selectedCalendarDate });
    input.value = "";
  });
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
      const matchesStar = starOnly ? memo.starred : true;
      return matchesQuery && matchesTag && matchesStar;
    })
    .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || b.createdAt.localeCompare(a.createdAt));

  byId("memoList").innerHTML = memos.length
    ? memos
        .map(
          (memo) => `
            <article class="memo-card ${memo.starred ? "starred" : ""}">
              <time>${formatTime(memo.createdAt)}</time>
              <p>${escapeHtml(memo.body)}</p>
              <button type="button" class="star-button ${memo.starred ? "active" : ""}" data-action="toggle-star" data-id="${memo.id}" title="${memo.starred ? "즐겨찾기 해제" : "즐겨찾기"}">${memo.starred ? "★" : "☆"}</button>
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
    const memoCount = data.memos.filter((memo) => new Date(memo.createdAt).toDateString() === dayKey).length;
    const doneOnDay = data.todos.filter(
      (todo) => todo.completedAt && new Date(todo.completedAt).toDateString() === dayKey,
    ).length;
    const label = `${date.getMonth() + 1}/${date.getDate()} (${formatWeekdayShort(date)})`;
    return `
      <button
        type="button"
        class="activity-cell level-${Math.min(memoCount, 4)}"
        data-action="activity-day"
        data-label="${escapeHtml(label)}"
        data-memo-count="${memoCount}"
        data-done-count="${doneOnDay}"
      >
        <span class="activity-tooltip">${escapeHtml(label)}<br />메모 ${memoCount}개 · 완료 ${doneOnDay}개</span>
      </button>
    `;
  }).join("");
}

function formatWeekdayShort(date) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date);
}

function showActivityCard(label, memoCount, doneCount) {
  byId("activityCardContent").innerHTML = `
    <h4>${escapeHtml(label)}</h4>
    <div class="stat-grid">
      <div><strong>${memoCount}</strong><span>메모</span></div>
      <div><strong>${doneCount}</strong><span>완료한 할 일</span></div>
    </div>
  `;
  byId("activityCard").hidden = false;
  byId("activityCardBackdrop").hidden = false;
}

function hideActivityCard() {
  byId("activityCard").hidden = true;
  byId("activityCardBackdrop").hidden = true;
}

function renderTimer() {
  byId("timerLabel").textContent = minutesToLabel(secondsLeft);
  byId("timerToggle").innerHTML = `${timerId ? '<span aria-hidden="true">Ⅱ</span>정지' : '<span aria-hidden="true">▶</span>시작'}`;

  document.querySelectorAll("#timerModes button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === timerMode);
  });

  const minutesInput = byId("timerMinutesInput");
  if (document.activeElement !== minutesInput) {
    minutesInput.value = modeMinutes[timerMode];
  }
}

function render() {
  renderLabels();
  renderTodos();
  renderCalendar();
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

function toggleMemoStar(id) {
  const currentMemo = data.memos.find((memo) => memo.id === id);
  if (!currentMemo) return;
  const starred = !currentMemo.starred;
  data.memos = data.memos.map((memo) => (memo.id === id ? { ...memo, starred } : memo));
  saveData();
  render();
  sendMutation(`/api/memos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ starred }),
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
    starred: false,
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

function addTodo({ title, scope, dueDate = null }) {
  const todo = {
    id: uid(),
    title,
    scope,
    done: false,
    createdAt: nowIso(),
    dueDate,
  };
  data.todos.unshift(todo);
  saveData();
  render();
  sendMutation("/api/todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(todo),
  });
}

byId("todoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("todoDraft");
  const dueDateInput = byId("todoDueDate");
  const title = input.value.trim();
  if (!title) return;

  addTodo({
    title,
    scope: byId("todoScope").value,
    dueDate: dueDateInput.value || null,
  });
  input.value = "";
  dueDateInput.value = "";
});

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "toggle-todo") toggleTodo(target.dataset.id);
  if (action === "delete-todo") deleteTodo(target.dataset.id);
  if (action === "delete-memo") deleteMemo(target.dataset.id);
  if (action === "toggle-star") toggleMemoStar(target.dataset.id);
  if (action === "tag-all") {
    activeTag = null;
    render();
  }
  if (action === "tag") {
    activeTag = target.dataset.tag;
    render();
  }
  if (action === "select-calendar-day") {
    selectedCalendarDate = target.dataset.date;
    renderCalendar();
  }
  if (action === "activity-day" && window.matchMedia("(hover: none)").matches) {
    showActivityCard(target.dataset.label, target.dataset.memoCount, target.dataset.doneCount);
  }
});

byId("queryInput").addEventListener("input", (event) => {
  query = event.target.value;
  renderMemos();
});

byId("starFilterToggle").addEventListener("click", () => {
  starOnly = !starOnly;
  byId("starFilterToggle").classList.toggle("active", starOnly);
  renderMemos();
});

byId("todoViewToggle").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  calendarViewMode = button.dataset.view === "calendar";

  document.querySelectorAll("#todoViewToggle button").forEach((viewButton) => {
    viewButton.classList.toggle("active", viewButton.dataset.view === button.dataset.view);
  });
  byId("todoForm").hidden = calendarViewMode;
  byId("todoColumns").hidden = calendarViewMode;
  byId("calendarView").hidden = !calendarViewMode;

  if (calendarViewMode) renderCalendar();
});

byId("calendarPrevMonth").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

byId("calendarNextMonth").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

byId("timerModes").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (button) setTimerMode(button.dataset.mode);
});

byId("timerMinutesInput").addEventListener("change", (event) => {
  const value = Math.max(1, Math.min(180, Math.round(Number(event.target.value)) || defaultModeMinutes[timerMode]));
  modeMinutes[timerMode] = value;
  saveTimerMinutes();
  if (!timerId) secondsLeft = value * 60;
  renderTimer();
});

byId("timerToggle").addEventListener("click", toggleTimer);
byId("timerReset").addEventListener("click", () => setTimerMode(timerMode));
byId("exportButton").addEventListener("click", exportMarkdown);

function openMemoDrawer() {
  byId("memoDrawer").classList.add("open");
  byId("memoDrawerBackdrop").hidden = false;
}

function closeMemoDrawer() {
  byId("memoDrawer").classList.remove("open");
  byId("memoDrawerBackdrop").hidden = true;
}

byId("memoDrawerToggle").addEventListener("click", openMemoDrawer);
byId("memoDrawerClose").addEventListener("click", closeMemoDrawer);
byId("memoDrawerBackdrop").addEventListener("click", closeMemoDrawer);
byId("activityCardClose").addEventListener("click", hideActivityCard);
byId("activityCardBackdrop").addEventListener("click", hideActivityCard);
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
  byId("accountLabel").textContent = "";
  showLogin();
});

function applySideColumnOrder() {
  const sideColumn = byId("sideColumn");
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SIDE_ORDER_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!Array.isArray(saved)) return;

  const byBlockId = new Map(Array.from(sideColumn.children).map((el) => [el.dataset.blockId, el]));
  saved.forEach((id) => {
    const el = byBlockId.get(id);
    if (el) sideColumn.appendChild(el);
  });
}

function setupSideColumnReorder() {
  const sideColumn = byId("sideColumn");
  let draggedEl = null;

  sideColumn.addEventListener("dragstart", (event) => {
    const block = event.target.closest("[data-block-id]");
    if (!block) return;
    draggedEl = block;
    event.dataTransfer.effectAllowed = "move";
    block.classList.add("dragging");
  });

  sideColumn.addEventListener("dragend", () => {
    if (draggedEl) draggedEl.classList.remove("dragging");
    draggedEl = null;
  });

  sideColumn.addEventListener("dragover", (event) => {
    if (!draggedEl) return;
    event.preventDefault();
    const target = event.target.closest("[data-block-id]");
    if (!target || target === draggedEl) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    sideColumn.insertBefore(draggedEl, before ? target : target.nextSibling);
  });

  sideColumn.addEventListener("drop", (event) => {
    event.preventDefault();
    const order = Array.from(sideColumn.children).map((el) => el.dataset.blockId);
    localStorage.setItem(SIDE_ORDER_KEY, JSON.stringify(order));
  });
}

function setupDashboardResize() {
  const handle = byId("dashboardResizeHandle");
  const todoPanel = document.querySelector(".todo-panel");
  const sideColumn = byId("sideColumn");
  const wideEnough = () => window.matchMedia("(min-width: 1081px)").matches;

  const savedWidth = Number(localStorage.getItem(DASHBOARD_WIDTH_KEY));
  if (savedWidth > 0 && wideEnough()) {
    todoPanel.style.flex = `0 0 ${savedWidth}px`;
    sideColumn.style.flex = "1 1 0%";
  }

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerMove(event) {
    if (!dragging) return;
    const delta = event.clientX - startX;
    const containerWidth = handle.parentElement.clientWidth;
    const minWidth = 360;
    const maxWidth = containerWidth - 296;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
    todoPanel.style.flex = `0 0 ${nextWidth}px`;
    sideColumn.style.flex = "1 1 0%";
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("active");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    localStorage.setItem(DASHBOARD_WIDTH_KEY, String(Math.round(todoPanel.getBoundingClientRect().width)));
  }

  handle.addEventListener("pointerdown", (event) => {
    if (!wideEnough()) return;
    dragging = true;
    startX = event.clientX;
    startWidth = todoPanel.getBoundingClientRect().width;
    handle.classList.add("active");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    event.preventDefault();
  });
}

applySideColumnOrder();
setupSideColumnReorder();
setupDashboardResize();

render();
checkSession();
setInterval(renderLabels, 30000);
setInterval(loadServerData, 20000);
