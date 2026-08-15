import { Router } from "../../../shared/interfaces/http/router.js";

export class SessionRouter extends Router {
  constructor(identity) { super(); this.identity = identity; }

  async handle(exchange) {
    if (!exchange.matches("/api/session", "GET")) return false;
    return exchange.json(200, await this.identity.session(exchange.token));
  }
}
