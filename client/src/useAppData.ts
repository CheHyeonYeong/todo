import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useMemos } from "./notes/hooks/useMemos";
import { useRoutines } from "./routines/hooks/useRoutines";
import { useTimeTracking } from "./time/hooks/useTimeTracking";
import { useTodos } from "./todo/hooks/useTodos";
import type { ActiveSession, AppData } from "./types";

const EMPTY_DATA: AppData = { todos: [], memos: [], sessions: [], routines: [] };
const ACTIVE_SESSION_KEY = "todo:active-session";
const DATA_CACHE_KEY = "todo:data-cache";

function uid() {
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

  const todoState = useTodos({ todos: data.todos, setData, reload, request, createId: uid });
  const routineState = useRoutines({
    routines: data.routines,
    setData,
    reload,
    request,
    createId: uid,
  });
  const memoState = useMemos({ memos: data.memos, setData, reload, request, createId: uid });
  const timeTracking = useTimeTracking({
    sessions: data.sessions,
    activeSession,
    setActiveSession,
    setData,
    activeSessionStorageKey: ACTIVE_SESSION_KEY,
    request,
    createId: uid,
  });

  return {
    data,
    loading,
    error,
    reload,
    ...todoState,
    ...memoState,
    ...routineState,
    ...timeTracking,
  };
}
