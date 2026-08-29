import type { Dispatch, SetStateAction } from "react";
import type { AppData, Routine } from "../../types";

type SetWorkspaceData = Dispatch<SetStateAction<AppData>>;
type ReloadWorkspace = () => Promise<void>;
type WorkspaceRequest = (path: string, init?: RequestInit) => Promise<Response>;
type CreateId = () => string;

export type RoutineActions = {
  routines: Routine[];
  addRoutine: (title: string, weekdays: number[], category?: string) => Promise<void>;
  patchRoutine: (id: string, patch: Partial<Routine>) => Promise<void>;
  deleteRoutine: (id: string) => Promise<void>;
};

export function useRoutineActions({
  routines,
  setData,
  reload,
  request,
  createId,
}: {
  routines: Routine[];
  setData: SetWorkspaceData;
  reload: ReloadWorkspace;
  request: WorkspaceRequest;
  createId: CreateId;
}): RoutineActions {
  const addRoutine = async (title: string, weekdays: number[], category?: string) => {
    const routine: Routine = {
      id: createId(),
      title: title.trim(),
      weekdays,
      category: category?.trim() || null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, routines: [...current.routines, routine] }));
    try {
      await request("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routine),
      });
      await reload();
    } catch (reason) {
      await reload();
      throw reason;
    }
  };

  const patchRoutine = async (id: string, patch: Partial<Routine>) => {
    await request(`/api/routines/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reload();
  };

  const deleteRoutine = async (id: string) => {
    await request(`/api/routines/${encodeURIComponent(id)}`, { method: "DELETE" });
    await reload();
  };

  return {
    routines,
    addRoutine,
    patchRoutine,
    deleteRoutine,
  };
}
