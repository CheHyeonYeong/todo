import type { useAppData } from "../../useAppData";

type WorkspaceStore = ReturnType<typeof useAppData>;

export type TodoActions = {
  todos: WorkspaceStore["data"]["todos"];
  addTodo: WorkspaceStore["addTodo"];
  patchTodo: WorkspaceStore["patchTodo"];
  deleteTodo: WorkspaceStore["deleteTodo"];
};

export function useTodoActions(store: WorkspaceStore): TodoActions {
  return {
    todos: store.data.todos,
    addTodo: store.addTodo,
    patchTodo: store.patchTodo,
    deleteTodo: store.deleteTodo,
  };
}
