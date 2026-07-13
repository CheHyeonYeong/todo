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
import { apiFetch, setAuthToken, supabase } from "@/lib/api";
import { extractTags, extractTodos, nowIso, todayKey, uid } from "@/lib/helpers";
import type { ActiveSession, AppData, Memo, Scope, Session, Todo } from "@/lib/types";

const STORAGE_KEY = "free-adhd-memo:v1";
const ACTIVE_SESSION_KEY = "free-adhd-memo:active-session";

export type AuthState = "checking" | "login" | "ready";
export interface SyncStatus {
  label: string;
  tone: "neutral" | "ok" | "warn";
}

function starterData(): AppData {
  return { todos: [], memos: [], sessions: [] };
}

function loadLocalData(): AppData {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed) return starterData();
    return {
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      memos: Array.isArray(parsed.memos) ? parsed.memos : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
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
  addTodo: (input: { title: string; scope: Scope; dueDate?: string | null }) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodoTitle: (id: string, title: string) => void;
  addMemo: (body: string) => void;
  deleteMemo: (id: string) => void;
  toggleMemoStar: (id: string) => void;
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
      const response = await apiFetch("/api/data");
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
    return () => clearInterval(id);
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
    ({ title, scope, dueDate = null }: { title: string; scope: Scope; dueDate?: string | null }) => {
      const todo: Todo = { id: uid(), title, scope, done: false, createdAt: nowIso(), dueDate };
      persist((prev) => ({ ...prev, todos: [todo, ...prev.todos] }));
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
      persist((prev) => ({
        ...prev,
        todos: prev.todos.map((todo) => (todo.id === id ? { ...todo, done, completedAt } : todo)),
      }));
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done, completedAt }),
      });
    },
    [persist, sendMutation],
  );

  const deleteTodo = useCallback(
    (id: string) => {
      persist((prev) => ({ ...prev, todos: prev.todos.filter((todo) => todo.id !== id) }));
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    [persist, sendMutation],
  );

  const updateTodoTitle = useCallback(
    (id: string, title: string) => {
      persist((prev) => ({
        ...prev,
        todos: prev.todos.map((todo) => (todo.id === id ? { ...todo, title } : todo)),
      }));
      sendMutation(`/api/todos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    },
    [persist, sendMutation],
  );

  const addMemo = useCallback(
    (body: string) => {
      const createdAt = nowIso();
      const memoId = uid();
      const todos: Todo[] = extractTodos(body).map((title) => ({
        id: uid(),
        title,
        scope: "day",
        done: false,
        createdAt,
        sourceMemoId: memoId,
      }));
      const memo: Memo = { id: memoId, body, createdAt, tags: extractTags(body), starred: false };
      persist((prev) => ({ ...prev, memos: [memo, ...prev.memos], todos: [...todos, ...prev.todos] }));
      sendMutation("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, todos }),
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

  const toggleMemoStar = useCallback(
    (id: string) => {
      const current = dataRef.current.memos.find((memo) => memo.id === id);
      if (!current) return;
      const starred = !current.starred;
      persist((prev) => ({
        ...prev,
        memos: prev.memos.map((memo) => (memo.id === id ? { ...memo, starred } : memo)),
      }));
      sendMutation(`/api/memos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred }),
      });
    },
    [persist, sendMutation],
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
      updateTodoTitle,
      addMemo,
      deleteMemo,
      toggleMemoStar,
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
      updateTodoTitle,
      addMemo,
      deleteMemo,
      toggleMemoStar,
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
