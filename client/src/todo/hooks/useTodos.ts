import type { Dispatch, SetStateAction } from "react";
import { defaultDueDate } from "../domain/calendar";
import { applyTodoPatch, completionPatch, nextSortOrder } from "../domain/todo";
import type { AppData, Scope, Todo } from "../../types";

type SetWorkspaceData = Dispatch<SetStateAction<AppData>>;
type ReloadWorkspace = () => Promise<void>;
type WorkspaceRequest = (path: string, init?: RequestInit) => Promise<Response>;
type CreateId = () => string;

export type TodoInput = {
  title: string;
  scope: Scope;
  parentId?: string | null;
  dueDate?: string | null;
  category?: string | null;
};

export type UseTodosResult = {
  todos: Todo[];
  today: Date;
  addTodo: (input: TodoInput) => Promise<void>;
  addTodoWithDefaultDueDate: (input: Omit<TodoInput, "parentId">) => Promise<void>;
  patchTodo: (id: string, patch: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  toggleTodo: (todo: Todo) => void;
};

export function useTodos({
  todos,
  setData,
  reload,
  request,
  createId,
}: {
  todos: Todo[];
  setData: SetWorkspaceData;
  reload: ReloadWorkspace;
  request: WorkspaceRequest;
  createId: CreateId;
}): UseTodosResult {
  const today = new Date();

  const addTodo = async (input: TodoInput) => {
    const parentId = input.parentId || null;
    const todo: Todo = {
      id: createId(),
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
    today,
    addTodo,
    addTodoWithDefaultDueDate,
    patchTodo,
    deleteTodo,
    toggleTodo,
  };
}
