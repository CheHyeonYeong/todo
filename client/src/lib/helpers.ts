import type { Scope, Session } from "./types";

export const scopeLabels: Record<Scope, string> = {
  day: "오늘",
  week: "이번 주",
  month: "이번 달",
};

export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(
    new Date(value),
  );
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatWeekdayShort(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date);
}

export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "1분 미만";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function minutesToLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey() {
  return dateKey(new Date());
}

export function daysFromToday(key: string) {
  const target = new Date(`${key}T00:00:00`).getTime();
  const today = new Date(`${todayKey()}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
}

export function shiftDateKey(key: string, delta: number) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return dateKey(date);
}

export function weekStartKey(key: string) {
  const date = new Date(`${key}T00:00:00`);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return dateKey(date);
}

export function weekEndKey(key: string) {
  return shiftDateKey(weekStartKey(key), 6);
}

export function monthEndKey(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/** 스코프별 기본 마감일. 오늘 / 이번 주 일요일 / 이번 달 말일 — 캘린더 기준. */
export function defaultDueForScope(scope: Scope) {
  const today = todayKey();
  if (scope === "week") return weekEndKey(today);
  if (scope === "month") return monthEndKey(today);
  return today;
}

export function shortDate(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function extractTags(text: string) {
  return Array.from(text.matchAll(/#([\p{L}\p{N}_-]+)/gu)).map((match) => match[1]);
}

export function extractTodos(text: string) {
  return text
    .split("\n")
    .map((line) => line.match(/^\s*(?:-\s*\[\s?\]|todo:)\s*(.+)$/i)?.[1]?.trim())
    .filter(Boolean) as string[];
}

export function labelHue(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + (char.codePointAt(0) || 0)) % 360;
  return hash;
}

export function sessionDurationMs(session: Session) {
  return new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
}

export function sessionMinutesOnDay(session: Session, key: string) {
  const dayStart = new Date(`${key}T00:00:00`).getTime();
  const startMin = Math.max(0, (new Date(session.startedAt).getTime() - dayStart) / 60000);
  const endMin = Math.min(1440, (new Date(session.endedAt).getTime() - dayStart) / 60000);
  return { startMin, endMin: Math.max(endMin, startMin + 1) };
}
