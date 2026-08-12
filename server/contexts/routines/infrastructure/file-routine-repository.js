import { RoutineRepository } from "../application/ports.js";
import { Routine } from "../domain/routine.js";

export class FileRoutineRepository extends RoutineRepository {
  add(routine, { snapshot }) {
    snapshot.routines.push(routine);
    return routine;
  }

  update(id, changes, { snapshot }) {
    const index = snapshot.routines.findIndex((routine) => routine.id === id);
    if (index < 0) return null;
    snapshot.routines[index] = Routine.from(changes.applyTo(snapshot.routines[index])).toJSON();
    return snapshot.routines[index];
  }

  remove(id, { snapshot }) {
    snapshot.routines = snapshot.routines.filter((routine) => routine.id !== id);
  }
}
