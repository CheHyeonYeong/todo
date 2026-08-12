import { AuthenticationPort } from "../application/ports.js";

export class SupabaseAuthAdapter extends AuthenticationPort {
  constructor({ url = "", anonKey = "", fetchImpl = fetch } = {}) {
    super();
    this.url = url.replace(/\/$/, "");
    this.anonKey = anonKey;
    this.fetch = fetchImpl;
  }

  /** Supabase 설정이 없으면 로그인 없이 단일 사용자로 동작한다. */
  get enabled() { return Boolean(this.url && this.anonKey); }

  async userFrom(token) {
    if (!this.enabled) return { id: "default" };
    if (!token?.isPresent) return null;
    const response = await this.fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${token.value}` },
    });
    return response.ok ? response.json() : null;
  }

  async session(token) {
    return {
      authenticated: !this.enabled || Boolean(await this.userFrom(token)),
      loginRequired: this.enabled,
      googleEnabled: this.enabled,
    };
  }

  async authorize(token) { return !this.enabled || Boolean(await this.userFrom(token)); }
  async userId(token) { return (await this.userFrom(token))?.id || null; }
}
