create table if not exists public.memo_state (
  id text primary key,
  data jsonb not null default '{"todos":[],"memos":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.memo_state enable row level security;

-- The Node server connects with the Postgres connection string.
-- Browser clients never connect to this table directly.
