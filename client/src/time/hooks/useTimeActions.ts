import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import type { ActiveSession, WorkSession } from "../../types";
import { request, type SetWorkspaceData, uid } from "../../workspace/data";
import { momentNoteLabel } from "../domain/session";

export type TimeActions = ReturnType<typeof useTimeActions>;
export type TimerMode = "focus" | "short" | "long";

const TIMER_SETTINGS_KEY = "todo:timer-settings";
const timerDefaults: Record<TimerMode, number> = { focus: 25, short: 5, long: 15 };

/** Time 화면이 필요한 상태와 행동만 노출한다. */
export function useTimeActions({
  sessions,
  activeSession,
  setActiveSession,
  setData,
  activeSessionStorageKey,
}: {
  sessions: WorkSession[];
  activeSession: ActiveSession | null;
  setActiveSession: (session: ActiveSession | null) => void;
  setData: SetWorkspaceData;
  activeSessionStorageKey: string;
}) {
  const [timerMinutes, setTimerMinutes] = useState(timerDefaults);

  useEffect(() => {
    AsyncStorage.getItem(TIMER_SETTINGS_KEY)
      .then((value) => {
        if (!value) return;
        setTimerMinutes({ ...timerDefaults, ...(JSON.parse(value) as Partial<Record<TimerMode, number>>) });
      })
      .catch(() => undefined);
  }, []);

  const updateTimerMinutes = (mode: TimerMode, value: string) => {
    const next = Math.max(1, Math.min(180, Number(value) || 1));
    const settings = { ...timerMinutes, [mode]: next };
    setTimerMinutes(settings);
    void AsyncStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(settings));
  };

  const startSession = async (label: string) => {
    const next: ActiveSession = {
      id: uid(),
      label: label.trim(),
      startedAt: new Date().toISOString(),
    };
    setActiveSession(next);
    await AsyncStorage.setItem(activeSessionStorageKey, JSON.stringify(next));
  };

  const stopSession = async () => {
    if (!activeSession) return;
    const completed: WorkSession = { ...activeSession, endedAt: new Date().toISOString() };
    setActiveSession(null);
    await AsyncStorage.removeItem(activeSessionStorageKey);
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

  const recordTimedSession = async ({
    label,
    startedAtMs,
    endedAtMs,
  }: {
    label: string;
    startedAtMs: number;
    endedAtMs: number;
  }) =>
    recordSession({
      id: `${endedAtMs}`,
      label,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    });

  const deleteSession = async (id: string) => {
    setData((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== id) }));
    await request(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const recordMomentNote = async (body: string) => {
    const now = new Date();
    await recordSession({
      id: `${now.getTime()}`,
      label: momentNoteLabel(body),
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + 1000).toISOString(),
    });
  };

  return {
    sessions,
    activeSession,
    timerMinutes,
    updateTimerMinutes,
    startSession,
    stopSession,
    recordTimedSession,
    recordMomentNote,
    deleteSession,
  };
}
