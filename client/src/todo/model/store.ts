import type { Scope, Todo } from "./types";

export interface TodoStore {
  data: { todos: Todo[] };
  addTodo(input: {
    title: string;
    scope: Scope;
    parentId?: string | null;
    dueDate?: string | null;
    category?: string | null;
  }): Promise<void>;
  patchTodo(id: string, patch: Partial<Todo>): Promise<void>;
  deleteTodo(id: string): Promise<void>;
}
