create table if not exists public.memos (
  id text primary key,
  user_id text not null default 'default',
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.todos (
  id text primary key,
  user_id text not null default 'default',
  title text not null,
  scope text not null check (scope in ('day', 'week', 'month')),
  done boolean not null default false,
  created_at timestamptz not null,
  completed_at timestamptz,
  source_memo_id text references public.memos(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.memos enable row level security;
alter table public.todos enable row level security;

alter table public.memos add column if not exists user_id text not null default 'default';
alter table public.todos add column if not exists user_id text not null default 'default';

create index if not exists memos_user_created_idx on public.memos (user_id, created_at desc);
create index if not exists todos_user_created_idx on public.todos (user_id, created_at desc);

-- The Node server connects with the Postgres connection string.
-- Browser clients never connect to this table directly.
