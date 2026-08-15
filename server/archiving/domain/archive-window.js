/** 값 객체: "완료된 지 N개월"이라는 보관 기준. 기준 시각(cutoff)을 스스로 계산한다. */
export class ArchiveWindow {
  constructor(afterMonths) {
    this.afterMonths = afterMonths;
    Object.freeze(this);
  }

  cutoff(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - this.afterMonths);
    return cutoff.toISOString();
  }

  equals(other) { return other instanceof ArchiveWindow && other.afterMonths === this.afterMonths; }
}
