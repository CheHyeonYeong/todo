import { request } from "../../shared/api/request";
import { uid } from "../../shared/id/uid";
import type { SetWorkspaceData } from "../../workspace/hooks/useWorkspaceData";
import type { TodoDto } from "../api/todoDto";
import { applyTodoPatch, nextSortOrder } from "../model/todoRules";
import { toTodo, type Scope, type Todo } from "../model/types";

export type TodoActions = ReturnType<typeof useTodoActions>;

export function useTodoActions(setData: SetWorkspaceData, reload: () => Promise<void>) {
  const addTodo = async (input: {
    title: string;
    scope: Scope;
    parentId?: string | null;
    dueDate?: string | null;
    category?: string | null;
  }) => {
    const parentId = input.parentId || null;
    const todo: Todo = {
      id: uid(),
      title: input.title.trim(),
      scope: input.scope,
      done: false,
      createdAt: new Date().toISOString(),
      parentId,
      dueDate: input.dueDate || null,
      category: input.category || null,
    };
    setData((current) => ({
      ...current,
      todos: [...current.todos, { ...todo, sortOrder: nextSortOrder(current.todos, input.scope, parentId) }],
    }));
    try {
      const response = await request("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todo),
      });
      const saved = (await response.json().catch(() => null)) as TodoDto | null;
      if (saved?.id)
        setData((current) => ({
          ...current,
          todos: current.todos.map((item) => (item.id === saved.id ? { ...item, ...toTodo(saved) } : item)),
        }));
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const patchTodo = async (id: string, patch: Partial<Todo>) => {
    setData((current) => ({ ...current, todos: applyTodoPatch(current.todos, id, patch, new Date()) }));
    try {
      await request(`/api/todos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const deleteTodo = async (id: string) => {
    setData((current) => ({
      ...current,
      todos: current.todos.filter((todo) => todo.id !== id && todo.parentId !== id),
    }));
    try {
      await request(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  return { addTodo, patchTodo, deleteTodo };
}
