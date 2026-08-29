import type { useAppData } from "../../useAppData";

type Store = ReturnType<typeof useAppData>;

export function useWorkspaceContracts(store: Store) {
  const reloadWorkspace = () => void store.reload();
  const memoActions = {
    memos: store.data.memos,
    addMemo: store.addMemo,
    patchMemo: store.patchMemo,
    deleteMemo: store.deleteMemo,
  };
  const todoActions = {
    todos: store.data.todos,
    addTodo: store.addTodo,
    addTodoWithDefaultDueDate: store.addTodoWithDefaultDueDate,
    patchTodo: store.patchTodo,
    deleteTodo: store.deleteTodo,
    toggleTodo: store.toggleTodo,
  };
  const routineActions = {
    routines: store.data.routines,
    addRoutine: store.addRoutine,
    patchRoutine: store.patchRoutine,
    deleteRoutine: store.deleteRoutine,
  };
  const time = {
    sessions: store.data.sessions,
    activeSession: store.activeSession,
    timerMinutes: store.timerMinutes,
    updateTimerMinutes: store.updateTimerMinutes,
    startSession: store.startSession,
    stopSession: store.stopSession,
    recordTimedSession: store.recordTimedSession,
    recordMomentNote: store.recordMomentNote,
    deleteSession: store.deleteSession,
  };

  return {
    loading: store.loading,
    error: store.error,
    reloadWorkspace,
    memoActions,
    todoActions,
    routineActions,
    time,
  };
}
