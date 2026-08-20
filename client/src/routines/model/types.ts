import type { RoutineDto } from "../api/routineDto";

export interface Routine {
  id: string;
  title: string;
  weekdays: number[];
  category?: string | null;
  active: boolean;
}

export function toRoutine(dto: RoutineDto): Routine {
  return {
    id: dto.id,
    title: dto.title,
    weekdays: [...dto.weekdays],
    category: dto.category,
    active: dto.active,
  };
}
