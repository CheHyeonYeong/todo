import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { request } from "../../shared/api/request";
import { uid } from "../../shared/id/uid";
import type { SetWorkspaceData } from "../../workspace/hooks/useWorkspaceData";
import type { ActiveSession, WorkSession } from "../model/types";

const ACTIVE_SESSION_KEY = "todo:active-session";

export type TimeActions = ReturnType<typeof useTimeActions>;

export function useTimeActions(setData: SetWorkspaceData) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

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

  return { activeSession, startSession, stopSession, recordSession, deleteSession };
}
