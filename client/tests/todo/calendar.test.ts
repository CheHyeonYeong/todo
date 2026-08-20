import { describe, expect, test } from "vitest";
import {
  addDays,
  dateKey,
  dayKeyOf,
  defaultDueDate,
  endOfMonth,
  startOfWeek,
} from "../../src/todo/model/calendar";

/** 로컬 시간으로 만든다. 날짜 함수가 getFullYear 등 로컬 API만 쓰므로 타임존과 무관하다. */
const at = (year: number, month1: number, day: number, hour = 12) => new Date(year, month1 - 1, day, hour);

describe("dateKey", () => {
  test("0을 채워 YYYY-MM-DD로 만든다", () => {
    expect(dateKey(at(2026, 8, 3))).toBe("2026-08-03");
    expect(dateKey(at(2026, 12, 31))).toBe("2026-12-31");
  });

  test("같은 날이면 시각이 달라도 같은 키다", () => {
    expect(dateKey(at(2026, 8, 18, 0))).toBe(dateKey(at(2026, 8, 18, 23)));
  });
});

describe("dayKeyOf", () => {
  test("연·월(0-based)·일로 키를 만든다", () => {
    expect(dayKeyOf(2026, 7, 18)).toBe("2026-08-18");
  });

  test("달의 범위를 넘는 날은 다음 달로 넘어간다", () => {
    expect(dayKeyOf(2026, 7, 32)).toBe("2026-09-01");
  });
});

describe("startOfWeek", () => {
  test("주는 일요일 0시에 시작한다", () => {
    // 2026-08-18은 화요일 → 직전 일요일은 8/16
    const start = startOfWeek(at(2026, 8, 18));
    expect(dateKey(start)).toBe("2026-08-16");
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  test("일요일 당일은 그대로 주의 시작이다", () => {
    expect(dateKey(startOfWeek(at(2026, 8, 16)))).toBe("2026-08-16");
  });

  test("주가 달을 걸치면 이전 달로 넘어간다", () => {
    expect(dateKey(startOfWeek(at(2026, 9, 1)))).toBe("2026-08-30");
  });

  test("인자를 바꾸지 않는다", () => {
    const input = at(2026, 8, 18);
    startOfWeek(input);
    expect(dateKey(input)).toBe("2026-08-18");
  });
});

describe("addDays", () => {
  test("월과 해를 넘어간다", () => {
    expect(dateKey(addDays(at(2026, 8, 31), 1))).toBe("2026-09-01");
    expect(dateKey(addDays(at(2026, 12, 31), 1))).toBe("2027-01-01");
    expect(dateKey(addDays(at(2027, 1, 1), -1))).toBe("2026-12-31");
  });

  test("윤년 2월을 정확히 지난다", () => {
    expect(dateKey(addDays(at(2024, 2, 28), 1))).toBe("2024-02-29");
    expect(dateKey(addDays(at(2025, 2, 28), 1))).toBe("2025-03-01");
  });
});

describe("endOfMonth", () => {
  test("달의 마지막 날을 준다", () => {
    expect(dateKey(endOfMonth(at(2026, 8, 18)))).toBe("2026-08-31");
    expect(dateKey(endOfMonth(at(2026, 9, 1)))).toBe("2026-09-30");
  });

  test("2월은 윤년 여부를 따른다", () => {
    expect(dateKey(endOfMonth(at(2024, 2, 10)))).toBe("2024-02-29");
    expect(dateKey(endOfMonth(at(2025, 2, 10)))).toBe("2025-02-28");
  });
});

describe("defaultDueDate", () => {
  test("day는 오늘", () => {
    expect(defaultDueDate("day", at(2026, 8, 18))).toBe("2026-08-18");
  });

  test("week은 돌아오는 일요일", () => {
    // 화요일 → 같은 주 일요일(8/23)
    expect(defaultDueDate("week", at(2026, 8, 18))).toBe("2026-08-23");
  });

  test("일요일에는 week도 오늘이다", () => {
    expect(defaultDueDate("week", at(2026, 8, 23))).toBe("2026-08-23");
  });

  test("month는 말일", () => {
    expect(defaultDueDate("month", at(2026, 8, 18))).toBe("2026-08-31");
    expect(defaultDueDate("month", at(2024, 2, 10))).toBe("2024-02-29");
  });
});
