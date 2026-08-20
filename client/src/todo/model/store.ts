import type { WorkspaceData } from "../../workspace/model/types";
import type { TodoActions } from "../hooks/useTodoActions";

export type TodoStore = TodoActions & { data: Pick<WorkspaceData, "todos"> };
