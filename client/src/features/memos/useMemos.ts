import type { useWorkspace } from "../../workspace/useWorkspace";

export function useMemos(workspace: ReturnType<typeof useWorkspace>) {
  return {
    data: { memos: workspace.data.memos },
    addMemo: workspace.addMemo,
    patchMemo: workspace.patchMemo,
    deleteMemo: workspace.deleteMemo,
  };
}
