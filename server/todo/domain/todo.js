import { finiteNumber, optionalText } from "../../shared/kernel/primitives.js";
import { DueDate } from "./due-date.js";
import { Scope } from "./scope.js";

/** 엔티티: id로 식별되는 할 일. 완료/재개 같은 상태 변화를 스스로 책임진다. */
export class Todo {
  constructor(value = {}, now = () => new Date()) {
    this.id = String(value.id || "");
    this.title = String(value.title || "").trim();
    this.scope = Scope.normalize(value.scope);
    this.done = Boolean(value.done);
    this.createdAt = value.createdAt || now().toISOString();
    this.completedAt = value.completedAt || null;
    this.sourceMemoId = value.sourceMemoId || null;
    this.dueDate = DueDate.normalize(value.dueDate);
    this.category = optionalText(value.category);
    this.note = optionalText(value.note);
    this.parentId = typeof value.parentId === "string" && value.parentId ? value.parentId : null;
    this.routineId = typeof value.routineId === "string" && value.routineId ? value.routineId : null;
    this.sortOrder = finiteNumber(value.sortOrder);
  }

  complete(at = new Date()) {
    this.done = true;
    this.completedAt = at.toISOString();
    return this;
  }

  reopen() {
    this.done = false;
    this.completedAt = null;
    return this;
  }

  get isSubTask() { return this.parentId !== null; }
  get isRoutineOccurrence() { return this.routineId !== null; }

  toJSON() { return { ...this }; }
  static from(value, now) { return new Todo(value, now); }
}
