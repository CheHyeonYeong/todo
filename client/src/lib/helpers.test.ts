/* helpers.ts의 현재 동작을 고정한다. 이후 리팩토링 PR에서 "동작이 안 바뀌었다"를 증명하는 기준선.
   Intl 포매터(formatDate/formatTime/formatWeekdayShort)는 런타임 ICU에 따라 출력이 달라질 수 있어
   여기서 다루지 않는다. 날짜 계산 함수는 전부 로컬 시간 기준이라 타임존과 무관하게 통과한다. */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  dateKey,
  daysFromToday,
  defaultDueForScope,
  extractTags,
  extractTodos,
  formatDuration,
  labelHue,
  minutesToLabel,
  monthEndKey,
  sessionDurationMs,
  sessionMinutesOnDay,
  shiftDateKey,
  shortDate,
  todayKey,
  weekEndKey,
  weekStartKey,
} from "./helpers";

/** 로컬 시간으로 "지금"을 고정한다. 날짜 함수가 getFullYear 등 로컬 API를 쓰므로 타임존 영향이 없다. */
function freezeAt(year: number, month1: number, day: number, hour = 10) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, month1 - 1, day, hour, 0, 0));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dateKey", () => {
  test("YYYY-MM-DD로 0을 채워 만든다", () => {
    expect(dateKey(new Date(2026, 7, 3))).toBe("2026-08-03");
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  test("시각과 무관하게 같은 날이면 같은 키다", () => {
    expect(dateKey(new Date(2026, 7, 18, 0, 0))).toBe(dateKey(new Date(2026, 7, 18, 23, 59)));
  });
});

describe("todayKey", () => {
  test("고정한 현재 시각의 날짜를 돌려준다", () => {
    freezeAt(2026, 8, 18);
    expect(todayKey()).toBe("2026-08-18");
  });

  test("자정 직전과 직후가 다른 날로 갈린다", () => {
    freezeAt(2026, 8, 18, 23);
    expect(todayKey()).toBe("2026-08-18");
    vi.setSystemTime(new Date(2026, 7, 19, 0, 1));
    expect(todayKey()).toBe("2026-08-19");
  });
});

describe("shiftDateKey", () => {
  test("일수를 더하고 뺀다", () => {
    expect(shiftDateKey("2026-08-18", 1)).toBe("2026-08-19");
    expect(shiftDateKey("2026-08-18", -1)).toBe("2026-08-17");
    expect(shiftDateKey("2026-08-18", 0)).toBe("2026-08-18");
  });

  test("월과 해를 넘어간다", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  test("윤년 2월을 정확히 지난다", () => {
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDateKey("2025-02-28", 1)).toBe("2025-03-01");
  });
});

describe("weekStartKey / weekEndKey", () => {
  test("주는 월요일에 시작해 일요일에 끝난다", () => {
    // 2026-08-17(월) ~ 2026-08-23(일)
    expect(weekStartKey("2026-08-18")).toBe("2026-08-17");
    expect(weekEndKey("2026-08-18")).toBe("2026-08-23");
  });

  test("월요일 당일은 그대로 주의 시작이다", () => {
    expect(weekStartKey("2026-08-17")).toBe("2026-08-17");
  });

  test("일요일은 앞선 월요일이 시작인 주에 속한다", () => {
    expect(weekStartKey("2026-08-23")).toBe("2026-08-17");
    expect(weekEndKey("2026-08-23")).toBe("2026-08-23");
  });

  test("주가 월을 걸치면 이전 달로 넘어간다", () => {
    expect(weekStartKey("2026-09-01")).toBe("2026-08-31");
  });
});

describe("monthEndKey", () => {
  test("달의 마지막 날을 돌려준다", () => {
    expect(monthEndKey("2026-08-18")).toBe("2026-08-31");
    expect(monthEndKey("2026-09-01")).toBe("2026-09-30");
  });

  test("2월은 윤년 여부를 따른다", () => {
    expect(monthEndKey("2024-02-10")).toBe("2024-02-29");
    expect(monthEndKey("2025-02-10")).toBe("2025-02-28");
  });
});

describe("daysFromToday", () => {
  test("오늘은 0, 이후는 양수, 이전은 음수다", () => {
    freezeAt(2026, 8, 18);
    expect(daysFromToday("2026-08-18")).toBe(0);
    expect(daysFromToday("2026-08-19")).toBe(1);
    expect(daysFromToday("2026-08-25")).toBe(7);
    expect(daysFromToday("2026-08-17")).toBe(-1);
  });

  test("서머타임 전환이 있는 구간에서도 일수가 반올림된다", () => {
    freezeAt(2026, 3, 1);
    expect(daysFromToday("2026-04-01")).toBe(31);
  });
});

describe("defaultDueForScope", () => {
  test("day는 오늘, week는 그 주 일요일, month는 말일이다", () => {
    freezeAt(2026, 8, 18);
    expect(defaultDueForScope("day")).toBe("2026-08-18");
    expect(defaultDueForScope("week")).toBe("2026-08-23");
    expect(defaultDueForScope("month")).toBe("2026-08-31");
  });

  test("week 기본값은 항상 일요일이다", () => {
    freezeAt(2026, 8, 23); // 일요일 당일
    expect(defaultDueForScope("week")).toBe("2026-08-23");
  });
});

describe("shortDate", () => {
  test("앞자리 0 없이 M월 D일로 만든다", () => {
    expect(shortDate("2026-08-03")).toBe("8월 3일");
    expect(shortDate("2026-12-31")).toBe("12월 31일");
  });
});

describe("formatDuration", () => {
  test("30초 미만은 1분 미만으로 묶는다", () => {
    expect(formatDuration(0)).toBe("1분 미만");
    expect(formatDuration(29_000)).toBe("1분 미만");
  });

  test("분 단위로 반올림한다", () => {
    expect(formatDuration(30_000)).toBe("1분");
    expect(formatDuration(90_000)).toBe("2분");
  });

  test("한 시간이 넘으면 시간과 분으로 나눈다", () => {
    expect(formatDuration(3_600_000)).toBe("1시간");
    expect(formatDuration(5_400_000)).toBe("1시간 30분");
    expect(formatDuration(7_260_000)).toBe("2시간 1분");
  });
});

describe("minutesToLabel", () => {
  test("MM:SS로 0을 채운다", () => {
    expect(minutesToLabel(0)).toBe("00:00");
    expect(minutesToLabel(65)).toBe("01:05");
    expect(minutesToLabel(1_500)).toBe("25:00");
  });

  test("한 시간이 넘어도 분으로만 표기한다 (시 단위로 넘기지 않음)", () => {
    expect(minutesToLabel(3_661)).toBe("61:01");
  });
});

describe("extractTags", () => {
  test("# 뒤의 태그를 순서대로 모은다", () => {
    expect(extractTags("#작업 정리하고 #회고 쓰기")).toEqual(["작업", "회고"]);
  });

  test("영문·숫자·밑줄·하이픈을 포함한다", () => {
    expect(extractTags("#todo-list #v2 #snake_case")).toEqual(["todo-list", "v2", "snake_case"]);
  });

  test("태그가 없으면 빈 배열이다", () => {
    expect(extractTags("그냥 메모")).toEqual([]);
    expect(extractTags("# 뒤에 공백이면 태그가 아니다")).toEqual([]);
  });

  test("중복은 그대로 남는다", () => {
    expect(extractTags("#a #a")).toEqual(["a", "a"]);
  });
});

describe("extractTodos", () => {
  test("체크박스 줄을 할 일로 뽑는다", () => {
    expect(extractTodos("- [ ] 우유 사기\n- [] 청소")).toEqual(["우유 사기", "청소"]);
  });

  test("todo: 접두사도 인식하고 대소문자를 가리지 않는다", () => {
    expect(extractTodos("todo: 메일 보내기\nTODO: 예약 확인")).toEqual(["메일 보내기", "예약 확인"]);
  });

  test("앞쪽 공백을 허용한다", () => {
    expect(extractTodos("   - [ ] 들여쓴 항목")).toEqual(["들여쓴 항목"]);
  });

  test("완료 표시된 줄과 일반 문장은 무시한다", () => {
    expect(extractTodos("- [x] 이미 한 일\n그냥 문장\n- 목록이지만 체크박스 아님")).toEqual([]);
  });
});

describe("labelHue", () => {
  test("같은 라벨은 항상 같은 색을 준다", () => {
    expect(labelHue("업무")).toBe(labelHue("업무"));
  });

  test("팔레트 안의 값만 나온다", () => {
    const palette = [4, 32, 52, 92, 148, 188, 216, 252, 286, 326];
    for (const label of ["업무", "공부", "운동", "", "a", "긴 라벨 이름"]) {
      expect(palette).toContain(labelHue(label));
    }
  });
});

describe("sessionDurationMs", () => {
  test("종료와 시작의 차이를 밀리초로 준다", () => {
    const session = {
      id: "s1",
      label: "집중",
      startedAt: new Date(2026, 7, 18, 9, 0).toISOString(),
      endedAt: new Date(2026, 7, 18, 10, 30).toISOString(),
    };
    expect(sessionDurationMs(session)).toBe(90 * 60_000);
  });
});

describe("sessionMinutesOnDay", () => {
  const session = (startedAt: Date, endedAt: Date) => ({
    id: "s1",
    label: "집중",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  });

  test("자정 기준 분 오프셋으로 바꾼다", () => {
    const result = sessionMinutesOnDay(
      session(new Date(2026, 7, 18, 9, 0), new Date(2026, 7, 18, 10, 30)),
      "2026-08-18",
    );
    expect(result).toEqual({ startMin: 540, endMin: 630 });
  });

  test("전날 시작한 세션은 0분으로 잘린다", () => {
    const result = sessionMinutesOnDay(
      session(new Date(2026, 7, 17, 23, 0), new Date(2026, 7, 18, 1, 0)),
      "2026-08-18",
    );
    expect(result.startMin).toBe(0);
    expect(result.endMin).toBe(60);
  });

  test("다음 날까지 이어지면 1440분으로 잘린다", () => {
    const result = sessionMinutesOnDay(
      session(new Date(2026, 7, 18, 23, 0), new Date(2026, 7, 19, 1, 0)),
      "2026-08-18",
    );
    expect(result).toEqual({ startMin: 1380, endMin: 1440 });
  });

  test("길이가 0이어도 최소 1분은 차지한다 (막대가 사라지지 않도록)", () => {
    const at = new Date(2026, 7, 18, 9, 0);
    expect(sessionMinutesOnDay(session(at, at), "2026-08-18")).toEqual({ startMin: 540, endMin: 541 });
  });
});
