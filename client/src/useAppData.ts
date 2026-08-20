import { useMemoActions } from "./notes/hooks/useMemoActions";
import { useRoutineActions } from "./routines/hooks/useRoutineActions";
import { useTimeActions } from "./time/hooks/useTimeActions";
import { useTodoActions } from "./todo/hooks/useTodoActions";
import { useWorkspaceData } from "./workspace/hooks/useWorkspaceData";

export function useAppData(enabled: boolean) {
  const workspace = useWorkspaceData(enabled);
  const todo = useTodoActions(workspace.setData, workspace.reload);
  const notes = useMemoActions(workspace.setData, workspace.reload);
  const routines = useRoutineActions(workspace.setData, workspace.reload);
  const time = useTimeActions(workspace.setData);

  return {
    data: workspace.data,
    loading: workspace.loading,
    error: workspace.error,
    reload: workspace.reload,
    ...todo,
    ...notes,
    ...routines,
    ...time,
  };
}
