import { UserDirectory } from "../application/ports.js";

/** 보관 메일을 어디로 보낼지 알아낸다. 단일 사용자 모드에서는 설정된 주소로 보낸다. */
export class SupabaseUserDirectory extends UserDirectory {
  constructor({ url = "", serviceRoleKey = "", fallbackEmail = "", fetchImpl = fetch } = {}) {
    super();
    this.url = url;
    this.serviceRoleKey = serviceRoleKey;
    this.fallbackEmail = fallbackEmail;
    this.fetch = fetchImpl;
  }

  async emailFor(userId) {
    if (userId === "default") return this.fallbackEmail || null;
    if (!this.url || !this.serviceRoleKey) return this.fallbackEmail || null;
    try {
      const response = await this.fetch(`${this.url}/auth/v1/admin/users/${userId}`, {
        headers: { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` },
      });
      if (!response.ok) return null;
      const user = await response.json();
      return user?.email || null;
    } catch {
      return null;
    }
  }
}
