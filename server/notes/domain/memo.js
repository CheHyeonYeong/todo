import { finiteNumber } from "../../shared/kernel/primitives.js";

/** 엔티티: id로 식별되는 메모. 메모에서 할 일을 뽑아내는 협력은 애플리케이션 계층이 조율한다. */
export class Memo {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.body = String(value.body || "").trim();
    this.createdAt = value.createdAt || now().toISOString();
    this.tags = Array.isArray(value.tags) ? value.tags.map(String) : [];
    this.starred = Boolean(value.starred);
    this.sortOrder = finiteNumber(value.sortOrder);
  }

  get hasContent() { return Boolean(this.body || this.title); }

  toJSON() { return { ...this }; }
  static from(value, now) { return new Memo(value, now); }
}
