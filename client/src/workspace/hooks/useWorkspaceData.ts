import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { request } from "../../shared/api/request";
import { workspaceCacheKey } from "../../shared/storage/userStorageKeys";
import type { WorkspaceDto } from "../api/workspaceDto";
import { toWorkspaceData, type WorkspaceData } from "../model/types";

const EMPTY_DATA: WorkspaceData = { todos: [], memos: [], sessions: [], routines: [] };
const LEGACY_DATA_CACHE_KEY = "todo:data-cache";
export type SetWorkspaceData = Dispatch<SetStateAction<WorkspaceData>>;

export function useWorkspaceData(userId: string | null) {
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await request("/api/data");
      const incoming = (await response.json()) as Partial<WorkspaceDto>;
      if (currentUserId.current !== userId) return;
      setData(toWorkspaceData(incoming));
      setDataOwnerId(userId);
      setError(null);
    } catch (reason) {
      if (currentUserId.current !== userId) return;
      setError(reason instanceof Error ? reason.message : "데이터를 불러오지 못했습니다.");
    } finally {
      if (currentUserId.current === userId) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.removeItem(LEGACY_DATA_CACHE_KEY);
    setData(EMPTY_DATA);
    setDataOwnerId(null);
    setError(null);
    if (!userId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    const cacheKey = workspaceCacheKey(userId);
    AsyncStorage.getItem(cacheKey)
      .then((saved) => {
        if (cancelled || !saved) return;
        try {
          setData(toWorkspaceData(JSON.parse(saved) as Partial<WorkspaceDto>));
          setDataOwnerId(userId);
        } catch {
          void AsyncStorage.removeItem(cacheKey);
        }
      })
      .finally(() => {
        if (!cancelled) void reload();
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  useEffect(() => {
    if (userId && dataOwnerId === userId) {
      void AsyncStorage.setItem(workspaceCacheKey(userId), JSON.stringify(data));
    }
  }, [data, dataOwnerId, userId]);

  return {
    data: dataOwnerId === userId ? data : EMPTY_DATA,
    setData,
    loading,
    error,
    reload,
  };
}
