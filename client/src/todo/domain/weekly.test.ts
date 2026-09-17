import { describe, expect, test } from "vitest";
import type { WorkSession } from "../../types";
import { dateKey } from "./calendar";
import {
  calendarWeekDays,
  overlapDurationMs,
  positionOverlappingSegments,
  sessionSegmentsForWeek,
  startOfMondayWeek,
  totalOverlapDurationMs,
} from "./weekly";

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 7, day, hour, minute);
const session = (id: string, start: Date, end: Date): WorkSession => ({
  id,
  label: id,
  startedAt: start.toISOString(),
  endedAt: end.toISOString(),
});

describe("weekly calendar dates", () => {
  test("월요일부터 일요일까지 만든다", () => {
    expect(dateKey(startOfMondayWeek(at(19)))).toBe("2026-08-17");
    expect(calendarWeekDays(at(19)).map(dateKey)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });
});

describe("weekly session projection", () => {
  test("선택 날짜와 실제로 겹친 시간만 합산한다", () => {
    const crossing = session("night", at(18, 23), at(19, 2));
    expect(overlapDurationMs(crossing, at(18))).toBe(60 * 60_000);
    expect(overlapDurationMs(crossing, at(19))).toBe(2 * 60 * 60_000);
    expect(totalOverlapDurationMs([crossing], at(19))).toBe(2 * 60 * 60_000);
  });

  test("자정을 넘는 기록을 양쪽 날짜 열로 나눈다", () => {
    const parts = sessionSegmentsForWeek([session("night", at(18, 23), at(19, 2))], at(19));
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => [part.dayIndex, part.startMinute, part.endMinute])).toEqual([
      [1, 1380, 1440],
      [2, 0, 120],
    ]);
  });

  test("겹치는 기록에는 서로 다른 레인을 배정한다", () => {
    const parts = sessionSegmentsForWeek(
      [session("one", at(18, 9), at(18, 11)), session("two", at(18, 10), at(18, 12))],
      at(18),
    );
    const positioned = positionOverlappingSegments(parts);
    expect(positioned.map((part) => [part.lane, part.laneCount])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });
});
