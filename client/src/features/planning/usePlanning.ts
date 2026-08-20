import type { useWorkspace } from "../../workspace/useWorkspace";

export function usePlanning(workspace: ReturnType<typeof useWorkspace>) {
  return {
    data: {
      todos: workspace.data.todos,
      routines: workspace.data.routines,
      sessions: workspace.data.sessions,
    },
    addTodo: workspace.addTodo,
    patchTodo: workspace.patchTodo,
    deleteTodo: workspace.deleteTodo,
    addRoutine: workspace.addRoutine,
    patchRoutine: workspace.patchRoutine,
    deleteRoutine: workspace.deleteRoutine,
    deleteSession: workspace.deleteSession,
  };
}
