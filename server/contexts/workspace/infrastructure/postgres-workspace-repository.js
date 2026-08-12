import { MEMO_COLUMNS, memoFromRow } from "../../notes/infrastructure/memo-record.js";
import { TODO_COLUMNS, todoFromRow, todoValues } from "../../planning/infrastructure/todo-record.js";
import { ROUTINE_COLUMNS, routineFromRow } from "../../routines/infrastructure/routine-schema.js";
import { SESSION_COLUMNS, sessionFromRow } from "../../time-tracking/infrastructure/session-schema.js";
import { WorkspaceRepository } from "../application/ports.js";
import { WorkspaceSnapshot } from "../domain/workspace-snapshot.js";

/**
 * Postgres 모드의 통합 리포지토리.
 * 각 컨텍스트의 테이블을 가로질러 읽고 쓰는 유일한 어댑터이며,
 * 컬럼 이름 번역은 각 컨텍스트가 내놓은 매퍼를 그대로 쓴다.
 */
export class PostgresWorkspaceRepository extends WorkspaceRepository {
  constructor(pool, tables, schema) {
    super();
    this.pool = pool;
    this.tables = tables;
    this.schema = schema;
  }

  async load(userId) {
    await this.schema.ensure();
    const { todos, memos, sessions, routines } = this.tables;
    const memoRows = await this.pool.query(
      `select ${MEMO_COLUMNS} from ${memos.sql} where user_id = $1 order by sort_order asc nulls last, created_at desc`,
      [userId],
    );
    const todoRows = await this.pool.query(
      `select ${TODO_COLUMNS} from ${todos.sql} where user_id = $1
       order by scope, parent_id nulls first, sort_order asc nulls last, created_at asc`,
      [userId],
    );
    const routineRows = await this.pool.query(
      `select ${ROUTINE_COLUMNS} from ${routines.sql} where user_id = $1 order by created_at asc`,
      [userId],
    );
    const sessionRows = await this.pool.query(
      `select ${SESSION_COLUMNS} from ${sessions.sql} where user_id = $1 order by started_at desc`,
      [userId],
    );
    return {
      memos: memoRows.rows.map(memoFromRow),
      todos: todoRows.rows.map(todoFromRow),
      sessions: sessionRows.rows.map(sessionFromRow),
      routines: routineRows.rows.map(routineFromRow),
    };
  }

  async replace(value, userId) {
    await this.schema.ensure();
    const data = WorkspaceSnapshot.from(value).toJSON();
    const { todos, memos, sessions, routines } = this.tables;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      for (const table of [todos, memos, sessions, routines]) {
        await client.query(`delete from ${table.sql} where user_id = $1`, [userId]);
      }
      for (const routine of data.routines.filter((item) => item.id && item.title)) {
        await client.query(
          `insert into ${routines.sql} (id, user_id, title, weekdays, category, active, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, now())`,
          [routine.id, userId, routine.title, routine.weekdays, routine.category, routine.active, routine.createdAt],
        );
      }
      for (const memo of data.memos.filter((item) => item.id && (item.body || item.title))) {
        await client.query(
          `insert into ${memos.sql} (id, user_id, title, body, tags, created_at, starred, sort_order, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
          [memo.id, userId, memo.title, memo.body, memo.tags, memo.createdAt, memo.starred, memo.sortOrder],
        );
      }
      for (const todo of data.todos.filter((item) => item.id && item.title)) {
        await client.query(
          `insert into ${todos.sql}
             (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
          [...todoValues(todo, userId).slice(0, 12), todo.routineId, todo.sortOrder],
        );
      }
      for (const session of data.sessions.filter((item) => item.id)) {
        await client.query(
          `insert into ${sessions.sql} (id, user_id, label, started_at, ended_at, updated_at)
           values ($1, $2, $3, $4, $5, now())`,
          [session.id, userId, session.label, session.startedAt, session.endedAt],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return data;
  }

  /** 전체를 다시 쓰지 않고, 사라진 발생만 지우고 새 발생만 넣는다. */
  async applyRoutineOccurrences(snapshot, { removedTodoIds, createdTodos }, userId) {
    const { todos } = this.tables;
    if (removedTodoIds.length) {
      await this.pool.query(
        `delete from ${todos.sql} where user_id = $1 and id = any($2::text[])`,
        [userId, removedTodoIds],
      );
    }
    for (const todo of createdTodos.filter((item) => item.id && item.title)) {
      await this.pool.query(
        `insert into ${todos.sql}
           (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
         on conflict (id) do nothing`,
        [...todoValues(todo, userId).slice(0, 12), todo.routineId, todo.sortOrder],
      );
    }
    return snapshot;
  }
}
