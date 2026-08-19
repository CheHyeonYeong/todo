import { describe, expect, test } from "vitest";
import type { WorkSession } from "../types";
import {
  isMomentNote,
  momentNoteLabel,
  momentNoteText,
  sessionDurationMs,
  sessionsCoveringHour,
  sessionsStartedBetween,
  totalDurationMs,
} from "./session";

const session = (label: string, startedAt: Date, endedAt: Date): WorkSession => ({
  id: `${startedAt.getTime()}`,
  label,
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
});

const at = (year: number, month1: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month1 - 1, day, hour, minute);

describe("순간 메모", () => {
  test("접두사가 붙은 기록만 순간 메모다", () => {
    expect(isMomentNote(session(momentNoteLabel("장보기"), at(2026, 8, 18), at(2026, 8, 18)))).toBe(true);
    expect(isMomentNote(session("집중", at(2026, 8, 18), at(2026, 8, 18)))).toBe(false);
  });

  test("본문을 감쌌다가 그대로 되꺼낸다", () => {
    const text = "우유 사기";
    const note = session(momentNoteLabel(text), at(2026, 8, 18), at(2026, 8, 18));
    expect(momentNoteText(note)).toBe(text);
  });

  test("접두사가 없으면 label을 그대로 준다", () => {
    expect(momentNoteText(session("집중", at(2026, 8, 18), at(2026, 8, 18)))).toBe("집중");
  });

  test("빈 본문도 감쌀 수 있다", () => {
    expect(isMomentNote(session(momentNoteLabel(""), at(2026, 8, 18), at(2026, 8, 18)))).toBe(true);
  });
});

describe("sessionDurationMs", () => {
  test("종료와 시작의 차이를 준다", () => {
    expect(sessionDurationMs(session("집중", at(2026, 8, 18, 9), at(2026, 8, 18, 10, 30)))).toBe(90 * 60_000);
  });

  test("종료가 시작보다 앞서면 0으로 막는다", () => {
    expect(sessionDurationMs(session("집중", at(2026, 8, 18, 10), at(2026, 8, 18, 9)))).toBe(0);
  });
});

describe("totalDurationMs", () => {
  test("합계를 낸다", () => {
    const sessions = [
      session("집중", at(2026, 8, 18, 9), at(2026, 8, 18, 10)),
      session("집중", at(2026, 8, 18, 13), at(2026, 8, 18, 13, 30)),
    ];
    expect(totalDurationMs(sessions)).toBe(90 * 60_000);
  });

  test("빈 목록은 0이다", () => {
    expect(totalDurationMs([])).toBe(0);
  });
});

describe("sessionsStartedBetween", () => {
  const sessions = [
    session("월요일", at(2026, 8, 17, 9), at(2026, 8, 17, 10)),
    session("일요일", at(2026, 8, 23, 9), at(2026, 8, 23, 10)),
    session("다음 월요일", at(2026, 8, 24, 9), at(2026, 8, 24, 10)),
  ];

  test("시작이 구간 안에 드는 것만 고른다", () => {
    const found = sessionsStartedBetween(sessions, at(2026, 8, 17), at(2026, 8, 24));
    expect(found.map((item) => item.label)).toEqual(["월요일", "일요일"]);
  });

  test("시작 경계는 포함하고 끝 경계는 제외한다", () => {
    const start = at(2026, 8, 17, 9);
    const inclusive = sessionsStartedBetween(sessions, start, at(2026, 8, 17, 9, 1));
    expect(inclusive).toHaveLength(1);
    expect(sessionsStartedBetween(sessions, start, start)).toHaveLength(0);
  });
});

describe("sessionsCoveringHour", () => {
  const day = at(2026, 8, 18);
  const sessions = [
    session("오전", at(2026, 8, 18, 9), at(2026, 8, 18, 11)),
    session("오후", at(2026, 8, 18, 14), at(2026, 8, 18, 15)),
    session("다른 날", at(2026, 8, 19, 9), at(2026, 8, 19, 11)),
  ];

  test("그 시각을 지나는 기록을 고른다", () => {
    expect(sessionsCoveringHour(sessions, day, 10).map((item) => item.label)).toEqual(["오전"]);
  });

  test("시작·종료 시각대도 포함한다", () => {
    expect(sessionsCoveringHour(sessions, day, 9)).toHaveLength(1);
    expect(sessionsCoveringHour(sessions, day, 11)).toHaveLength(1);
  });

  test("걸치지 않는 시각대는 비어 있다", () => {
    expect(sessionsCoveringHour(sessions, day, 12)).toHaveLength(0);
  });

  test("다른 날의 기록은 섞이지 않는다", () => {
    expect(sessionsCoveringHour(sessions, day, 10).every((item) => item.label !== "다른 날")).toBe(true);
  });
});
