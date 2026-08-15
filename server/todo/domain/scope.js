const SCOPES = new Set(["day", "week", "month"]);

/**
 * 값 객체: 할 일이 속한 계획 범위(오늘/이번 주/이번 달).
 * 식별자가 없고, 값이 같으면 같은 것으로 취급한다.
 * 엔티티에는 직렬화 호환을 위해 원시 문자열로 저장하고, 규칙은 이 클래스가 가진다.
 */
export class Scope {
  constructor(value) {
    this.value = SCOPES.has(value) ? value : "day";
    Object.freeze(this);
  }

  static from(value) { return new Scope(value); }
  static isValid(value) { return SCOPES.has(value); }
  static normalize(value) { return new Scope(value).value; }
  static values() { return [...SCOPES]; }

  equals(other) { return other instanceof Scope && other.value === this.value; }
  toString() { return this.value; }
  toJSON() { return this.value; }
}
