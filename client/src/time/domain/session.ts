/* 시간 기록의 규칙. "순간 메모"는 측정 없이 남기는 한 줄짜리 기록인데,
   별도 저장소가 없어 세션 label에 접두사를 붙여 구분한다. 그 사실을 여기 한 곳에만 둔다. */
import { addDays, startOfWeek } from "../../todo/domain/calendar";
import type { WorkSession } from "../../types";

const MOMENT_NOTE_PREFIX = "__moment_note__:";
const MIN_FOCUS_RECORD_MS = 60_000;

/** 순간 메모는 시간표 격자에 그리지 않고 목록으로만 보여준다. */
export function isMomentNote(session: WorkSession): boolean {
  return session.label.startsWith(MOMENT_NOTE_PREFIX);
}

export function momentNoteLabel(text: string): string {
  return `${MOMENT_NOTE_PREFIX}${text}`;
}

/** 화면에 보여줄 본문. 접두사가 없으면 label을 그대로 돌려준다. */
export function momentNoteText(session: WorkSession): string {
  return session.label.replace(MOMENT_NOTE_PREFIX, "");
}

export function elapsedMinutesSince(startedAt: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(startedAt).getTime()) / 60000);
}

export function shouldRecordFocusSession(
  startedAtMs: number | null,
  endedAtMs: number,
): startedAtMs is number {
  return Boolean(startedAtMs && endedAtMs - startedAtMs >= MIN_FOCUS_RECORD_MS);
}

export function sessionStartedAtText(session: WorkSession): string {
  return new Date(session.startedAt).toLocaleString();
}

/** 음수가 나오지 않게 막는다. 종료가 시작보다 앞선 기록이 들어와도 합계가 깨지지 않도록. */
export function sessionDurationMs(session: WorkSession): number {
  return Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime());
}

export function totalDurationMs(sessions: WorkSession[]): number {
  return sessions.reduce((sum, session) => sum + sessionDurationMs(session), 0);
}

/** 시작 시각이 [from, to) 안에 드는 기록. */
export function sessionsStartedBetween(sessions: WorkSession[], from: Date, to: Date): WorkSession[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return sessions.filter((session) => {
    const startedMs = new Date(session.startedAt).getTime();
    return startedMs >= fromMs && startedMs < toMs;
  });
}

export function plannerWeekDays(today: Date, weekOffset: number): Date[] {
  const start = addDays(startOfWeek(today), weekOffset * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function sessionsStartedInPlannerWeek(sessions: WorkSession[], days: Date[]): WorkSession[] {
  return sessionsStartedBetween(sessions, days[0], addDays(days[6], 1));
}

/** 그 날 그 시각대에 걸쳐 있는 기록. 시(hour) 단위 격자 한 칸에 해당한다. */
export function sessionsCoveringHour(sessions: WorkSession[], date: Date, hour: number): WorkSession[] {
  return sessions.filter((session) => {
    const began = new Date(session.startedAt);
    const ended = new Date(session.endedAt);
    return (
      began.toDateString() === date.toDateString() && began.getHours() <= hour && ended.getHours() >= hour
    );
  });
}
