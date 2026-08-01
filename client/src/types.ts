export type Scope = "day" | "week" | "month";

export interface Todo {
  id: string;
  title: string;
  scope: Scope;
  done: boolean;
  createdAt: string;
  completedAt?: string | null;
  dueDate?: string | null;
  category?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}

export interface AppData {
  todos: Todo[];
}
