export type Scope = "day" | "week" | "month";

export interface Todo {
  id: string;
  title: string;
  scope: Scope;
  done: boolean;
  createdAt: string;
  completedAt?: string | null;
  sourceMemoId?: string | null;
  dueDate?: string | null;
  category?: string | null;
  note?: string | null;
  parentId?: string | null;
  sortOrder?: number;
}

export type TodoPatch = Partial<Pick<Todo, "title" | "scope" | "dueDate" | "category" | "note">>;

export interface Memo {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  tags: string[];
  starred?: boolean;
  sortOrder?: number;
}

export type MemoPatch = Partial<Pick<Memo, "title" | "body">>;

export interface Session {
  id: string;
  label: string;
  startedAt: string;
  endedAt: string;
}

export interface AppData {
  todos: Todo[];
  memos: Memo[];
  sessions: Session[];
}

export interface ActiveSession {
  id: string;
  label: string;
  startedAt: string;
}
