import { TimeSessionRepository } from "../application/ports.js";

export class PostgresTimeSessionRepository extends TimeSessionRepository {
  constructor(tables) { super(); this.tables = tables; }

  get table() { return this.tables.sessions.sql; }

  async add(session, { client, userId }) {
    await client.query(
      `
        insert into ${this.table} (id, user_id, label, started_at, ended_at, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (id)
        do update set label = excluded.label, started_at = excluded.started_at,
          ended_at = excluded.ended_at, updated_at = now()
      `,
      [session.id, userId, session.label, session.startedAt, session.endedAt],
    );
    return session;
  }

  async remove(id, { client, userId }) {
    await client.query(`delete from ${this.table} where id = $1 and user_id = $2`, [id, userId]);
  }

  async removeMany(ids, { client, userId }) {
    if (!ids.length) return;
    await client.query(`delete from ${this.table} where user_id = $1 and id = any($2::text[])`, [userId, ids]);
  }
}
