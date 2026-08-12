import { AccessToken } from "../../../contexts/identity/domain/access-token.js";

/**
 * 표현 계층의 작업 공간. 라우터가 HTTP의 세부(헤더, 스트림, 상태 코드)를 다루는 유일한 통로다.
 * 이 아래(애플리케이션 계층)로는 request/response 객체가 절대 넘어가지 않는다.
 */
export class HttpExchange {
  constructor({ request, response, pathname, maxBodyBytes = 2 * 1024 * 1024 }) {
    this.request = request;
    this.response = response;
    this.pathname = pathname;
    this.maxBodyBytes = maxBodyBytes;
    this.token = AccessToken.fromAuthorizationHeader(request.headers?.authorization);
    this.userId = null;
  }

  get method() { return this.request.method; }

  matches(path, method) { return this.pathname === path && this.method === method; }

  /** `/api/todos/{id}` 형태에서 id를 뽑는다. 하위 경로가 더 있으면 이 라우트가 아니다. */
  resourceId(prefix) {
    if (!this.pathname.startsWith(prefix) || this.pathname.slice(prefix.length).includes("/")) return null;
    return decodeURIComponent(this.pathname.slice(prefix.length));
  }

  async body() {
    let body = "";
    for await (const chunk of this.request) {
      body += chunk;
      if (Buffer.byteLength(body) > this.maxBodyBytes) throw new Error("Request body too large");
    }
    return JSON.parse(body || "{}");
  }

  /** 응답을 쓰고 "이 요청은 처리됐다"는 뜻으로 true를 돌려준다. */
  json(status, body) {
    this.response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    this.response.end(JSON.stringify(body));
    return true;
  }

  ok() { return this.json(200, { ok: true }); }
}
