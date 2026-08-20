import type { WorkSession } from "../../time/model/types";

export interface ScheduleStore {
  data: { sessions: WorkSession[] };
  deleteSession(id: string): Promise<void>;
}
