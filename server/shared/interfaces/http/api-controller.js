import { HttpExchange } from "./http-exchange.js";

/**
 * /api/* 요청의 관문.
 * 하는 일은 둘뿐이다: 인증 경계를 세우고, 컨텍스트별 라우터에게 넘긴다.
 * 도메인 규칙은 한 줄도 여기 없다.
 */
export class ApiController {
  constructor({ identity, publicRouters = [], routers = [], maxBodyBytes = 2 * 1024 * 1024 }) {
    this.identity = identity;
    this.publicRouters = publicRouters;
    this.routers = routers;
    this.maxBodyBytes = maxBodyBytes;
  }

  async handle(request, response, pathname) {
    const exchange = new HttpExchange({ request, response, pathname, maxBodyBytes: this.maxBodyBytes });

    for (const router of this.publicRouters) {
      if (await router.handle(exchange)) return true;
    }

    if (!(await this.identity.authorize(exchange.token))) return exchange.json(401, { error: "Unauthorized" });
    const userId = await this.identity.userId(exchange.token);
    if (!userId) return exchange.json(401, { error: "Unauthorized" });
    exchange.userId = userId;

    for (const router of this.routers) {
      if (await router.handle(exchange)) return true;
    }
    return exchange.json(404, { error: "Not found" });
  }
}
