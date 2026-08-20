import type { ScopeDto, TodoDto } from "../api/todoDto";

export type Scope = ScopeDto;
export type Todo = Omit<TodoDto, "sourceMemoId">;

export function toTodo(dto: TodoDto): Todo {
  const { sourceMemoId: _sourceMemoId, ...todo } = dto;
  return todo;
}
