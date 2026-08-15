import { MemoRepository } from "../application/ports.js";
import { MEMO_COLUMNS, memoFromRow } from "./memo-record.js";

export class PostgresMemoRepository extends MemoRepository {
  constructor(tables) { super(); this.tables = tables; }

  get table() { return this.tables.memos.sql; }

  async capture(memo, { client, userId }) {
    await client.query(
      `
        insert into ${this.table} (id, user_id, title, body, tags, created_at, starred, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7,
          coalesce($8::double precision,
            (select coalesce(min(sort_order), 0) - 1 from ${this.table} where user_id = $2)),
          now())
        on conflict (id)
        do update set title = excluded.title, body = excluded.body, tags = excluded.tags, updated_at = now()
      `,
      [memo.id, userId, memo.title, memo.body, memo.tags, memo.createdAt, memo.starred, memo.sortOrder],
    );
    return memo;
  }

  async update(id, patch, { client, userId }) {
    const result = await client.query(
      `
        update ${this.table}
        set starred = coalesce($2, starred),
          title = coalesce($4, title),
          body = coalesce($5, body),
          updated_at = now()
        where id = $1 and user_id = $3
        returning ${MEMO_COLUMNS}
      `,
      [
        id,
        typeof patch.starred === "boolean" ? patch.starred : null,
        userId,
        typeof patch.title === "string" ? patch.title.trim() : null,
        typeof patch.body === "string" ? patch.body.trim() : null,
      ],
    );
    return result.rowCount ? memoFromRow(result.rows[0]) : null;
  }

  async remove(id, { client, userId }) {
    await client.query(`delete from ${this.table} where id = $1 and user_id = $2`, [id, userId]);
  }

  async reorder(ids, { client, userId }) {
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(
        `update ${this.table} set sort_order = $1, updated_at = now() where id = $2 and user_id = $3`,
        [index, ids[index], userId],
      );
    }
  }
}
