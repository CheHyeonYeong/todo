/**
 * 컨텍스트 하나가 소유하는 라우트 묶음.
 * handle()은 요청을 처리했으면 true, 자기 라우트가 아니면 false를 돌려준다.
 */
export class Router {
  async handle(_exchange) { return false; }
}
