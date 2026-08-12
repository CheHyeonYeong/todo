import { optionalText } from "../../../shared/kernel/primitives.js";
import { WeekdaySet } from "./weekday-set.js";

/** 엔티티: 반복 규칙. "오늘 이 루틴이 도는가"를 스스로 판단한다. */
export class Routine {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.weekdays = WeekdaySet.normalize(value.weekdays);
    this.category = optionalText(value.category);
    this.active = value.active === undefined ? true : Boolean(value.active);
    this.createdAt = value.createdAt || now().toISOString();
  }

  occursOn(weekday) { return this.active && this.weekdays.includes(weekday); }
  get isComplete() { return Boolean(this.id && this.title); }

  toJSON() { return { ...this }; }
  static from(value, now) { return new Routine(value, now); }
}
