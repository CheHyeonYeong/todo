import { Todo } from "../../planning/domain/todo.js";
import { Routine } from "./routine.js";

/**
 * 도메인 서비스: 루틴 컨텍스트가 계획 컨텍스트에 할 일을 만들어 주는 지점.
 * 두 컨텍스트의 협력이 여기 한 곳에 모여 있어서, 경계를 넘는 규칙을 한눈에 볼 수 있다.
 *
 * 유비쿼터스 랭귀지
 * - 루틴(Routine): 반복 규칙 그 자체
 * - 오늘의 발생(occurrence): 그 규칙이 오늘 만들어 낸 할 일 하나
 */
export class RoutineMaterializer {
  constructor({ idFactory, now = () => new Date() } = {}) {
    this.idFactory = idFactory;
    this.now = now;
  }

  /** 루틴 항목은 매일 새 체크리스트다. 오늘 것이 아닌 발생은 쌓아두지 않는다. */
  staleOccurrenceIds(todos, day) {
    return todos.filter((todo) => todo.routineId && todo.dueDate !== day.key).map((todo) => todo.id);
  }

  /** 오늘 요일에 해당하는데 아직 만들어지지 않은 발생만 새로 만든다. */
  pendingOccurrences({ routines, todos, day }) {
    const created = [];
    for (const value of routines) {
      const routine = Routine.from(value, this.now);
      if (!routine.isComplete || !routine.occursOn(day.weekday)) continue;
      if (todos.some((todo) => todo.routineId === routine.id && todo.dueDate === day.key)) continue;
      const siblings = todos.filter((todo) => todo.scope === "day" && !todo.parentId);
      created.push(new Todo({
        id: this.idFactory(),
        title: routine.title,
        scope: "day",
        dueDate: day.key,
        category: routine.category,
        routineId: routine.id,
        sortOrder: Math.max(-1, ...siblings.map((item) => Number(item.sortOrder) || 0)) + 1 + created.length,
      }, this.now).toJSON());
    }
    return created;
  }
}
