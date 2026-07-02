create table if not exists public.memo_state (
  id text primary key,
  data jsonb not null default '{"todos":[],"memos":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.memos (
  id text primary key,
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.todos (
  id text primary key,
  title text not null,
  scope text not null check (scope in ('day', 'week', 'month')),
  done boolean not null default false,
  created_at timestamptz not null,
  completed_at timestamptz,
  source_memo_id text references public.memos(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.memo_state enable row level security;
alter table public.memos enable row level security;
alter table public.todos enable row level security;

-- The Node server connects with the Postgres connection string.
-- Browser clients never connect to this table directly.
