import { TodoRepository } from "../application/ports.js";
import { Scope } from "../domain/scope.js";
import { DueDate } from "../domain/due-date.js";
import { Todo } from "../domain/todo.js";
import { TodoTree } from "../domain/todo-tree.js";
import { TODO_COLUMNS_WITHOUT_ROUTINE, todoFromRow, todoValues } from "./todo-record.js";

const UPSERT_CONFLICT = `
  on conflict (id)
  do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
    completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id,
    due_date = excluded.due_date, category = excluded.category, note = excluded.note,
    parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now()
`;

export class PostgresTodoRepository extends TodoRepository {
  constructor(tables) { super(); this.tables = tables; }

  get table() { return this.tables.todos.sql; }

  /** 형제 중 마지막 다음 자리. 동시 삽입에도 안전하도록 SQL 안에서 계산한다. */
  nextSortOrder(scopeParam, parentParam, userParam) {
    return `(select coalesce(max(sort_order), -1) + 1 from ${this.table}
      where user_id = ${userParam} and scope = ${scopeParam} and parent_id is not distinct from ${parentParam})`;
  }

  async add(todo, { client, userId }) {
    if (todo.parentId) {
      const parentResult = await client.query(
        `select id, scope, parent_id from ${this.table} where id = $1 and user_id = $2 for update`,
        [todo.parentId, userId],
      );
      const parent = parentResult.rows[0];
      if (!parent || parent.parent_id) throw new Error("Parent todo not found or already nested");
      todo.scope = parent.scope;
    }
    const result = await client.query(
      `
        insert into ${this.table}
          (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          coalesce($13::double precision, ${this.nextSortOrder("$4", "$12", "$2")}),
          now())
        ${UPSERT_CONFLICT}
        returning sort_order
      `,
      todoValues(todo, userId),
    );
    if (todo.parentId && !todo.done) {
      await client.query(
        `update ${this.table} set done = false, completed_at = null, updated_at = now() where id = $1 and user_id = $2`,
        [todo.parentId, userId],
      );
    }
    todo.sortOrder = Number(result.rows[0].sort_order);
    return todo;
  }

  async update(id, patch, { client, userId }) {
    const currentResult = await client.query(
      `select id, parent_id from ${this.table} where id = $1 and user_id = $2 for update`,
      [id, userId],
    );
    const current = currentResult.rows[0];
    if (!current) return null;

    const hasDone = typeof patch.done === "boolean";
    const hasDueDate = Object.hasOwn(patch, "dueDate");
    const hasCategory = Object.hasOwn(patch, "category");
    const hasNote = Object.hasOwn(patch, "note");
    const nextScope = Scope.isValid(patch.scope) ? patch.scope : null;
    await client.query(
      `
        update ${this.table}
        set done = case when $2::boolean then $3 else done end,
          completed_at = case when $2::boolean then $4::timestamptz else completed_at end,
          due_date = case when $5::boolean then $6::text else due_date end,
          title = coalesce($7::text, title),
          scope = coalesce($8::text, scope),
          category = case when $9::boolean then nullif(trim($10::text), '') else category end,
          note = case when $11::boolean then nullif(trim($12::text), '') else note end,
          updated_at = now()
        where id = $1 and user_id = $13
      `,
      [
        id,
        hasDone,
        hasDone ? patch.done : false,
        hasDone && patch.done ? patch.completedAt || new Date().toISOString() : null,
        hasDueDate,
        DueDate.normalize(patch.dueDate),
        typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : null,
        nextScope,
        hasCategory,
        typeof patch.category === "string" ? patch.category : "",
        hasNote,
        typeof patch.note === "string" ? patch.note : "",
        userId,
      ],
    );

    if (!current.parent_id) {
      if (hasDone) {
        await client.query(
          `update ${this.table} set done = $1, completed_at = $2, updated_at = now() where parent_id = $3 and user_id = $4`,
          [patch.done, patch.done ? patch.completedAt || new Date().toISOString() : null, id, userId],
        );
      }
      if (nextScope) {
        await client.query(
          `update ${this.table} set scope = $1, updated_at = now() where parent_id = $2 and user_id = $3`,
          [nextScope, id, userId],
        );
      }
    } else if (hasDone) {
      await client.query(this.recomputeParentSql("$1"), [current.parent_id, userId]);
    }

    const result = await client.query(
      `select ${TODO_COLUMNS_WITHOUT_ROUTINE} from ${this.table} where id = $1 and user_id = $2`,
      [id, userId],
    );
    return todoFromRow(result.rows[0]);
  }

  /** 하위 목표가 모두 끝났는지에 따라 부모의 완료 상태를 다시 계산한다. */
  recomputeParentSql(idParam, extraCondition = "") {
    const unfinished = `
      select 1 from ${this.table} child
      where child.parent_id = parent.id and child.user_id = $2 and not child.done
    `;
    return `
      update ${this.table} parent
      set done = not exists (${unfinished}),
        completed_at = case when not exists (${unfinished}) then now() else null end,
        updated_at = now()
      where parent.id = ${idParam} and parent.user_id = $2${extraCondition}
    `;
  }

  async remove(id, { client, userId }) {
    const target = await client.query(
      `select parent_id from ${this.table} where id = $1 and user_id = $2 for update`,
      [id, userId],
    );
    await client.query(`delete from ${this.table} where id = $1 and user_id = $2`, [id, userId]);
    const parentId = target.rows[0]?.parent_id;
    if (!parentId) return;
    await client.query(
      this.recomputeParentSql(
        "$1",
        `\n        and exists (select 1 from ${this.table} child where child.parent_id = parent.id and child.user_id = $2)`,
      ),
      [parentId, userId],
    );
  }

  async removeMany(ids, { client, userId }) {
    if (!ids.length) return;
    await client.query(`delete from ${this.table} where user_id = $1 and id = any($2::text[])`, [userId, ids]);
  }

  async reorder(placements, { client, userId }) {
    const result = await client.query(
      `select id, scope, parent_id from ${this.table} where user_id = $1 for update`,
      [userId],
    );
    const ownedIds = new Set(result.rows.map((row) => row.id));
    if (placements.some((item) => !ownedIds.has(item.id) || (item.parentId && !ownedIds.has(item.parentId)))) {
      throw new Error("Todo tree contains an unknown item");
    }
    const changes = new Map(placements.map((item) => [item.id, item]));
    TodoTree.validate(result.rows.map((row) => {
      const change = changes.get(row.id);
      return { id: row.id, scope: change?.scope || row.scope, parentId: change ? change.parentId : row.parent_id };
    }));
    for (const item of placements) {
      await client.query(
        `update ${this.table} set parent_id = $1, sort_order = $2, scope = coalesce($3, scope), updated_at = now() where id = $4 and user_id = $5`,
        [item.parentId, item.sortOrder, item.scope, item.id, userId],
      );
    }
    await client.query(
      `
        update ${this.table} parent
        set done = children.done,
          completed_at = case when children.done then coalesce(parent.completed_at, now()) else null end,
          updated_at = now()
        from (
          select parent_id, bool_and(done) as done
          from ${this.table}
          where user_id = $1 and parent_id is not null
          group by parent_id
        ) children
        where parent.id = children.parent_id and parent.user_id = $1
      `,
      [userId],
    );
  }

  /** 메모에서 뽑은 할 일: 순서를 안 주면 형제 끝에 붙인다. */
  async captureMany(todos, { client, userId }) {
    for (const todo of todos.filter((item) => item.id && item.title)) {
      await client.query(
        `
          insert into ${this.table}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            coalesce($13::double precision, ${this.nextSortOrder("$4", "$12", "$2")}),
            now())
          ${UPSERT_CONFLICT}
        `,
        todoValues(todo, userId),
      );
    }
    return todos;
  }

  /** 루틴이 만든 오늘의 발생만 따로 넣는다(전체 재작성 없이). */
  async appendOccurrences(todos, { client, userId }) {
    for (const todo of todos.map((item) => Todo.from(item).toJSON()).filter((item) => item.id && item.title)) {
      await client.query(
        `
          insert into ${this.table}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
          on conflict (id) do nothing
        `,
        [...todoValues(todo, userId).slice(0, 12), todo.routineId, todo.sortOrder],
      );
    }
    return todos;
  }

  /** routine_id에 걸린 `on delete set null` 제약이 이미 해 준다. */
  detachRoutine(_routineId, _tx) {}
}
