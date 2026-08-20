import type { useWorkspace } from "../../workspace/useWorkspace";

export function useTimeTracking(workspace: ReturnType<typeof useWorkspace>) {
  return {
    data: { sessions: workspace.data.sessions },
    activeSession: workspace.activeSession,
    startSession: workspace.startSession,
    stopSession: workspace.stopSession,
    recordSession: workspace.recordSession,
    deleteSession: workspace.deleteSession,
  };
}
