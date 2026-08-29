import { defaultDueDate } from "../domain/calendar";
import { applyTodoPatch, completionPatch, nextSortOrder } from "../domain/todo";
import type { Scope, Todo } from "../../types";
import { request, type ReloadWorkspace, type SetWorkspaceData, uid } from "../../workspace/data";

type TodoInput = {
  title: string;
  scope: Scope;
  parentId?: string | null;
  dueDate?: string | null;
  category?: string | null;
};

export type TodoActions = {
  todos: Todo[];
  addTodo: (input: TodoInput) => Promise<void>;
  addTodoWithDefaultDueDate: (input: Omit<TodoInput, "parentId">) => Promise<void>;
  patchTodo: (id: string, patch: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  toggleTodo: (todo: Todo) => void;
};

export function useTodoActions({
  todos,
  setData,
  reload,
}: {
  todos: Todo[];
  setData: SetWorkspaceData;
  reload: ReloadWorkspace;
}): TodoActions {
  const addTodo = async (input: TodoInput) => {
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
      const saved = (await response.json().catch(() => null)) as Todo | null;
      if (saved?.id)
        setData((current) => ({
          ...current,
          todos: current.todos.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
        }));
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const addTodoWithDefaultDueDate = (input: Omit<TodoInput, "parentId">) =>
    addTodo({
      ...input,
      dueDate: input.dueDate || defaultDueDate(input.scope, new Date()),
    });

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

  const toggleTodo = (todo: Todo) => void patchTodo(todo.id, completionPatch(!todo.done, new Date()));

  return {
    todos,
    addTodo,
    addTodoWithDefaultDueDate,
    patchTodo,
    deleteTodo,
    toggleTodo,
  };
}
