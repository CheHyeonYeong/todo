import test from "node:test";
import assert from "node:assert/strict";
import { TodoRouter } from "../../../todo/interfaces/http/todo-router.js";
import { WorkspaceRouter } from "../../../workspace/interfaces/http/workspace-router.js";
import { ApiController } from "./api-controller.js";
import { HealthRouter } from "./health-router.js";
import { NodeHttpServer } from "./node-http-server.js";

function buildController({ identity, planning, workspace, maxBodyBytes } = {}) {
  return new ApiController({
    identity: { authorize: async () => true, userId: async () => "default", ...identity },
    publicRouters: [
      new HealthRouter({ check: async () => ({ ok: true, storage: "memory", database: "none" }) }),
    ],
    routers: [
      new TodoRouter({ createTodo: async (value) => ({ id: "todo-1", ...value }), ...planning }),
      new WorkspaceRouter({ getData: async () => ({ todos: [], memos: [], sessions: [], routines: [] }), ...workspace }),
    ],
    maxBodyBytes,
  });
}

async function withServer(apiController, run) {
  const fallback = { handle(_request, response) { response.writeHead(404); response.end(); } };
  const server = new NodeHttpServer({ apiController, staticController: fallback });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address();
  try { await run(`http://127.0.0.1:${port}`); } finally { await server.close(); }
}

test("HTTP adapter exposes health and maps create todo", async () => {
  await withServer(buildController(), async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).storage, "memory");
    const created = await fetch(`${base}/api/todos`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "task" }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { id: "todo-1", title: "task" });
  });
});

test("HTTP adapter rejects unauthorized requests", async () => {
  const controller = buildController({ identity: { authorize: async () => false } });
  await withServer(controller, async (base) => {
    const response = await fetch(`${base}/api/data`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });
});

test("HTTP adapter limits JSON request bodies", async () => {
  await withServer(buildController({ maxBodyBytes: 4 }), async (base) => {
    const response = await fetch(`${base}/api/todos`, { method: "POST", body: "12345" });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /too large/);
  });
});

test("unclaimed routes fall through to 404, and /api/data answers 405", async () => {
  await withServer(buildController(), async (base) => {
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
    assert.equal((await fetch(`${base}/api/todos`)).status, 404);
    assert.equal((await fetch(`${base}/api/data`, { method: "DELETE" })).status, 405);
  });
});
