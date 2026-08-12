/** 노트 컨텍스트가 소유한 테이블의 DDL. */
export function memoSchema({ memos }) {
  return {
    create: [
      `create table if not exists ${memos.sql} (
        id text primary key,
        user_id text not null default 'default',
        body text not null,
        tags text[] not null default '{}',
        created_at timestamptz not null,
        updated_at timestamptz not null default now()
      )`,
    ],
    alter: [
      `alter table ${memos.sql} add column if not exists user_id text not null default 'default'`,
      `alter table ${memos.sql} add column if not exists starred boolean not null default false`,
      `alter table ${memos.sql} add column if not exists title text not null default ''`,
      `alter table ${memos.sql} add column if not exists sort_order double precision`,
    ],
    index: [
      `create index if not exists "${memos.raw}_user_created_idx" on ${memos.sql} (user_id, created_at desc)`,
    ],
  };
}
