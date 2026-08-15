export class StorageHealth {
  constructor(pool) { this.pool = pool; }

  async check() {
    let database = "none";
    if (this.pool) {
      try { await this.pool.query("select 1"); database = "ok"; }
      catch (error) { database = `error: ${error.message}`; }
    }
    return { ok: !database.startsWith("error"), storage: this.pool ? "postgres" : "file", database };
  }
}
