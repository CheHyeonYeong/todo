import { randomUUID } from "node:crypto";
import { Routine } from "../domain/routine.js";
import { RoutineChanges } from "../domain/routine-changes.js";

export class RoutineService {
  constructor({ unitOfWork, routines, todos, idFactory = randomUUID, now = () => new Date() }) {
    this.unitOfWork = unitOfWork;
    this.routines = routines;
    this.todos = todos;
    this.idFactory = idFactory;
    this.now = now;
  }

  createRoutine(value, userId) {
    const routine = Routine.from({
      ...value,
      id: value?.id || this.idFactory(),
      createdAt: this.now().toISOString(),
    }).toJSON();
    if (!routine.title) throw new Error("Routine title is required");
    return this.unitOfWork.run(userId, (tx) => this.routines.add(routine, tx));
  }

  updateRoutine(id, patch, userId) {
    const changes = RoutineChanges.from(patch);
    return this.unitOfWork.run(userId, (tx) => this.routines.update(id, changes, tx));
  }

  /** 루틴을 지워도 이미 만들어진 할 일은 남긴다(지난 기록이므로). 연결만 끊는다. */
  deleteRoutine(id, userId) {
    return this.unitOfWork.run(userId, async (tx) => {
      await this.routines.remove(id, tx);
      await this.todos.detachRoutine(id, tx);
    });
  }
}
