import test from "node:test";
import assert from "node:assert/strict";
import { WorkspaceSnapshot } from "./workspace-snapshot.js";

const fixedNow = () => new Date("2026-08-10T00:00:00.000Z");

test("snapshot normalizes sibling order across the whole workspace", () => {
  const snapshot = new WorkspaceSnapshot({ todos: [
    { id: "later", title: "later", sortOrder: 10, createdAt: "2026-01-02T00:00:00Z" },
    { id: "first", title: "first", sortOrder: 2, createdAt: "2026-01-01T00:00:00Z" },
  ] }, { now: fixedNow });
  assert.deepEqual(snapshot.todos.map((todo) => [todo.id, todo.sortOrder]), [["later", 1], ["first", 0]]);
});

test("snapshot rejects data that breaks the todo tree invariant", () => {
  assert.throws(
    () => WorkspaceSnapshot.from({ todos: [{ id: "child", title: "c", parentId: "missing" }] }),
    /Parent todo not found/,
  );
});

test("snapshot drops routines that are not usable and stamps updatedAt", () => {
  const snapshot = WorkspaceSnapshot.from(
    { routines: [{ id: "r1", title: "ok" }, { id: "", title: "no id" }, { id: "r3", title: "" }] },
    { now: fixedNow },
  );
  const json = snapshot.toJSON();
  assert.deepEqual(json.routines.map((routine) => routine.id), ["r1"]);
  assert.equal(json.updatedAt, "2026-08-10T00:00:00.000Z");
});
