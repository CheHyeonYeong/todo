import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { request } from "../../shared/api/request";
import type { WorkspaceDto } from "../api/workspaceDto";
import { toWorkspaceData, type WorkspaceData } from "../model/types";

const EMPTY_DATA: WorkspaceData = { todos: [], memos: [], sessions: [], routines: [] };
const DATA_CACHE_KEY = "todo:data-cache";

export type SetWorkspaceData = Dispatch<SetStateAction<WorkspaceData>>;

export function useWorkspaceData(enabled: boolean) {
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await request("/api/data");
      const incoming = (await response.json()) as Partial<WorkspaceDto>;
      setData(toWorkspaceData(incoming));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(EMPTY_DATA);
      return;
    }
    AsyncStorage.getItem(DATA_CACHE_KEY)
      .then((saved) => {
        if (!saved) return;
        try {
          setData(toWorkspaceData(JSON.parse(saved) as Partial<WorkspaceDto>));
        } catch {
          void AsyncStorage.removeItem(DATA_CACHE_KEY);
        }
      })
      .finally(() => void reload());
  }, [enabled, reload]);

  useEffect(() => {
    if (enabled) void AsyncStorage.setItem(DATA_CACHE_KEY, JSON.stringify(data));
  }, [data, enabled]);

  return { data, setData, loading, error, reload };
}
