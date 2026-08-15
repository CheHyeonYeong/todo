/** 시간 기록 컨텍스트가 소유한 테이블의 DDL. */
export function sessionSchema({ sessions }) {
  return {
    create: [
      `create table if not exists ${sessions.sql} (
        id text primary key,
        user_id text not null default 'default',
        label text not null default '',
        started_at timestamptz not null,
        ended_at timestamptz not null,
        updated_at timestamptz not null default now()
      )`,
    ],
    index: [
      `create index if not exists "${sessions.raw}_user_started_idx" on ${sessions.sql} (user_id, started_at desc)`,
    ],
  };
}

export const SESSION_COLUMNS = "id, label, started_at, ended_at";

export function sessionFromRow(row) {
  return {
    id: row.id,
    label: row.label,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
  };
}
