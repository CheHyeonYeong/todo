import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { extractTags, extractTodoTitles, withDerivedTags } from "./domain/memo";
import { useRoutineActions } from "./routines/hooks/useRoutineActions";
import { useTodoActions } from "./todo/hooks/useTodoActions";
import type { ActiveSession, AppData, Memo, Todo, WorkSession } from "./types";
import { request, uid } from "./workspace/data";

const EMPTY_DATA: AppData = { todos: [], memos: [], sessions: [], routines: [] };
const ACTIVE_SESSION_KEY = "todo:active-session";
const DATA_CACHE_KEY = "todo:data-cache";

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
      AsyncStorage.getItem(DATA_CACHE_KEY)
        .then((saved) => {
          if (!saved) return;
          try {
            setData(JSON.parse(saved) as AppData);
          } catch {
            void AsyncStorage.removeItem(DATA_CACHE_KEY);
          }
        })
        .finally(() => void reload());
    } else setData(EMPTY_DATA);
  }, [enabled, reload]);

  useEffect(() => {
    if (enabled) void AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
  }, [data, enabled]);

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

  const todoActions = useTodoActions({ todos: data.todos, setData, reload });
  const routineActions = useRoutineActions({ routines: data.routines, setData, reload });

  const addMemo = async (title: string, body: string) => {
    const memo: Memo = {
      id: uid(),
      title: title.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      tags: extractTags(body),
    };
    const extracted: Todo[] = extractTodoTitles(body).map((todoTitle, index) => ({
      id: uid(),
      title: todoTitle,
      scope: "day",
      done: false,
      createdAt: new Date().toISOString(),
      sourceMemoId: memo.id,
      parentId: null,
      sortOrder: index,
    }));
    setData((current) => ({
      ...current,
      memos: [memo, ...current.memos],
      todos: [...extracted, ...current.todos],
    }));
    try {
      await request("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, todos: extracted }),
      });
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const patchMemo = async (id: string, patch: Partial<Memo>) => {
    const applied = withDerivedTags(patch);
    setData((current) => ({
      ...current,
      memos: current.memos.map((memo) => (memo.id === id ? { ...memo, ...applied } : memo)),
    }));
    try {
      await request(`/api/memos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applied),
      });
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const deleteMemo = async (id: string) => {
    setData((current) => ({ ...current, memos: current.memos.filter((memo) => memo.id !== id) }));
    try {
      await request(`/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (reason) {
      await reload();
      throw reason;
    }
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
    await request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(completed),
    });
  };

  const recordSession = async (session: WorkSession) => {
    setData((current) => ({ ...current, sessions: [session, ...current.sessions] }));
    await request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
  };

  const deleteSession = async (id: string) => {
    setData((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== id) }));
    await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  return {
    data,
    activeSession,
    loading,
    error,
    reload,
    ...todoActions,
    addMemo,
    patchMemo,
    deleteMemo,
    ...routineActions,
    startSession,
    stopSession,
    recordSession,
    deleteSession,
  };
}
