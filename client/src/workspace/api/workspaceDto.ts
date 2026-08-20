import type { MemoDto } from "../../notes/api/memoDto";
import type { SessionDto } from "../../time/api/sessionDto";
import type { RoutineDto, TodoDto } from "../../todo/api/todoDto";

export interface WorkspaceDto {
  todos: TodoDto[];
  memos: MemoDto[];
  sessions: SessionDto[];
  routines: RoutineDto[];
}
