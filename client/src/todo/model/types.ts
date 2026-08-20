import type { RoutineDto, ScopeDto, TodoDto } from "../api/todoDto";

export type Scope = ScopeDto;
export type Todo = Omit<TodoDto, "sourceMemoId">;
export type Routine = RoutineDto;

export function toTodo(dto: TodoDto): Todo {
  const { sourceMemoId: _sourceMemoId, ...todo } = dto;
  return todo;
}

export function toRoutine(dto: RoutineDto): Routine {
  return { ...dto };
}
