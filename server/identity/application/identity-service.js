/** 신원 컨텍스트의 유스케이스. 다른 컨텍스트는 "누구의 데이터인가"만 알면 된다. */
export class IdentityService {
  constructor(authentication) { this.authentication = authentication; }

  session(token) { return this.authentication.session(token); }
  authorize(token) { return this.authentication.authorize(token); }
  userId(token) { return this.authentication.userId(token); }
}
