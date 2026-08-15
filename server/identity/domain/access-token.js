/**
 * 값 객체: 요청이 들고 온 접근 토큰.
 * HTTP 헤더를 읽는 일은 표현 계층에서 끝나고, 그 아래로는 이 값만 흐른다.
 */
export class AccessToken {
  constructor(value) {
    this.value = value || null;
    Object.freeze(this);
  }

  static none() { return new AccessToken(null); }

  static fromAuthorizationHeader(header) {
    const match = (header || "").match(/^Bearer\s+(.+)$/i);
    return new AccessToken(match ? match[1] : null);
  }

  get isPresent() { return this.value !== null; }
  toString() { return this.value || ""; }
}
