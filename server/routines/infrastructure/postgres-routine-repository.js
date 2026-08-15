import { RoutineRepository } from "../application/ports.js";
import { Routine } from "../domain/routine.js";
import { ROUTINE_COLUMNS, routineFromRow } from "./routine-schema.js";

export class PostgresRoutineRepository extends RoutineRepository {
  constructor(tables) { super(); this.tables = tables; }

  get table() { return this.tables.routines.sql; }

  async add(routine, { client, userId }) {
    await client.query(
      `
        insert into ${this.table} (id, user_id, title, weekdays, category, active, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
      `,
      [routine.id, userId, routine.title, routine.weekdays, routine.category, routine.active, routine.createdAt],
    );
    return routine;
  }

  async update(id, changes, { client, userId }) {
    const existing = await client.query(
      `select ${ROUTINE_COLUMNS} from ${this.table} where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (existing.rowCount === 0) return null;
    const next = Routine.from(changes.applyTo(routineFromRow(existing.rows[0]))).toJSON();
    await client.query(
      `
        update ${this.table}
        set title = $3, weekdays = $4, category = $5, active = $6, updated_at = now()
        where id = $1 and user_id = $2
      `,
      [id, userId, next.title, next.weekdays, next.category, next.active],
    );
    return next;
  }

  async remove(id, { client, userId }) {
    await client.query(`delete from ${this.table} where id = $1 and user_id = $2`, [id, userId]);
  }
}
