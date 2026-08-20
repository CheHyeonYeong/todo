export interface RoutineDto {
  id: string;
  title: string;
  weekdays: number[];
  category?: string | null;
  active: boolean;
  createdAt: string;
}
