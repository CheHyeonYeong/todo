import { ArchiveRepository } from "../application/ports.js";

export class PostgresArchiveRepository extends ArchiveRepository {
  constructor(pool, tables, workspaces) {
    super();
    this.pool = pool;
    this.tables = tables;
    this.workspaces = workspaces;
  }

  async candidateUserIds(cutoffIso) {
    const { todos, sessions } = this.tables;
    const result = await this.pool.query(
      `
        select distinct user_id from ${todos.sql} where done and completed_at < $1
        union
        select distinct user_id from ${sessions.sql} where ended_at < $1
      `,
      [cutoffIso],
    );
    return result.rows.map((row) => row.user_id);
  }

  load(userId) { return this.workspaces.load(userId); }

  async purge({ todoIds, sessionIds }, userId) {
    const { todos, sessions } = this.tables;
    if (todoIds.length) {
      await this.pool.query(`delete from ${todos.sql} where user_id = $1 and id = any($2::text[])`, [userId, todoIds]);
    }
    if (sessionIds.length) {
      await this.pool.query(`delete from ${sessions.sql} where user_id = $1 and id = any($2::text[])`, [userId, sessionIds]);
    }
  }
}
