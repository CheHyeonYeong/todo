import { request } from "../../shared/api/request";
import { uid } from "../../shared/id/uid";
import type { TodoDto } from "../../todo/api/todoDto";
import { toTodo } from "../../todo/model/types";
import type { SetWorkspaceData } from "../../workspace/hooks/useWorkspaceData";
import type { MemoDto } from "../api/memoDto";
import { extractTags, extractTodoTitles, withDerivedTags } from "../model/memoRules";
import { toMemo, type Memo } from "../model/types";

export function useMemoActions(setData: SetWorkspaceData, reload: () => Promise<void>) {
  const addMemo = async (title: string, body: string) => {
    const memo: MemoDto = {
      id: uid(),
      title: title.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      tags: extractTags(body),
    };
    const extracted: TodoDto[] = extractTodoTitles(body).map((todoTitle, index) => ({
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
      memos: [toMemo(memo), ...current.memos],
      todos: [...extracted.map(toTodo), ...current.todos],
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

  return { addMemo, patchMemo, deleteMemo };
}
