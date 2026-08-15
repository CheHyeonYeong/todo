import test from "node:test";
import assert from "node:assert/strict";
import { Todo } from "./todo.js";
import { TodoTree } from "./todo-tree.js";
import { Scope } from "./scope.js";
import { DueDate } from "./due-date.js";

test("Todo normalizes input and owns completion behavior", () => {
  const todo = new Todo({ id: 1, title: "  task  ", scope: "invalid", category: " work " });
  assert.equal(todo.title, "task");
  assert.equal(todo.scope, "day");
  assert.equal(todo.category, "work");
  todo.complete(new Date("2026-01-02T03:04:05.000Z"));
  assert.equal(todo.done, true);
  assert.equal(todo.completedAt, "2026-01-02T03:04:05.000Z");
  todo.reopen();
  assert.equal(todo.completedAt, null);
});

test("Scope and DueDate are values, not entities", () => {
  assert.equal(Scope.from("week").equals(Scope.from("week")), true);
  assert.equal(Scope.normalize("year"), "day");
  assert.equal(DueDate.normalize("2026-08-10"), "2026-08-10");
  assert.equal(DueDate.normalize("10/08/2026"), null);
  assert.equal(DueDate.from("2026-08-10").isSet, true);
});

test("TodoTree protects aggregate invariants", () => {
  const parent = new Todo({ id: "parent", scope: "week" });
  const child = new Todo({ id: "child", parentId: "parent", scope: "week" });
  TodoTree.validate([parent, child]);
  assert.throws(() => TodoTree.validate([child]), /Parent todo not found/);
  assert.throws(
    () => TodoTree.validate([parent, new Todo({ id: "bad", parentId: "parent", scope: "day" })]),
    /scopes must match/,
  );
});

test("TodoTree derives parent completion from its children", () => {
  assert.deepEqual(TodoTree.parentCompletion([], "now"), { done: false, completedAt: null });
  assert.deepEqual(TodoTree.parentCompletion([{ done: true }], "now"), { done: true, completedAt: "now" });
  assert.deepEqual(TodoTree.parentCompletion([{ done: true }, { done: false }], "now"), { done: false, completedAt: null });
  assert.equal(
    TodoTree.nextSortOrder([{ scope: "day", parentId: null, sortOrder: 3 }], { scope: "day", parentId: null }),
    4,
  );
});
