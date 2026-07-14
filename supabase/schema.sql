create table if not exists public.memos (
  id text primary key,
  user_id text not null default 'default',
  title text not null default '',
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null,
  starred boolean not null default false,
  sort_order double precision,
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
  due_date text,
  parent_id text references public.todos(id) on delete cascade,
  sort_order double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.routines (
  id text primary key,
  user_id text not null default 'default',
  title text not null,
  weekdays smallint[] not null default '{}',
  category text,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id text not null default 'default',
  label text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.memos enable row level security;
alter table public.todos enable row level security;
alter table public.sessions enable row level security;
alter table public.routines enable row level security;

alter table public.todos add column if not exists routine_id text references public.routines(id) on delete set null;

alter table public.memos add column if not exists user_id text not null default 'default';
alter table public.todos add column if not exists user_id text not null default 'default';
alter table public.memos add column if not exists starred boolean not null default false;
alter table public.memos add column if not exists title text not null default '';
alter table public.memos add column if not exists sort_order double precision;
alter table public.todos add column if not exists due_date text;
alter table public.todos add column if not exists category text;
alter table public.todos add column if not exists note text;
alter table public.todos add column if not exists parent_id text references public.todos(id) on delete cascade;
alter table public.todos add column if not exists sort_order double precision;

create index if not exists memos_user_created_idx on public.memos (user_id, created_at desc);
create index if not exists todos_user_created_idx on public.todos (user_id, created_at desc);
create index if not exists todos_due_date_idx on public.todos (user_id, due_date);
create index if not exists todos_tree_order_idx on public.todos (user_id, scope, parent_id, sort_order);
create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);

-- The Node server connects with the Postgres connection string.
-- Browser clients never connect to this table directly.
