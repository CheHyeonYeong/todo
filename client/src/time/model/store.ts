import type { Memo } from "../../notes/model/types";
import type { Todo } from "../../todo/model/types";
import type { ActiveSession, WorkSession } from "./types";

export interface TimeStore {
  data: { sessions: WorkSession[]; todos: Todo[]; memos: Memo[] };
  activeSession: ActiveSession | null;
  startSession(label: string): Promise<void>;
  stopSession(): Promise<void>;
  recordSession(session: WorkSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
