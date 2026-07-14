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
  routineId?: string | null;
  sortOrder?: number;
}

/** 요일별 반복 할 일. weekdays는 0=일 ~ 6=토. */
export interface Routine {
  id: string;
  title: string;
  weekdays: number[];
  category?: string | null;
  active: boolean;
  createdAt: string;
}

export type RoutinePatch = Partial<Pick<Routine, "title" | "weekdays" | "category" | "active">>;

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
  routines: Routine[];
}

export interface ActiveSession {
  id: string;
  label: string;
  startedAt: string;
}
