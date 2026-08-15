/**
 * 신원 컨텍스트가 요구하는 포트.
 * 인증은 이 앱의 도메인이 아니라 외부 제공자(Supabase)의 일이라서
 * 이 컨텍스트에는 엔티티가 없고 포트와 어댑터만 있다.
 */
export class AuthenticationPort {
  session(_token) { throw new Error("Not implemented"); }
  authorize(_token) { throw new Error("Not implemented"); }
  userId(_token) { throw new Error("Not implemented"); }
}
