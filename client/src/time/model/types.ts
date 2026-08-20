import type { SessionDto } from "../api/sessionDto";

export interface WorkSession {
  id: string;
  label: string;
  startedAt: string;
  endedAt: string;
}

export type ActiveSession = Omit<WorkSession, "endedAt">;

export function toWorkSession(dto: SessionDto): WorkSession {
  return { id: dto.id, label: dto.label, startedAt: dto.startedAt, endedAt: dto.endedAt };
}
