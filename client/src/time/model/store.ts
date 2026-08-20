import type { WorkspaceData } from "../../workspace/model/types";
import type { TimeActions } from "../hooks/useTimeActions";

export type TimeStore = TimeActions & { data: Pick<WorkspaceData, "sessions" | "todos" | "memos"> };
