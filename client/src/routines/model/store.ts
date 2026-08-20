import type { WorkspaceData } from "../../workspace/model/types";
import type { RoutineActions } from "../hooks/useRoutineActions";

export type RoutineStore = RoutineActions & { data: Pick<WorkspaceData, "routines"> };
