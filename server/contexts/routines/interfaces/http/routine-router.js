import { Router } from "../../../../shared/interfaces/http/router.js";

export class RoutineRouter extends Router {
  constructor(routines) { super(); this.routines = routines; }

  async handle(exchange) {
    const { userId } = exchange;

    if (exchange.matches("/api/routines", "POST")) {
      return exchange.json(201, await this.routines.createRoutine(await exchange.body(), userId));
    }

    const id = exchange.resourceId("/api/routines/");
    if (id === null) return false;
    if (exchange.method === "PATCH") {
      const routine = await this.routines.updateRoutine(id, await exchange.body(), userId);
      return exchange.json(routine ? 200 : 404, routine || { error: "Routine not found" });
    }
    if (exchange.method === "DELETE") {
      await this.routines.deleteRoutine(id, userId);
      return exchange.ok();
    }
    return false;
  }
}
