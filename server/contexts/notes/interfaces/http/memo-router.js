import { Router } from "../../../../shared/interfaces/http/router.js";

export class MemoRouter extends Router {
  constructor(notes) { super(); this.notes = notes; }

  async handle(exchange) {
    const { userId } = exchange;

    if (exchange.matches("/api/memos", "POST")) {
      return exchange.json(201, await this.notes.captureMemo(await exchange.body(), userId));
    }
    if (exchange.matches("/api/memos/order", "PUT")) {
      const value = await exchange.body();
      await this.notes.reorderMemos(value.ids, userId);
      return exchange.ok();
    }

    const id = exchange.resourceId("/api/memos/");
    if (id === null) return false;
    if (exchange.method === "PATCH") {
      const memo = await this.notes.updateMemo(id, await exchange.body(), userId);
      return exchange.json(memo ? 200 : 404, memo || { error: "Memo not found" });
    }
    if (exchange.method === "DELETE") {
      await this.notes.deleteMemo(id, userId);
      return exchange.ok();
    }
    return false;
  }
}
