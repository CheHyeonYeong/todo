import test from "node:test";
import assert from "node:assert/strict";
import { FileUnitOfWork } from "../../shared/persistence/unit-of-work.js";
import { FileTodoRepository } from "../infrastructure/file-todo-repository.js";
import { PlanningService } from "./planning-service.js";

/** 파일 저장소를 흉내 내는 스토어. 작업 단위 하나가 읽기 1회 · 쓰기 1회임을 확인한다. */
class MemoryStore {
  constructor(data = { todos: [], memos: [], sessions: [], routines: [] }) {
    this.data = data;
    this.reads = 0;
    this.writes = 0;
  }
  async read() { this.reads += 1; return this.data; }
  async write(value) { this.writes += 1; this.data = value; return value; }
}

function servicesFor(store) {
  return new PlanningService({ unitOfWork: new FileUnitOfWork(store), todos: new FileTodoRepository() });
}

test("creating a todo appends it after its siblings", async () => {
  const store = new MemoryStore();
  const planning = servicesFor(store);
  const first = await planning.createTodo({ id: "a", title: "first", scope: "day" }, "user");
  const second = await planning.createTodo({ id: "b", title: "second", scope: "day" }, "user");
  assert.equal(first.sortOrder, 0);
  assert.equal(second.sortOrder, 1);
  assert.equal(store.writes, 2);
});

test("a sub task inherits the parent scope and reopens a finished parent", async () => {
  const store = new MemoryStore();
  const planning = servicesFor(store);
  await planning.createTodo({ id: "p", title: "parent", scope: "week", done: true }, "user");
  const child = await planning.createTodo({ id: "c", title: "child", scope: "day", parentId: "p" }, "user");
  assert.equal(child.scope, "week");
  assert.equal(store.data.todos.find((todo) => todo.id === "p").done, false);
});

test("finishing every sub task finishes the parent", async () => {
  const store = new MemoryStore();
  const planning = servicesFor(store);
  await planning.createTodo({ id: "p", title: "parent", scope: "day" }, "user");
  await planning.createTodo({ id: "c1", title: "one", parentId: "p" }, "user");
  await planning.createTodo({ id: "c2", title: "two", parentId: "p" }, "user");

  await planning.updateTodo("c1", { done: true }, "user");
  assert.equal(store.data.todos.find((todo) => todo.id === "p").done, false);

  await planning.updateTodo("c2", { done: true }, "user");
  assert.equal(store.data.todos.find((todo) => todo.id === "p").done, true);
});

test("updating a missing todo reports not found", async () => {
  const planning = servicesFor(new MemoryStore());
  assert.equal(await planning.updateTodo("nope", { done: true }, "user"), null);
});

test("reordering rejects a tree that would nest two levels deep", async () => {
  const store = new MemoryStore();
  const planning = servicesFor(store);
  await planning.createTodo({ id: "p", title: "parent", scope: "day" }, "user");
  await planning.createTodo({ id: "c", title: "child", parentId: "p" }, "user");
  await planning.createTodo({ id: "g", title: "grandchild", scope: "day" }, "user");
  await assert.rejects(
    () => planning.reorderTodos([{ id: "g", parentId: "c", sortOrder: 0, scope: "day" }], "user"),
    /nested one level/,
  );
});
