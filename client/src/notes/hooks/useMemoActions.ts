import type { useAppData } from "../../useAppData";

type WorkspaceStore = ReturnType<typeof useAppData>;

export type MemoActions = {
  memos: WorkspaceStore["data"]["memos"];
  addMemo: WorkspaceStore["addMemo"];
  patchMemo: WorkspaceStore["patchMemo"];
  deleteMemo: WorkspaceStore["deleteMemo"];
};

export function useMemoActions(store: WorkspaceStore): MemoActions {
  return {
    memos: store.data.memos,
    addMemo: store.addMemo,
    patchMemo: store.patchMemo,
    deleteMemo: store.deleteMemo,
  };
}
