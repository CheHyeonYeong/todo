import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { ActiveSession, AppData, Memo, Routine, Scope, Todo, WorkSession } from "./types";

const EMPTY_DATA: AppData = { todos: [], memos: [], sessions: [], routines: [] };
const ACTIVE_SESSION_KEY = "todo:active-session";
const DATA_CACHE_KEY = "todo:data-cache";

export function uid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
  return response;
}

export function useAppData(enabled: boolean) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await request("/api/data");
      const incoming = (await response.json()) as Partial<AppData>;
      setData({
        todos: Array.isArray(incoming.todos) ? incoming.todos : [],
        memos: Array.isArray(incoming.memos) ? incoming.memos : [],
        sessions: Array.isArray(incoming.sessions) ? incoming.sessions : [],
        routines: Array.isArray(incoming.routines) ? incoming.routines : [],
      });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      AsyncStorage.getItem(DATA_CACHE_KEY).then((saved) => {
        if (!saved) return;
        try { setData(JSON.parse(saved) as AppData); } catch { void AsyncStorage.removeItem(DATA_CACHE_KEY); }
      }).finally(() => void reload());
    }
    else setData(EMPTY_DATA);
  }, [enabled, reload]);

  useEffect(() => { if (enabled) void AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data)); }, [data, enabled]);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_SESSION_KEY).then((saved) => {
      if (!saved) return;
      try {
        setActiveSession(JSON.parse(saved) as ActiveSession);
      } catch {
        void AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    });
  }, []);

  const addTodo = async (input: { title: string; scope: Scope; parentId?: string | null; dueDate?: string | null; category?: string | null }) => {
    const siblings = data.todos.filter((todo) => todo.scope === input.scope && (todo.parentId || null) === (input.parentId || null));
    const todo: Todo = {
      id: uid(), title: input.title.trim(), scope: input.scope, done: false,
      createdAt: new Date().toISOString(), parentId: input.parentId || null,
      dueDate: input.dueDate || null, category: input.category || null,
      sortOrder: Math.max(-1, ...siblings.map((item) => item.sortOrder ?? 0)) + 1,
    };
    setData((current) => ({ ...current, todos: [...current.todos, todo] }));
    try { await request("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(todo) }); }
    catch (reason) { await reload(); throw reason; }
  };

  const patchTodo = async (id: string, patch: Partial<Todo>) => {
    setData((current) => {
      let todos = current.todos.map((todo) => todo.id === id ? { ...todo, ...patch } : todo);
      const selected = todos.find((todo) => todo.id === id);
      if (selected?.parentId && typeof patch.done === "boolean") {
        const siblings = todos.filter((todo) => todo.parentId === selected.parentId);
        const parentDone = siblings.length > 0 && siblings.every((todo) => todo.done);
        todos = todos.map((todo) => todo.id === selected.parentId ? { ...todo, done: parentDone, completedAt: parentDone ? new Date().toISOString() : null } : todo);
      }
      return { ...current, todos };
    });
    try { await request(`/api/todos/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); }
    catch (reason) { await reload(); throw reason; }
  };

  const deleteTodo = async (id: string) => {
    setData((current) => ({ ...current, todos: current.todos.filter((todo) => todo.id !== id && todo.parentId !== id) }));
    try { await request(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" }); }
    catch (reason) { await reload(); throw reason; }
  };

  const addMemo = async (title: string, body: string) => {
    const memo: Memo = { id: uid(), title: title.trim(), body: body.trim(), createdAt: new Date().toISOString(), tags: [...body.matchAll(/#([^\s#]+)/g)].map((match) => match[1]) };
    const extracted: Todo[] = body.split("\n").map((line) => line.match(/^\s*(?:-\s*\[\s?\]|todo:)\s*(.+)$/i)?.[1]?.trim()).filter(Boolean).map((todoTitle, index) => ({ id: uid(), title: todoTitle!, scope: "day", done: false, createdAt: new Date().toISOString(), sourceMemoId: memo.id, parentId: null, sortOrder: index }));
    setData((current) => ({ ...current, memos: [memo, ...current.memos], todos: [...extracted, ...current.todos] }));
    try { await request("/api/memos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo, todos: extracted }) }); }
    catch (reason) { await reload(); throw reason; }
  };

  const patchMemo = async (id: string, patch: Partial<Memo>) => {
    setData((current) => ({ ...current, memos: current.memos.map((memo) => memo.id === id ? { ...memo, ...patch } : memo) }));
    try { await request(`/api/memos/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); }
    catch (reason) { await reload(); throw reason; }
  };

  const deleteMemo = async (id: string) => {
    setData((current) => ({ ...current, memos: current.memos.filter((memo) => memo.id !== id) }));
    try { await request(`/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" }); }
    catch (reason) { await reload(); throw reason; }
  };

  const addRoutine = async (title: string, weekdays: number[], category?: string) => {
    const routine: Routine = { id: uid(), title: title.trim(), weekdays, category: category?.trim() || null, active: true, createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, routines: [...current.routines, routine] }));
    try {
      await request("/api/routines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(routine) });
      await reload();
    } catch (reason) { await reload(); throw reason; }
  };

  const patchRoutine = async (id: string, patch: Partial<Routine>) => {
    await request(`/api/routines/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    await reload();
  };

  const deleteRoutine = async (id: string) => {
    await request(`/api/routines/${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  };

  const startSession = async (label: string) => {
    const next: ActiveSession = { id: uid(), label: label.trim(), startedAt: new Date().toISOString() };
    setActiveSession(next);
    await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(next));
  };

  const stopSession = async () => {
    if (!activeSession) return;
    const completed: WorkSession = { ...activeSession, endedAt: new Date().toISOString() };
    setActiveSession(null);
    await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    setData((current) => ({ ...current, sessions: [completed, ...current.sessions] }));
    await request("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completed) });
  };

  const recordSession = async (session: WorkSession) => {
    setData((current) => ({ ...current, sessions: [session, ...current.sessions] }));
    await request("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(session) });
  };

  const deleteSession = async (id: string) => {
    setData((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== id) }));
    await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  return { data, activeSession, loading, error, reload, addTodo, patchTodo, deleteTodo, addMemo, patchMemo, deleteMemo, addRoutine, patchRoutine, deleteRoutine, startSession, stopSession, recordSession, deleteSession };
}
