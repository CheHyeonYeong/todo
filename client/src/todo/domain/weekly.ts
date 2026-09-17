import type { WorkSession } from "../../types";
import { addDays, dateKey } from "./calendar";
import { isMomentNote } from "../../time/domain/session";

export const HOUR_HEIGHT = 57.5;

export type SessionSegment = {
  session: WorkSession;
  dayIndex: number;
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
};

export type PositionedSessionSegment = SessionSegment & { lane: number; laneCount: number };

/** 월요일 0시. 주간 캘린더 전용이며 기존 일요일 시작 플래너 규칙은 바꾸지 않는다. */
export function startOfMondayWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

export function calendarWeekDays(cursor: Date): Date[] {
  const start = startOfMondayWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return { start, end: addDays(start, 1) };
}

export function overlapDurationMs(session: WorkSession, date: Date): number {
  const { start, end } = dayBounds(date);
  const overlapStart = Math.max(new Date(session.startedAt).getTime(), start.getTime());
  const overlapEnd = Math.min(new Date(session.endedAt).getTime(), end.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

export function totalOverlapDurationMs(sessions: WorkSession[], date: Date): number {
  return sessions
    .filter((session) => !isMomentNote(session))
    .reduce((total, session) => total + overlapDurationMs(session, date), 0);
}

/** 자정을 넘는 기록을 날짜별 조각으로 나눠 각 열에 정확히 배치한다. */
export function sessionSegmentsForWeek(sessions: WorkSession[], weekStart: Date): SessionSegment[] {
  const days = calendarWeekDays(weekStart);
  return sessions.flatMap((session) => {
    if (isMomentNote(session)) return [];
    const beganMs = new Date(session.startedAt).getTime();
    const endedMs = new Date(session.endedAt).getTime();
    if (!Number.isFinite(beganMs) || !Number.isFinite(endedMs) || endedMs <= beganMs) return [];
    return days.flatMap((day, dayIndex) => {
      const { start, end } = dayBounds(day);
      const segmentStart = Math.max(beganMs, start.getTime());
      const segmentEnd = Math.min(endedMs, end.getTime());
      if (segmentEnd <= segmentStart) return [];
      const startMinute = (segmentStart - start.getTime()) / 60_000;
      const endMinute = (segmentEnd - start.getTime()) / 60_000;
      return [
        {
          session,
          dayIndex,
          startMinute,
          endMinute,
          top: (startMinute / 60) * HOUR_HEIGHT,
          height: Math.max(24, ((endMinute - startMinute) / 60) * HOUR_HEIGHT),
        },
      ];
    });
  });
}

/** 겹치는 기록을 같은 날짜 열 안의 나란한 레인으로 배치한다. */
export function positionOverlappingSegments(segments: SessionSegment[]): PositionedSessionSegment[] {
  return Array.from({ length: 7 }, (_, dayIndex) =>
    segments
      .filter((segment) => segment.dayIndex === dayIndex)
      .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute),
  ).flatMap((daySegments) => {
    const positioned: PositionedSessionSegment[] = [];
    let group: Array<SessionSegment & { lane: number }> = [];
    let groupEnd = -1;
    const commitGroup = () => {
      const laneCount = Math.max(1, ...group.map((item) => item.lane + 1));
      positioned.push(...group.map((item) => ({ ...item, laneCount })));
      group = [];
      groupEnd = -1;
    };
    for (const segment of daySegments) {
      if (group.length && segment.startMinute >= groupEnd) commitGroup();
      const laneEnds = group.reduce<number[]>((ends, item) => {
        ends[item.lane] = Math.max(ends[item.lane] ?? 0, item.endMinute);
        return ends;
      }, []);
      const reusableLane = laneEnds.findIndex((end) => end <= segment.startMinute);
      const lane = reusableLane >= 0 ? reusableLane : laneEnds.length;
      group.push({ ...segment, lane });
      groupEnd = Math.max(groupEnd, segment.endMinute);
    }
    if (group.length) commitGroup();
    return positioned;
  });
}

export function sessionsOnDate(sessions: WorkSession[], date: Date): WorkSession[] {
  const key = dateKey(date);
  return sessions.filter((session) => dateKey(new Date(session.startedAt)) === key);
}
