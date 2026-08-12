import { Router } from "../../../../shared/interfaces/http/router.js";

export class TimeSessionRouter extends Router {
  constructor(timeTracking) { super(); this.timeTracking = timeTracking; }

  async handle(exchange) {
    const { userId } = exchange;

    if (exchange.matches("/api/sessions", "POST")) {
      return exchange.json(201, await this.timeTracking.createSession(await exchange.body(), userId));
    }

    const id = exchange.resourceId("/api/sessions/");
    if (id === null || exchange.method !== "DELETE") return false;
    await this.timeTracking.deleteSession(id, userId);
    return exchange.ok();
  }
}
