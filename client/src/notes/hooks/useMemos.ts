import type { Dispatch, SetStateAction } from "react";
import { extractTags, extractTodoTitles, withDerivedTags } from "../domain/memo";
import type { AppData, Memo, Todo } from "../../types";

type SetWorkspaceData = Dispatch<SetStateAction<AppData>>;
type ReloadWorkspace = () => Promise<void>;
type WorkspaceRequest = (path: string, init?: RequestInit) => Promise<Response>;
type CreateId = () => string;

export type UseMemosResult = {
  memos: Memo[];
  addMemo: (title: string, body: string) => Promise<void>;
  patchMemo: (id: string, patch: Partial<Memo>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
};

export function useMemos({
  memos,
  setData,
  reload,
  request,
  createId,
}: {
  memos: Memo[];
  setData: SetWorkspaceData;
  reload: ReloadWorkspace;
  request: WorkspaceRequest;
  createId: CreateId;
}): UseMemosResult {
  const addMemo = async (title: string, body: string) => {
    const memo: Memo = {
      id: createId(),
      title: title.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      tags: extractTags(body),
    };
    const extracted: Todo[] = extractTodoTitles(body).map((todoTitle, index) => ({
      id: createId(),
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

  return {
    memos,
    addMemo,
    patchMemo,
    deleteMemo,
  };
}
