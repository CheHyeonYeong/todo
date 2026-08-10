import { AuthGateway } from "../application/ports.js";

export class SupabaseAuthAdapter extends AuthGateway {
  constructor({ url = "", anonKey = "", fetchImpl = fetch } = {}) {
    super();
    this.url = url.replace(/\/$/, "");
    this.anonKey = anonKey;
    this.fetch = fetchImpl;
  }

  get enabled() { return Boolean(this.url && this.anonKey); }

  async userFrom(request) {
    if (!this.enabled) return { id: "default" };
    const match = (request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const response = await this.fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${match[1]}` },
    });
    return response.ok ? response.json() : null;
  }

  async session(request) {
    return { authenticated: !this.enabled || Boolean(await this.userFrom(request)), loginRequired: this.enabled, googleEnabled: this.enabled };
  }
  async authorize(request) { return !this.enabled || Boolean(await this.userFrom(request)); }
  async userId(request) { return (await this.userFrom(request))?.id || null; }
}
