import type { TodoDto } from "../api/todoDto";

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
  note?: string | null;
  parentId?: string | null;
  routineId?: string | null;
  sortOrder?: number;
}

export function toTodo(dto: TodoDto): Todo {
  return {
    id: dto.id,
    title: dto.title,
    scope: dto.scope,
    done: dto.done,
    createdAt: dto.createdAt,
    completedAt: dto.completedAt,
    dueDate: dto.dueDate,
    category: dto.category,
    note: dto.note,
    parentId: dto.parentId,
    routineId: dto.routineId,
    sortOrder: dto.sortOrder,
  };
}
