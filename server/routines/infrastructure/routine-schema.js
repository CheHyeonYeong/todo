/** 루틴 컨텍스트가 소유한 테이블의 DDL. */
export function routineSchema({ routines }) {
  return {
    create: [
      `create table if not exists ${routines.sql} (
        id text primary key,
        user_id text not null default 'default',
        title text not null,
        weekdays smallint[] not null default '{}',
        category text,
        active boolean not null default true,
        created_at timestamptz not null,
        updated_at timestamptz not null default now()
      )`,
    ],
  };
}

export const ROUTINE_COLUMNS = "id, title, weekdays, category, active, created_at";

export function routineFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    weekdays: (row.weekdays || []).map(Number),
    category: row.category || null,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  };
}
