import { CalendarDay } from "./calendar-day.js";

/** 모든 컨텍스트가 공유하는 시간 개념. 도메인이 시스템 시계를 직접 읽지 않게 한다. */
export class AppClock {
  constructor({ timeZone, now = () => new Date() } = {}) {
    this.timeZone = timeZone;
    this.now = now;
  }

  today() { return CalendarDay.fromDate(this.now(), this.timeZone); }

  formatDate(value) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: this.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  }
}
