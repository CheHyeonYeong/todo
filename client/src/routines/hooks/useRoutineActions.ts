import { request } from "../../shared/api/request";
import { uid } from "../../shared/id/uid";
import type { SetWorkspaceData } from "../../workspace/hooks/useWorkspaceData";
import type { RoutineDto } from "../api/routineDto";
import { toRoutine, type Routine } from "../model/types";

export function useRoutineActions(setData: SetWorkspaceData, reload: () => Promise<void>) {
  const addRoutine = async (title: string, weekdays: number[], category?: string) => {
    const routine: RoutineDto = {
      id: uid(),
      title: title.trim(),
      weekdays,
      category: category?.trim() || null,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, routines: [...current.routines, toRoutine(routine)] }));
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

  return { addRoutine, patchRoutine, deleteRoutine };
}
