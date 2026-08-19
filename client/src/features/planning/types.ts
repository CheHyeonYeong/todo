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

export interface Routine {
  id: string;
  title: string;
  weekdays: number[];
  category?: string | null;
  active: boolean;
  createdAt: string;
}
