import type { MemoDto } from "../../notes/api/memoDto";
import type { RoutineDto } from "../../routines/api/routineDto";
import type { SessionDto } from "../../time/api/sessionDto";
import type { TodoDto } from "../../todo/api/todoDto";

export interface WorkspaceDto {
  todos: TodoDto[];
  memos: MemoDto[];
  sessions: SessionDto[];
  routines: RoutineDto[];
}
