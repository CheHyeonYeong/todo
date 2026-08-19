import type { Memo } from "../features/memos/types";
import type { Routine, Todo } from "../features/planning/types";
import type { WorkSession } from "../features/time/types";

export interface WorkspaceData {
  todos: Todo[];
  memos: Memo[];
  sessions: WorkSession[];
  routines: Routine[];
}
