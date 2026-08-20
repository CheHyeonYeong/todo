import type { RoutineDto } from "../api/routineDto";

export type Routine = RoutineDto;

export function toRoutine(dto: RoutineDto): Routine {
  return { ...dto };
}
