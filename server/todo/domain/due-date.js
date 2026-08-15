const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 값 객체: 할 일의 마감일(YYYY-MM-DD). 형식이 맞지 않으면 "없음"이다. */
export class DueDate {
  constructor(value) {
    this.value = PATTERN.test(value) ? value : null;
    Object.freeze(this);
  }

  static from(value) { return new DueDate(value); }
  static isValid(value) { return PATTERN.test(value); }
  static normalize(value) { return new DueDate(value).value; }

  get isSet() { return this.value !== null; }
  equals(other) { return other instanceof DueDate && other.value === this.value; }
  toString() { return this.value || ""; }
  toJSON() { return this.value; }
}
