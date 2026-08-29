/* 할 일의 규칙. 서버(server/todo/domain)에도 같은 규칙이 있고, 낙관적 갱신 때문에
   화면이 서버 응답보다 먼저 이 계산을 쓴다. 둘이 어긋나면 20초 뒤 화면이 되돌아간다. */
import type { Scope, Todo } from "../../types";

/** 같은 칸(스코프+부모)의 맨 뒤. 형제가 없으면 0부터 시작한다. */
export function nextSortOrder(todos: Todo[], scope: Scope, parentId: string | null): number {
  const siblings = todos.filter((todo) => todo.scope === scope && (todo.parentId || null) === parentId);
  return Math.max(-1, ...siblings.map((todo) => todo.sortOrder ?? 0)) + 1;
}

/** 완료로 바꿀 때만 시각을 남기고, 되돌리면 지운다. */
export function completionPatch(done: boolean, now: Date): Pick<Todo, "done" | "completedAt"> {
  return { done, completedAt: done ? now.toISOString() : null };
}

/**
 * 패치를 적용하고 부모의 완료 상태를 다시 계산한다.
 * 하위 목표를 건드렸을 때만 부모를 따라 올라가며, 형제가 전부 끝나야 부모도 끝난다.
 */
export function applyTodoPatch(todos: Todo[], id: string, patch: Partial<Todo>, now: Date): Todo[] {
  const next = todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo));
  const selected = next.find((todo) => todo.id === id);
  if (!selected?.parentId || typeof patch.done !== "boolean") return next;

  const siblings = next.filter((todo) => todo.parentId === selected.parentId);
  const parentDone = siblings.length > 0 && siblings.every((todo) => todo.done);
  return next.map((todo) =>
    todo.id === selected.parentId ? { ...todo, ...completionPatch(parentDone, now) } : todo,
  );
}
