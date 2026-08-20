import type { TimeActions } from "../../time/hooks/useTimeActions";
import type { WorkspaceData } from "./types";

export type ScheduleStore = Pick<TimeActions, "deleteSession"> & {
  data: Pick<WorkspaceData, "sessions">;
};
