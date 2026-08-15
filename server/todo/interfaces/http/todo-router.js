import { Router } from "../../../shared/interfaces/http/router.js";

/** 계획 컨텍스트의 HTTP 표현. JSON ↔ 유스케이스 번역만 한다. */
export class TodoRouter extends Router {
  constructor(planning) { super(); this.planning = planning; }

  async handle(exchange) {
    const { userId } = exchange;

    if (exchange.matches("/api/todos", "POST")) {
      return exchange.json(201, await this.planning.createTodo(await exchange.body(), userId));
    }
    if (exchange.matches("/api/todos/order", "PUT")) {
      const value = await exchange.body();
      await this.planning.reorderTodos(value.items, userId);
      return exchange.ok();
    }

    const id = exchange.resourceId("/api/todos/");
    if (id === null) return false;
    if (exchange.method === "PATCH") {
      const todo = await this.planning.updateTodo(id, await exchange.body(), userId);
      return exchange.json(todo ? 200 : 404, todo || { error: "Todo not found" });
    }
    if (exchange.method === "DELETE") {
      await this.planning.deleteTodo(id, userId);
      return exchange.ok();
    }
    return false;
  }
}
