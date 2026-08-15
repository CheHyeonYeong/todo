import test from "node:test";
import assert from "node:assert/strict";
import { FileUnitOfWork } from "../../shared/persistence/unit-of-work.js";
import { FileTodoRepository } from "../../todo/infrastructure/file-todo-repository.js";
import { FileMemoRepository } from "../infrastructure/file-memo-repository.js";
import { NotesService } from "./notes-service.js";

class MemoryStore {
  constructor() {
    this.data = { todos: [], memos: [], sessions: [], routines: [] };
    this.writes = 0;
  }
  async read() { return this.data; }
  async write(value) { this.writes += 1; this.data = value; return value; }
}

test("capturing a memo and its todos happens in one unit of work", async () => {
  const store = new MemoryStore();
  const notes = new NotesService({
    unitOfWork: new FileUnitOfWork(store),
    memos: new FileMemoRepository(),
    todos: new FileTodoRepository(),
  });

  const result = await notes.captureMemo(
    { memo: { id: "m1", body: "idea" }, todos: [{ id: "t1", title: "do it", scope: "day" }] },
    "user",
  );

  assert.equal(result.memo.id, "m1");
  assert.deepEqual(store.data.memos.map((memo) => memo.id), ["m1"]);
  assert.deepEqual(store.data.todos.map((todo) => todo.id), ["t1"]);
  // 메모 저장과 할 일 생성이 두 번의 쓰기로 갈라지면 안 된다.
  assert.equal(store.writes, 1);
});

test("a new memo goes to the top of the list", async () => {
  const store = new MemoryStore();
  const notes = new NotesService({
    unitOfWork: new FileUnitOfWork(store),
    memos: new FileMemoRepository(),
    todos: new FileTodoRepository(),
  });
  await notes.captureMemo({ memo: { id: "m1", body: "first" } }, "user");
  await notes.captureMemo({ memo: { id: "m2", body: "second" } }, "user");
  assert.equal(store.data.memos[0].id, "m2");
  assert.ok(store.data.memos[0].sortOrder < store.data.memos[1].sortOrder);
});

test("reordering memos keeps only usable ids", async () => {
  const store = new MemoryStore();
  const notes = new NotesService({
    unitOfWork: new FileUnitOfWork(store),
    memos: new FileMemoRepository(),
    todos: new FileTodoRepository(),
  });
  await notes.captureMemo({ memo: { id: "m1", body: "one" } }, "user");
  await notes.captureMemo({ memo: { id: "m2", body: "two" } }, "user");
  await notes.reorderMemos(["m1", "", null, "m2"], "user");
  assert.deepEqual(store.data.memos.map((memo) => memo.id), ["m1", "m2"]);
});
