import { optionalText } from "../../../shared/kernel/primitives.js";
import { WeekdaySet } from "./weekday-set.js";

/**
 * 값 객체: 루틴 부분 수정 요청.
 * "보내지 않은 필드"와 "비우라고 보낸 필드"를 구분하는 규칙이 여기 모여 있다.
 */
export class RoutineChanges {
  constructor(patch = {}) {
    if (typeof patch?.title === "string" && patch.title.trim()) this.title = patch.title.trim();
    if (Array.isArray(patch?.weekdays)) this.weekdays = WeekdaySet.normalize(patch.weekdays);
    if (patch?.category !== undefined) this.category = optionalText(patch.category);
    if (patch?.active !== undefined) this.active = Boolean(patch.active);
    Object.freeze(this);
  }

  static from(patch) { return new RoutineChanges(patch); }

  applyTo(routine) { return { ...routine, ...this }; }
}
