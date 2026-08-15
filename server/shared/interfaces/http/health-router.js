import { Router } from "./router.js";

/** 인증 이전에 열려 있는 운영용 라우트. */
export class HealthRouter extends Router {
  constructor(storageHealth) { super(); this.storageHealth = storageHealth; }

  async handle(exchange) {
    if (!exchange.matches("/api/health", "GET")) return false;
    const health = await this.storageHealth.check();
    return exchange.json(health.ok ? 200 : 503, health);
  }
}
