import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

class HttpResponse {
  static json(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  }
}

export class ApiController {
  constructor(application, { maxBodyBytes = 2 * 1024 * 1024 } = {}) {
    this.application = application;
    this.maxBodyBytes = maxBodyBytes;
  }

  async handle(request, response, pathname) {
    const app = this.application;
    if (pathname === "/api/health" && request.method === "GET") {
      const health = await app.health();
      return HttpResponse.json(response, health.ok ? 200 : 503, health);
    }
    if (pathname === "/api/session" && request.method === "GET") {
      return HttpResponse.json(response, 200, await app.session(request));
    }
    if (!(await app.authorize(request))) return HttpResponse.json(response, 401, { error: "Unauthorized" });
    const userId = await app.userId(request);
    if (!userId) return HttpResponse.json(response, 401, { error: "Unauthorized" });

    const body = async () => JSON.parse((await this.readBody(request)) || "{}");
    if (pathname === "/api/memos" && request.method === "POST")
      return HttpResponse.json(response, 201, await app.createMemo(await body(), userId));
    if (pathname === "/api/todos" && request.method === "POST")
      return HttpResponse.json(response, 201, await app.createTodo(await body(), userId));
    if (pathname === "/api/todos/order" && request.method === "PUT") {
      const value = await body();
      await app.reorderTodos(Array.isArray(value.items) ? value.items : [], userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    if (pathname === "/api/sessions" && request.method === "POST")
      return HttpResponse.json(response, 201, await app.createSession(await body(), userId));

    const sessionId = this.resourceId(pathname, "/api/sessions/");
    if (sessionId !== null && request.method === "DELETE") {
      await app.deleteSession(sessionId, userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    const todoId = this.resourceId(pathname, "/api/todos/");
    if (todoId !== null && request.method === "PATCH") {
      const todo = await app.updateTodo(todoId, await body(), userId);
      return HttpResponse.json(response, todo ? 200 : 404, todo || { error: "Todo not found" });
    }
    if (todoId !== null && request.method === "DELETE") {
      await app.deleteTodo(todoId, userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    if (pathname === "/api/memos/order" && request.method === "PUT") {
      const value = await body();
      const ids = Array.isArray(value.ids) ? value.ids.map(String).filter(Boolean) : [];
      await app.reorderMemos(ids, userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    const memoId = this.resourceId(pathname, "/api/memos/");
    if (memoId !== null && request.method === "PATCH") {
      const memo = await app.updateMemo(memoId, await body(), userId);
      return HttpResponse.json(response, memo ? 200 : 404, memo || { error: "Memo not found" });
    }
    if (memoId !== null && request.method === "DELETE") {
      await app.deleteMemo(memoId, userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    if (pathname === "/api/routines" && request.method === "POST")
      return HttpResponse.json(response, 201, await app.createRoutine(await body(), userId));
    const routineId = this.resourceId(pathname, "/api/routines/");
    if (routineId !== null && request.method === "PATCH") {
      const routine = await app.updateRoutine(routineId, await body(), userId);
      return HttpResponse.json(response, routine ? 200 : 404, routine || { error: "Routine not found" });
    }
    if (routineId !== null && request.method === "DELETE") {
      await app.deleteRoutine(routineId, userId);
      return HttpResponse.json(response, 200, { ok: true });
    }
    if (pathname !== "/api/data") return HttpResponse.json(response, 404, { error: "Not found" });
    if (request.method === "GET") return HttpResponse.json(response, 200, await app.getData(userId));
    if (request.method === "PUT") return HttpResponse.json(response, 200, await app.replaceData(await body(), userId));
    return HttpResponse.json(response, 405, { error: "Method not allowed" });
  }

  resourceId(pathname, prefix) {
    if (!pathname.startsWith(prefix) || pathname.slice(prefix.length).includes("/")) return null;
    return decodeURIComponent(pathname.slice(prefix.length));
  }

  async readBody(request) {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > this.maxBodyBytes) throw new Error("Request body too large");
    }
    return body;
  }
}

export class StaticFileController {
  constructor(publicDir) { this.publicDir = normalize(publicDir); }
  async handle(_request, response, pathname) {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(this.publicDir, safePath);
    if (!filePath.startsWith(this.publicDir)) { response.writeHead(403); return response.end("Forbidden"); }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
      response.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream" });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found");
    }
  }
}

export class NodeHttpServer {
  constructor({ apiController, staticController, allowedOrigins = [] }) {
    this.apiController = apiController;
    this.staticController = staticController;
    this.allowedOrigins = allowedOrigins;
    this.server = createServer(this.handle.bind(this));
  }
  async handle(request, response) {
    try {
      this.applyCors(request, response);
      if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      const controller = url.pathname.startsWith("/api/") ? this.apiController : this.staticController;
      await controller.handle(request, response, url.pathname);
    } catch (error) { HttpResponse.json(response, 500, { error: error.message || "Internal server error" }); }
  }
  applyCors(request, response) {
    const origin = request.headers.origin;
    if (!origin || (this.allowedOrigins.length && !this.allowedOrigins.includes(origin))) return;
    response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Max-Age", "86400");
  }
  listen(port, host = "0.0.0.0", callback) { return this.server.listen(port, host, callback); }
  close() { return new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve())); }
}
