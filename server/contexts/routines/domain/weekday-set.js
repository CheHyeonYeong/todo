/** 값 객체: 루틴이 반복되는 요일 집합(0=일 ~ 6=토). 중복은 없고 항상 정렬돼 있다. */
export class WeekdaySet {
  constructor(value) {
    this.days = Array.isArray(value)
      ? [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
      : [];
    Object.freeze(this.days);
    Object.freeze(this);
  }

  static from(value) { return new WeekdaySet(value); }
  static normalize(value) { return new WeekdaySet(value).days; }

  includes(weekday) { return this.days.includes(weekday); }
  get isEmpty() { return this.days.length === 0; }
  equals(other) { return other instanceof WeekdaySet && String(other.days) === String(this.days); }
  toJSON() { return [...this.days]; }
}
