import type { Scope } from "../../types";

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayKeyOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function defaultDueDate(scope: Scope, now: Date) {
  const date = new Date(now);
  if (scope === "week")
    date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  if (scope === "month")
    return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return dateKey(date);
}
