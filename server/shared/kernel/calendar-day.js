const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * 값 객체(Value Object): 사용자 시간대 기준의 "하루".
 * 식별자가 없고 불변이며, 같은 날짜면 같은 값으로 취급한다.
 */
export class CalendarDay {
  constructor(key, weekday) {
    this.key = key;
    this.weekday = weekday;
    Object.freeze(this);
  }

  static fromDate(date, timeZone) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
    return new CalendarDay(key, WEEKDAY_NAMES.indexOf(weekdayName));
  }

  get monthKey() { return this.key.slice(0, 7); }
  get month() { return Number(this.key.slice(5, 7)); }
  equals(other) { return other instanceof CalendarDay && other.key === this.key; }
  toString() { return this.key; }
}
