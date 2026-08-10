import test from "node:test";
import assert from "node:assert/strict";
import { Memo, Routine, Todo } from "./entities.js";
import { TodoTree } from "./todo-tree.js";

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

test("Memo and Routine normalize collection values", () => {
  assert.deepEqual(new Memo({ tags: [1, "two"] }).tags, ["1", "two"]);
  assert.deepEqual(new Routine({ weekdays: [6, 1, 1, 9, "2"] }).weekdays, [1, 2, 6]);
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
