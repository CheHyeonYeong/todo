import type { WorkspaceData } from "../../workspace/model/types";
import type { MemoActions } from "../hooks/useMemoActions";

export type MemoStore = MemoActions & { data: Pick<WorkspaceData, "memos"> };
