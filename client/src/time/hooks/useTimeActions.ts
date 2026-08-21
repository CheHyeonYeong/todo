import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { request } from "../../shared/api/request";
import { uid } from "../../shared/id/uid";
import { activeSessionKey } from "../../shared/storage/userStorageKeys";
import type { SetWorkspaceData } from "../../workspace/hooks/useWorkspaceData";
import type { ActiveSession, WorkSession } from "../model/types";

const LEGACY_ACTIVE_SESSION_KEY = "todo:active-session";

export function useTimeActions(userId: string | null, setData: SetWorkspaceData) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionOwnerId, setSessionOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
    setActiveSession(null);
    setSessionOwnerId(null);
    if (!userId) return () => undefined;
    const cacheKey = activeSessionKey(userId);
    AsyncStorage.getItem(cacheKey).then((saved) => {
      if (cancelled || !saved) return;
      try {
        setActiveSession(JSON.parse(saved) as ActiveSession);
        setSessionOwnerId(userId);
      } catch {
        void AsyncStorage.removeItem(cacheKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const startSession = async (label: string) => {
    if (!userId) return;
    const next: ActiveSession = { id: uid(), label: label.trim(), startedAt: new Date().toISOString() };
    setActiveSession(next);
    setSessionOwnerId(userId);
    await AsyncStorage.setItem(activeSessionKey(userId), JSON.stringify(next));
  };

  const stopSession = async () => {
    if (!userId || !activeSession || sessionOwnerId !== userId) return;
    const completed: WorkSession = { ...activeSession, endedAt: new Date().toISOString() };
    setActiveSession(null);
    setSessionOwnerId(null);
    await AsyncStorage.removeItem(activeSessionKey(userId));
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
    activeSession: sessionOwnerId === userId ? activeSession : null,
    startSession,
    stopSession,
    recordSession,
    deleteSession,
  };
}
