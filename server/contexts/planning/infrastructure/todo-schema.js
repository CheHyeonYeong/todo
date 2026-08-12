/** 계획 컨텍스트가 소유한 테이블의 DDL. 실행 순서는 SchemaInstaller가 정한다. */
export function todoSchema({ todos, memos, routines }) {
  return {
    create: [
      `create table if not exists ${todos.sql} (
        id text primary key,
        user_id text not null default 'default',
        title text not null,
        scope text not null check (scope in ('day', 'week', 'month')),
        done boolean not null default false,
        created_at timestamptz not null,
        completed_at timestamptz,
        source_memo_id text references ${memos.sql}(id) on delete set null,
        updated_at timestamptz not null default now()
      )`,
    ],
    alter: [
      `alter table ${todos.sql} add column if not exists routine_id text references ${routines.sql}(id) on delete set null`,
      `alter table ${todos.sql} add column if not exists user_id text not null default 'default'`,
      `alter table ${todos.sql} add column if not exists due_date text`,
      `alter table ${todos.sql} add column if not exists category text`,
      `alter table ${todos.sql} add column if not exists note text`,
      `alter table ${todos.sql} add column if not exists parent_id text references ${todos.sql}(id) on delete cascade`,
      `alter table ${todos.sql} add column if not exists sort_order double precision`,
    ],
    backfill: [
      `with ranked as (
        select id, row_number() over (
          partition by user_id, scope, parent_id order by created_at asc
        ) - 1 as position
        from ${todos.sql}
        where sort_order is null
      )
      update ${todos.sql} todo
      set sort_order = ranked.position
      from ranked
      where todo.id = ranked.id`,
    ],
    index: [
      `create index if not exists "${todos.raw}_routine_idx" on ${todos.sql} (user_id, routine_id, due_date)`,
      `create index if not exists "${todos.raw}_due_date_idx" on ${todos.sql} (user_id, due_date)`,
      `create index if not exists "${todos.raw}_user_created_idx" on ${todos.sql} (user_id, created_at desc)`,
      `create index if not exists "${todos.raw}_tree_order_idx" on ${todos.sql} (user_id, scope, parent_id, sort_order)`,
    ],
  };
}
