import test from "node:test";
import assert from "node:assert/strict";
import { CalendarDay } from "../../../shared/kernel/calendar-day.js";
import { Routine } from "./routine.js";
import { RoutineMaterializer } from "./routine-materializer.js";
import { WeekdaySet } from "./weekday-set.js";

const monday = new CalendarDay("2026-08-10", 1);
const tuesday = new CalendarDay("2026-08-11", 2);
const fixedNow = () => new Date("2026-08-10T00:00:00.000Z");

test("WeekdaySet is a value: deduplicated, sorted, range-checked", () => {
  assert.deepEqual(WeekdaySet.normalize([6, 1, 1, 9, "2"]), [1, 2, 6]);
  assert.equal(WeekdaySet.from([1]).equals(WeekdaySet.from([1])), true);
  assert.equal(WeekdaySet.from([]).isEmpty, true);
});

test("Routine decides on its own whether it runs today", () => {
  const routine = new Routine({ id: "r1", title: "daily", weekdays: [1] });
  assert.equal(routine.occursOn(1), true);
  assert.equal(routine.occursOn(2), false);
  assert.equal(new Routine({ id: "r1", title: "daily", weekdays: [1], active: false }).occursOn(1), false);
});

test("materializer creates today's occurrence once and marks yesterday's as stale", () => {
  let counter = 0;
  const materializer = new RoutineMaterializer({ idFactory: () => `t${++counter}`, now: fixedNow });
  const routines = [{ id: "r1", title: "daily", weekdays: [1] }];
  const todos = [];

  const created = materializer.pendingOccurrences({ routines, todos, day: monday });
  assert.equal(created.length, 1);
  assert.equal(created[0].dueDate, "2026-08-10");
  assert.equal(created[0].routineId, "r1");
  todos.push(...created);

  assert.equal(materializer.pendingOccurrences({ routines, todos, day: monday }).length, 0);
  assert.deepEqual(materializer.staleOccurrenceIds(todos, monday), []);
  assert.deepEqual(materializer.staleOccurrenceIds(todos, tuesday), ["t1"]);
});
