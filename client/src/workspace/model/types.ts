import { toMemo, type Memo } from "../../notes/model/types";
import { toRoutine, type Routine } from "../../routines/model/types";
import { toWorkSession, type WorkSession } from "../../time/model/types";
import { toTodo, type Todo } from "../../todo/model/types";
import type { WorkspaceDto } from "../api/workspaceDto";

export interface WorkspaceData {
  todos: Todo[];
  memos: Memo[];
  sessions: WorkSession[];
  routines: Routine[];
}

export function toWorkspaceData(dto: Partial<WorkspaceDto>): WorkspaceData {
  return {
    todos: Array.isArray(dto.todos) ? dto.todos.map(toTodo) : [],
    memos: Array.isArray(dto.memos) ? dto.memos.map(toMemo) : [],
    sessions: Array.isArray(dto.sessions) ? dto.sessions.map(toWorkSession) : [],
    routines: Array.isArray(dto.routines) ? dto.routines.map(toRoutine) : [],
  };
}
