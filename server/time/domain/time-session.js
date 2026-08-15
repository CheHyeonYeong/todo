/** 엔티티: 한 번의 시간 기록. 시작과 끝 사이의 길이가 이 컨텍스트의 관심사다. */
export class TimeSession {
  constructor(value = {}, now = () => new Date()) {
    const timestamp = now().toISOString();
    this.id = String(value.id || "");
    this.label = String(value.label || "").trim();
    this.startedAt = value.startedAt || timestamp;
    this.endedAt = value.endedAt || timestamp;
  }

  get durationMs() { return Math.max(0, new Date(this.endedAt) - new Date(this.startedAt)); }

  toJSON() { return { ...this }; }
  static from(value, now) { return new TimeSession(value, now); }
}
