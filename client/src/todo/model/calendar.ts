/* 날짜 계산. 전부 로컬 시간 기준이고, "지금"은 인자로 받는다.
   화면 코드가 new Date()를 직접 부르면 자정 경계를 테스트할 수 없다. */
import type { Scope } from "./types";

/** 저장소와 API가 쓰는 날짜 키 형식: YYYY-MM-DD (로컬 시간 기준) */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 해당 연·월(0-based)의 며칠을 날짜 키로. 달력 격자가 쓴다. */
export function dayKeyOf(year: number, month: number, day: number): string {
  return dateKey(new Date(year, month, day));
}

/** 그 주의 일요일 0시. 주간 플래너가 한 주의 시작으로 쓴다. */
export function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** 그 달의 마지막 날. 0일은 전달의 말일이 된다. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** 스코프별 기본 마감일. 오늘 / 돌아오는 일요일 / 이번 달 말일. */
export function defaultDueDate(scope: Scope, today: Date): string {
  if (scope === "month") return dateKey(endOfMonth(today));
  if (scope === "week") return dateKey(addDays(today, (7 - today.getDay()) % 7));
  return dateKey(today);
}
