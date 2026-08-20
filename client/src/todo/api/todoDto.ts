export type ScopeDto = "day" | "week" | "month";

export interface TodoDto {
  id: string;
  title: string;
  scope: ScopeDto;
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

export interface RoutineDto {
  id: string;
  title: string;
  weekdays: number[];
  category?: string | null;
  active: boolean;
  createdAt: string;
}
