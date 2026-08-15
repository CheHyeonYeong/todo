import { createServer } from "node:http";

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
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: error.message || "Internal server error" }));
    }
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
