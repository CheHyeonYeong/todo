import test from "node:test";
import assert from "node:assert/strict";
import { ApiController, NodeHttpServer } from "./node-http-server.js";

function fakeApplication(overrides = {}) {
  return {
    health: async () => ({ ok: true, storage: "memory", database: "none" }),
    session: async () => ({ authenticated: true, loginRequired: false, googleEnabled: false }),
    authorize: async () => true, userId: async () => "default",
    createTodo: async (value) => ({ id: "todo-1", ...value }),
    getData: async () => ({ todos: [], memos: [], sessions: [], routines: [] }),
    ...overrides,
  };
}

async function withServer(application, run) {
  const fallback = { handle(_request, response) { response.writeHead(404); response.end(); } };
  const server = new NodeHttpServer({ apiController: new ApiController(application), staticController: fallback });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address();
  try { await run(`http://127.0.0.1:${port}`); } finally { await server.close(); }
}

test("HTTP adapter exposes health and maps create todo", async () => {
  await withServer(fakeApplication(), async (base) => {
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
  await withServer(fakeApplication({ authorize: async () => false }), async (base) => {
    const response = await fetch(`${base}/api/data`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  });
});

test("HTTP adapter limits JSON request bodies", async () => {
  const app = fakeApplication();
  const fallback = { handle(_request, response) { response.writeHead(404); response.end(); } };
  const server = new NodeHttpServer({ apiController: new ApiController(app, { maxBodyBytes: 4 }), staticController: fallback });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/todos`, { method: "POST", body: "12345" });
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /too large/);
  } finally { await server.close(); }
});
