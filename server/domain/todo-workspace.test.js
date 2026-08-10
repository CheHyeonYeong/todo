import test from "node:test";
import assert from "node:assert/strict";
import { TodoWorkspace } from "./todo-workspace.js";

const fixedNow = () => new Date("2026-08-10T00:00:00.000Z");

test("workspace normalizes sibling order", () => {
  const workspace = new TodoWorkspace({ todos: [
    { id: "later", title: "later", sortOrder: 10, createdAt: "2026-01-02T00:00:00Z" },
    { id: "first", title: "first", sortOrder: 2, createdAt: "2026-01-01T00:00:00Z" },
  ] }, { now: fixedNow });
  assert.deepEqual(workspace.todos.map((todo) => [todo.id, todo.sortOrder]), [["later", 1], ["first", 0]]);
});

test("workspace materializes a routine once and removes stale occurrences", () => {
  const workspace = new TodoWorkspace({ routines: [{ id: "r1", title: "daily", weekdays: [1] }] }, { now: fixedNow });
  assert.equal(workspace.materializeRoutines({ today: "2026-08-10", weekday: 1, idFactory: () => "t1" }).length, 1);
  assert.equal(workspace.materializeRoutines({ today: "2026-08-10", weekday: 1, idFactory: () => "t2" }).length, 0);
  assert.deepEqual(workspace.removeStaleRoutineTodos("2026-08-11"), ["t1"]);
  assert.equal(workspace.todos.length, 0);
});
