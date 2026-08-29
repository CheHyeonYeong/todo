import { extractTags, extractTodoTitles, withDerivedTags } from "../domain/memo";
import type { Memo, Todo } from "../../types";
import { request, type ReloadWorkspace, type SetWorkspaceData, uid } from "../../workspace/data";

export type MemoActions = {
  memos: Memo[];
  addMemo: (title: string, body: string) => Promise<void>;
  patchMemo: (id: string, patch: Partial<Memo>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
};

export function useMemoActions({
  memos,
  setData,
  reload,
}: {
  memos: Memo[];
  setData: SetWorkspaceData;
  reload: ReloadWorkspace;
}): MemoActions {
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

  return {
    memos,
    addMemo,
    patchMemo,
    deleteMemo,
  };
}
