import type { SessionDto } from "../api/sessionDto";

export type WorkSession = SessionDto;
export type ActiveSession = Omit<SessionDto, "endedAt">;

export function toWorkSession(dto: SessionDto): WorkSession {
  return { ...dto };
}
