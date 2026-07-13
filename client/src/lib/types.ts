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
}

export type TodoPatch = Partial<Pick<Todo, "title" | "scope" | "dueDate" | "category" | "note">>;

export interface Memo {
  id: string;
  body: string;
  createdAt: string;
  tags: string[];
  starred?: boolean;
}

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
