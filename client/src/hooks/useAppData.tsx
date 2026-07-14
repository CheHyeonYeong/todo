/* 앱 전역 상태: 데이터, 인증, 서버 동기화, 타임 트래커. 기존 vanilla app.js의 로직을 그대로 이식. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, refreshAuthToken, setAuthToken, supabase } from "@/lib/api";
import { extractTags, extractTodos, nowIso, todayKey, uid } from "@/lib/helpers";
import type {
  ActiveSession,
  AppData,
  Memo,
  MemoPatch,
  Routine,
  RoutinePatch,
  Scope,
  Session,
  Todo,
  TodoPatch,
} from "@/lib/types";

const STORAGE_KEY = "free-adhd-memo:v1";
const ACTIVE_SESSION_KEY = "free-adhd-memo:active-session";

export type AuthState = "checking" | "login" | "ready";
export interface SyncStatus {
  label: string;
  tone: "neutral" | "ok" | "warn";
}

/* PUT /api/todos/order 가 받는 항목. 보낸 할 일만 갱신되고 나머지는 그대로 둔다. */
export interface TodoOrderItem {
  id: string;
  parentId: string | null;
  scope: Scope;
  sortOrder: number;
}

function starterData(): AppData {
  return { todos: [], memos: [], sessions: [], routines: [] };
}

function loadLocalData(): AppData {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed) return starterData();
    return {
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      memos: Array.isArray(parsed.memos) ? parsed.memos : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      routines: Array.isArray(parsed.routines) ? parsed.routines : [],
    };
  } catch {
    return starterData();
  }
}

function loadActiveSession(): ActiveSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
    if (!parsed?.startedAt || Number.isNaN(new Date(parsed.startedAt).getTime())) return null;
    return { id: String(parsed.id || ""), label: String(parsed.label || ""), startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

interface AppDataValue {
  data: AppData;
  auth: AuthState;
  email: string;
  loginError: string;
  sync: SyncStatus;
  activeSession: ActiveSession | null;
  pauseSyncRef: React.MutableRefObject<boolean>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  addTodo: (input: { title: string; scope: Scope; dueDate?: string | null; category?: string | null }) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodo: (id: string, patch: TodoPatch) => void;
  reorderTodos: (items: TodoOrderItem[]) => Promise<boolean>;
  addRoutine: (input: { title: string; weekdays: number[]; category?: string | null }) => Promise<void>;
  updateRoutine: (id: string, patch: RoutinePatch) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
  addMemo: (input: { title?: string; body: string }) => void;
  updateMemo: (id: string, patch: MemoPatch) => void;
  deleteMemo: (id: string) => void;
  reorderMemos: (ids: string[]) => Promise<boolean>;
  recordSession: (session: Session) => void;
  deleteSession: (id: string) => void;
  startSession: (label: string) => void;
  stopSession: () => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadLocalData);
  const [auth, setAuth] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sync, setSync] = useState<SyncStatus>({ label: "local", tone: "neutral" });
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(loadActiveSession);
  const serverBacked = useRef(false);
  const authRef = useRef<AuthState>("checking");
  const pauseSyncRef = useRef(false);
  const dataRef = useRef(data);
  const activeSessionRef = useRef(activeSession);
  authRef.current = auth;
  dataRef.current = data;
  activeSessionRef.current = activeSession;

  const persist = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => {
      const next = updater(prev);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sendMutation = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!serverBacked.current || authRef.current !== "ready") return;
    setSync({ label: "syncing", tone: "neutral" });
    try {
      const response = await apiFetch(path, options);
      if (!response.ok) throw new Error(`Mutation failed: ${response.status}`);
      setSync({ label: "synced", tone: "ok" });
    } catch {
      setSync({ label: "offline", tone: "warn" });
    }
  }, []);

  const loadServerData = useCallback(async () => {
    if (authRef.current !== "ready" || pauseSyncRef.current) return;
    try {
      let response = await apiFetch("/api/data");
      // 토큰이 만료됐을 뿐일 수 있으니 갱신해서 한 번 더 시도하고, 그래도 안 되면 로그아웃.
      if (response.status === 401 && (await refreshAuthToken())) {
        response = await apiFetch("/api/data");
      }
      if (response.status === 401) {
        setAuthToken(null);
        setAuth("login");
        return;
      }
      if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
      const serverData = await response.json();
      if (!Array.isArray(serverData.todos) || !Array.isArray(serverData.memos)) return;
      persist((prev) => ({
        todos: serverData.todos,
        memos: serverData.memos,
        sessions: Array.isArray(serverData.sessions) ? serverData.sessions : prev.sessions,
        routines: Array.isArray(serverData.routines) ? serverData.routines : prev.routines,
      }));
      serverBacked.current = true;
      setSync({ label: "synced", tone: "ok" });
    } catch {
      serverBacked.current = false;
      setSync({ label: "local only", tone: "warn" });
    }
  }, [persist]);

  const checkSession = useCallback(async () => {
    try {
      if (supabase) {
        const { data: authData } = await supabase.auth.getSession();
        if (authData.session?.access_token) setAuthToken(authData.session.access_token);
        setEmail(authData.session?.user?.email || "");
      }
      const response = await apiFetch("/api/session");
      const session = await response.json();
      if (session.authenticated) {
        setAuth("ready");
        authRef.current = "ready";
        loadServerData();
        return;
      }
      setAuth("login");
    } catch {
      setAuth("ready");
      authRef.current = "ready";
      setSync({ label: "local only", tone: "warn" });
    }
  }, [loadServerData]);

  useEffect(() => {
    checkSession();
    const id = setInterval(loadServerData, 20000);
    // Supabase가 토큰을 갱신하거나 다른 탭에서 로그인/로그아웃하면 저장된 토큰도 맞춰준다.
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
      setEmail(session?.user?.email || "");
    });
    /* 모바일에서 앱을 백그라운드로 두면 자동 갱신 타이머가 멈춘다. 다시 보일 때 갱신하고 동기화한다. */
    const onVisible = () => {
      if (document.visibilityState !== "visible" || authRef.current !== "ready") return;
      refreshAuthToken().finally(loadServerData);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      listener?.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async () => {
    if (!supabase) {
      setLoginError("Google 로그인 설정이 없습니다.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setLoginError("Google 로그인 요청에 실패했습니다.");
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    if (supabase) await supabase.auth.signOut();
    serverBacked.current = false;
    setSync({ label: "signed out", tone: "warn" });
    setEmail("");
    setAuth("login");
  }, []);

  const addTodo = useCallback(
    ({
      title,
      scope,
      dueDate = null,
      category = null,
    }: {
      title: string;
      scope: Scope;
      dueDate?: string | null;
      category?: string | null;
    }) => {
      const siblings = dataRef.current.todos.filter((item) => item.scope === scope && !item.parentId);
      const sortOrder = Math.max(-1, ...siblings.map((item) => Number(item.sortOrder) || 0)) + 1;
      const todo: Todo = { id: uid(), title, scope, done: false, createdAt: nowIso(), dueDate, category, sortOrder };
      persist((prev) => ({ ...prev, todos: [...prev.todos, todo] }));
      sendMutation("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todo),
      });
    },
    [persist, sendMutation],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      const current = dataRef.current.todos.find((todo) => todo.id === id);
      if (!current) return;
      const done = !current.done;
      const completedAt = done ? nowIso() : undefined;
      persist((prev) => {
        const selected = prev.todos.find((todo) => todo.id === id);
        let todos = prev.todos.map((todo) =>
          todo.id === id || (!selected?.parentId && todo.parentId === id) ? { ...todo, done, completedAt } : todo,
        );
        if (selected?.parentId) {
          const siblings = todos.filter((todo) => todo.parentId === selected.parentId);
          const parentDone = siblings.length > 0 && siblings.every((todo) => todo.done);
          todos = todos.map((todo) =>
            todo.id === selected.parentId
              ? { ...todo, done: parentDone, completedAt: parentDone ? nowIso() : null }
              : todo,
          );
        }
        return { ...prev, todos };
      });
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done, completedAt }),
      });
    },
    [persist, sendMutation],
  );

  /* 드래그로 바뀐 순서/스코프를 저장한다. 서버 저장에 실패하면 이전 상태로 되돌리고 false를 반환한다. */
  const reorderTodos = useCallback(
    async (items: TodoOrderItem[]) => {
      const prevTodos = dataRef.current.todos;
      const changes = new Map(items.map((item) => [item.id, item]));
      persist((prev) => ({
        ...prev,
        todos: prev.todos.map((todo) => {
          const change = changes.get(todo.id);
          return change
            ? { ...todo, parentId: change.parentId, scope: change.scope, sortOrder: change.sortOrder }
            : todo;
        }),
      }));

      if (!serverBacked.current || authRef.current !== "ready") return true;
      setSync({ label: "syncing", tone: "neutral" });
      try {
        const response = await apiFetch("/api/todos/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!response.ok) throw new Error(`Reorder failed: ${response.status}`);
        setSync({ label: "synced", tone: "ok" });
        return true;
      } catch {
        persist((prev) => ({ ...prev, todos: prevTodos }));
        setSync({ label: "offline", tone: "warn" });
        return false;
      }
    },
    [persist],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      persist((prev) => ({ ...prev, todos: prev.todos.filter((todo) => todo.id !== id && todo.parentId !== id) }));
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [persist, sendMutation],
  );

  const updateTodo = useCallback(
    (id: string, patch: TodoPatch) => {
      persist((prev) => {
        const selected = prev.todos.find((todo) => todo.id === id);
        return {
          ...prev,
          todos: prev.todos.map((todo) =>
          todo.id === id || (patch.scope && !selected?.parentId && todo.parentId === id)
            ? {
                ...todo,
                ...(todo.id === id ? patch : { scope: patch.scope }),
                category: patch.category !== undefined ? patch.category?.trim() || null : todo.category,
                note: patch.note !== undefined ? patch.note?.trim() || null : todo.note,
              }
            : todo,
          ),
        };
      });
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [persist, sendMutation],
  );

  /* 루틴은 서버가 오늘 할 일로 펼쳐주므로, 바꾼 뒤 서버 데이터를 다시 읽어 목록에 반영한다. */
  const addRoutine = useCallback(
    async (input: { title: string; weekdays: number[]; category?: string | null }) => {
      const routine: Routine = {
        id: uid(),
        title: input.title,
        weekdays: input.weekdays,
        category: input.category || null,
        active: true,
        createdAt: nowIso(),
      };
      persist((prev) => ({ ...prev, routines: [...prev.routines, routine] }));
      await sendMutation("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routine),
      });
      await loadServerData();
    },
    [persist, sendMutation, loadServerData],
  );

  const updateRoutine = useCallback(
    async (id: string, patch: RoutinePatch) => {
      persist((prev) => ({
        ...prev,
        routines: prev.routines.map((routine) => (routine.id === id ? { ...routine, ...patch } : routine)),
      }));
      await sendMutation(`/api/routines/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadServerData();
    },
    [persist, sendMutation, loadServerData],
  );

  const deleteRoutine = useCallback(
    async (id: string) => {
      persist((prev) => ({ ...prev, routines: prev.routines.filter((routine) => routine.id !== id) }));
      await sendMutation(`/api/routines/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [persist, sendMutation],
  );

  const addMemo = useCallback(
    ({ title = "", body }: { title?: string; body: string }) => {
      const createdAt = nowIso();
      const memoId = uid();
      const todos: Todo[] = extractTodos(body).map((todoTitle) => ({
        id: uid(),
        title: todoTitle,
        scope: "day",
        done: false,
        createdAt,
        sourceMemoId: memoId,
      }));
      const sortOrder =
        Math.min(0, ...dataRef.current.memos.map((memo) => (Number.isFinite(memo.sortOrder) ? memo.sortOrder! : 0))) - 1;
      const memo: Memo = {
        id: memoId,
        title: title.trim(),
        body,
        createdAt,
        tags: extractTags(body),
        starred: false,
        sortOrder,
      };
      persist((prev) => ({ ...prev, memos: [memo, ...prev.memos], todos: [...todos, ...prev.todos] }));
      sendMutation("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, todos }),
      });
    },
    [persist, sendMutation],
  );

  const updateMemo = useCallback(
    (id: string, patch: MemoPatch) => {
      persist((prev) => ({
        ...prev,
        memos: prev.memos.map((memo) =>
          memo.id === id
            ? {
                ...memo,
                ...patch,
                tags: patch.body !== undefined ? extractTags(patch.body) : memo.tags,
              }
            : memo,
        ),
      }));
      sendMutation(`/api/memos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [persist, sendMutation],
  );

  const deleteMemo = useCallback(
    (id: string) => {
      persist((prev) => ({ ...prev, memos: prev.memos.filter((memo) => memo.id !== id) }));
      sendMutation(`/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [persist, sendMutation],
  );

  /* 드래그앤드롭 순서 저장. 서버 저장 실패 시 기존 순서로 복원하고 false를 반환한다. */
  const reorderMemos = useCallback(
    async (ids: string[]) => {
      const prevMemos = dataRef.current.memos;
      const byId = new Map(prevMemos.map((memo) => [memo.id, memo]));
      const ordered: Memo[] = [];
      ids.forEach((id) => {
        const memo = byId.get(id);
        if (memo) ordered.push({ ...memo, sortOrder: ordered.length });
      });
      const rest = prevMemos.filter((memo) => !ids.includes(memo.id));
      persist((prev) => ({ ...prev, memos: [...ordered, ...rest] }));

      if (!serverBacked.current || authRef.current !== "ready") return true;
      setSync({ label: "syncing", tone: "neutral" });
      try {
        const response = await apiFetch("/api/memos/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!response.ok) throw new Error(`Reorder failed: ${response.status}`);
        setSync({ label: "synced", tone: "ok" });
        return true;
      } catch {
        persist((prev) => ({ ...prev, memos: prevMemos }));
        setSync({ label: "offline", tone: "warn" });
        return false;
      }
    },
    [persist],
  );

  const recordSession = useCallback(
    (session: Session) => {
      persist((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));
      sendMutation("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });
    },
    [persist, sendMutation],
  );

  const deleteSession = useCallback(
    (id: string) => {
      persist((prev) => ({ ...prev, sessions: prev.sessions.filter((session) => session.id !== id) }));
      sendMutation(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [persist, sendMutation],
  );

  const startSession = useCallback((label: string) => {
    const next: ActiveSession = { id: uid(), label, startedAt: nowIso() };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(next));
    setActiveSession(next);
  }, []);

  const stopSession = useCallback(() => {
    const current = activeSessionRef.current;
    if (!current) return;
    recordSession({ ...current, endedAt: nowIso() });
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    setActiveSession(null);
  }, [recordSession]);

  const value = useMemo<AppDataValue>(
    () => ({
      data,
      auth,
      email,
      loginError,
      sync,
      activeSession,
      pauseSyncRef,
      login,
      logout,
      addTodo,
      toggleTodo,
      deleteTodo,
      updateTodo,
      reorderTodos,
      addRoutine,
      updateRoutine,
      deleteRoutine,
      addMemo,
      updateMemo,
      deleteMemo,
      reorderMemos,
      recordSession,
      deleteSession,
      startSession,
      stopSession,
    }),
    [
      data,
      auth,
      email,
      loginError,
      sync,
      activeSession,
      login,
      logout,
      addTodo,
      toggleTodo,
      deleteTodo,
      updateTodo,
      reorderTodos,
      addRoutine,
      updateRoutine,
      deleteRoutine,
      addMemo,
      updateMemo,
      deleteMemo,
      reorderMemos,
      recordSession,
      deleteSession,
      startSession,
      stopSession,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}

export function useTodayTick(intervalMs = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return todayKey();
}
