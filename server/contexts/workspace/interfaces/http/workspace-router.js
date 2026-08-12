import { Router } from "../../../../shared/interfaces/http/router.js";

export class WorkspaceRouter extends Router {
  constructor(workspace) { super(); this.workspace = workspace; }

  async handle(exchange) {
    if (exchange.pathname !== "/api/data") return false;
    if (exchange.method === "GET") return exchange.json(200, await this.workspace.getData(exchange.userId));
    if (exchange.method === "PUT") {
      return exchange.json(200, await this.workspace.replaceData(await exchange.body(), exchange.userId));
    }
    return exchange.json(405, { error: "Method not allowed" });
  }
}
