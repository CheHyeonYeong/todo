import type { useAppData } from "../../useAppData";

type WorkspaceStore = ReturnType<typeof useAppData>;

export type RoutineActions = {
  routines: WorkspaceStore["data"]["routines"];
  addRoutine: WorkspaceStore["addRoutine"];
  patchRoutine: WorkspaceStore["patchRoutine"];
  deleteRoutine: WorkspaceStore["deleteRoutine"];
};

export function useRoutineActions(store: WorkspaceStore): RoutineActions {
  return {
    routines: store.data.routines,
    addRoutine: store.addRoutine,
    patchRoutine: store.patchRoutine,
    deleteRoutine: store.deleteRoutine,
  };
}
