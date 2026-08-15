import { Scope } from "./scope.js";

/** 값 객체: "이 할 일을 어디에 놓을지"를 나타내는 재배치 지시. */
export class TodoPlacement {
  constructor(value = {}, index = 0) {
    this.id = String(value?.id || "");
    this.parentId = typeof value?.parentId === "string" && value.parentId ? value.parentId : null;
    this.sortOrder = Number.isFinite(Number(value?.sortOrder)) ? Number(value.sortOrder) : index;
    this.scope = Scope.isValid(value?.scope) ? value.scope : null;
    Object.freeze(this);
  }

  static listFrom(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => new TodoPlacement(item, index));
  }
}
