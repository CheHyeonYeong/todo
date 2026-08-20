import type { Routine } from "./types";

export interface RoutineStore {
  data: { routines: Routine[] };
  addRoutine(title: string, weekdays: number[], category?: string): Promise<void>;
  patchRoutine(id: string, patch: Partial<Routine>): Promise<void>;
  deleteRoutine(id: string): Promise<void>;
}
