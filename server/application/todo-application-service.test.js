import test from "node:test";
import assert from "node:assert/strict";
import { TodoApplicationService } from "./todo-application-service.js";

test("application service delegates use cases through its port", async () => {
  const calls = [];
  const gateway = { createTodo(value, userId) { calls.push({ value, userId }); return { id: "1", ...value }; } };
  const service = new TodoApplicationService(gateway, {});
  assert.deepEqual(await service.createTodo({ title: "task" }, "user"), { id: "1", title: "task" });
  assert.deepEqual(calls, [{ value: { title: "task" }, userId: "user" }]);
});
