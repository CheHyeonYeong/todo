import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = process.env.PUBLIC_DIR || join(__dirname, "../client/dist");
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || join(__dirname, "../data", "store.json");
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const googleAuthEnabled = Boolean(supabaseUrl && supabaseAnonKey);
const maxBodyBytes = 1024 * 1024 * 2;
const databaseUrl = process.env.DATABASE_URL || "";
const todosTable = process.env.TODOS_TABLE || "todos";
const memosTable = process.env.MEMOS_TABLE || "memos";
const sessionsTable = process.env.SESSIONS_TABLE || "sessions";
const routinesTable = process.env.ROUTINES_TABLE || "routines";
// 루틴의 "오늘"은 서버 시간대가 아니라 사용자 시간대 기준이어야 한다.
const appTimeZone = process.env.APP_TIMEZONE || "Asia/Seoul";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
/* 오래된 완료 할 일 보관(이메일 export 후 삭제) 설정. SMTP가 없으면 기능이 꺼진다. */
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const archiveAfterMonths = Number(process.env.ARCHIVE_AFTER_MONTHS || 6);
const archiveFallbackEmail = process.env.ARCHIVE_EMAIL_TO || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const archiveIntervalMs = Number(process.env.ARCHIVE_INTERVAL_MS || 24 * 60 * 60 * 1000);
const archiveEnabled =
  Boolean(smtpHost && smtpUser && smtpPass) &&
  archiveAfterMonths > 0 &&
  Boolean(archiveFallbackEmail || supabaseServiceRoleKey);
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
      max: 3,
      idleTimeoutMillis: 30_000,
    })
  : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Max-Age", "86400");
  }
}

async function getSupabaseUser(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;

  return response.json();
}

async function isAuthorized(request) {
  if (!googleAuthEnabled) return true;

  const match = (request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return Boolean(await getSupabaseUser(match[1]));
}

async function getRequestUserId(request) {
  if (!googleAuthEnabled) return "default";

  const match = (request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const user = match ? await getSupabaseUser(match[1]) : null;
  return user?.id || null;
}

function emptyData() {
  return {
    todos: [],
    memos: [],
    sessions: [],
    routines: [],
  };
}

/** 사용자 시간대의 오늘 날짜(YYYY-MM-DD)와 요일(0=일 ~ 6=토) */
function todayInAppZone() {
  const now = new Date();
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekdayName = new Intl.DateTimeFormat("en-US", { timeZone: appTimeZone, weekday: "short" }).format(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { key, weekday };
}

function cleanRoutine(routine) {
  const weekdays = Array.isArray(routine?.weekdays)
    ? [...new Set(routine.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [];
  return {
    id: String(routine?.id || ""),
    title: String(routine?.title || "").trim(),
    weekdays,
    category:
      typeof routine?.category === "string" && routine.category.trim() ? routine.category.trim() : null,
    active: routine?.active === undefined ? true : Boolean(routine.active),
    createdAt: routine?.createdAt || new Date().toISOString(),
  };
}

/** 오늘 요일에 해당하는 루틴을 오늘 할 일로 만든다. 이미 만든 건 건너뛴다. */
function materializeRoutines(data) {
  const { key: today, weekday } = todayInAppZone();
  const created = [];
  for (const routine of data.routines || []) {
    if (!routine.active || !routine.weekdays.includes(weekday)) continue;
    const exists = data.todos.some((todo) => todo.routineId === routine.id && todo.dueDate === today);
    if (exists) continue;
    const siblings = data.todos.filter((todo) => todo.scope === "day" && !todo.parentId);
    created.push({
      id: randomUUID(),
      title: routine.title,
      scope: "day",
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      sourceMemoId: null,
      dueDate: today,
      category: routine.category,
      note: null,
      parentId: null,
      routineId: routine.id,
      sortOrder: Math.max(-1, ...siblings.map((todo) => Number(todo.sortOrder) || 0)) + 1 + created.length,
    });
  }
  data.todos.push(...created);
  return created;
}

function cleanTodo(todo) {
  return {
    id: String(todo?.id || ""),
    title: String(todo?.title || "").trim(),
    scope: ["day", "week", "month"].includes(todo?.scope) ? todo.scope : "day",
    done: Boolean(todo?.done),
    createdAt: todo?.createdAt || new Date().toISOString(),
    completedAt: todo?.completedAt || null,
    sourceMemoId: todo?.sourceMemoId || null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(todo?.dueDate) ? todo.dueDate : null,
    category: typeof todo?.category === "string" && todo.category.trim() ? todo.category.trim() : null,
    note: typeof todo?.note === "string" && todo.note.trim() ? todo.note.trim() : null,
    parentId: typeof todo?.parentId === "string" && todo.parentId ? todo.parentId : null,
    routineId: typeof todo?.routineId === "string" && todo.routineId ? todo.routineId : null,
    sortOrder:
      todo?.sortOrder !== null && todo?.sortOrder !== undefined && Number.isFinite(Number(todo.sortOrder))
        ? Number(todo.sortOrder)
        : null,
  };
}

function cleanMemo(memo) {
  return {
    id: String(memo?.id || ""),
    title: String(memo?.title || "").trim(),
    body: String(memo?.body || "").trim(),
    createdAt: memo?.createdAt || new Date().toISOString(),
    tags: Array.isArray(memo?.tags) ? memo.tags.map(String) : [],
    starred: Boolean(memo?.starred),
    sortOrder: Number.isFinite(Number(memo?.sortOrder)) ? Number(memo.sortOrder) : null,
  };
}

function cleanSession(session) {
  return {
    id: String(session?.id || ""),
    label: String(session?.label || "").trim(),
    startedAt: session?.startedAt || new Date().toISOString(),
    endedAt: session?.endedAt || new Date().toISOString(),
  };
}

function cleanData(value) {
  const todos = Array.isArray(value?.todos) ? value.todos.map(cleanTodo) : [];
  for (const scope of ["day", "week", "month"]) {
    const parentIds = new Set([null, ...todos.filter((todo) => todo.scope === scope).map((todo) => todo.parentId)]);
    for (const parentId of parentIds) {
      const siblings = todos
        .filter((todo) => todo.scope === scope && todo.parentId === parentId)
        .sort(
          (a, b) =>
            (a.sortOrder === null ? Number.MAX_SAFE_INTEGER : a.sortOrder) -
              (b.sortOrder === null ? Number.MAX_SAFE_INTEGER : b.sortOrder) ||
            a.createdAt.localeCompare(b.createdAt),
        );
      siblings.forEach((todo, index) => {
        todo.sortOrder = index;
      });
    }
  }
  return {
    todos,
    memos: Array.isArray(value?.memos) ? value.memos : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
    routines: Array.isArray(value?.routines)
      ? value.routines.map(cleanRoutine).filter((routine) => routine.id && routine.title)
      : [],
    updatedAt: new Date().toISOString(),
  };
}

async function readData(userId) {
  if (pool) return readPostgresData(userId);

  try {
    const raw = await readFile(dataFile, "utf8");
    return cleanData(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return emptyData();
    throw error;
  }
}

/** 목록을 내려주기 전에 오늘 몫의 루틴 할 일을 만들어 저장한다. */
async function readDataWithRoutines(userId) {
  const data = await readData(userId);
  const created = materializeRoutines(data);
  if (created.length === 0) return data;
  if (pool) {
    await insertTodos(created, userId);
    return data;
  }
  return writeData(data, userId);
}

async function writeData(value, userId) {
  if (pool) return writePostgresData(value, userId);

  const data = cleanData(value);
  const tempFile = `${dataFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempFile, dataFile);
  return data;
}

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists ${quoteIdentifier(memosTable)} (
      id text primary key,
      user_id text not null default 'default',
      body text not null,
      tags text[] not null default '{}',
      created_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${quoteIdentifier(todosTable)} (
      id text primary key,
      user_id text not null default 'default',
      title text not null,
      scope text not null check (scope in ('day', 'week', 'month')),
      done boolean not null default false,
      created_at timestamptz not null,
      completed_at timestamptz,
      source_memo_id text references ${quoteIdentifier(memosTable)}(id) on delete set null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${quoteIdentifier(sessionsTable)} (
      id text primary key,
      user_id text not null default 'default',
      label text not null default '',
      started_at timestamptz not null,
      ended_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${quoteIdentifier(routinesTable)} (
      id text primary key,
      user_id text not null default 'default',
      title text not null,
      weekdays smallint[] not null default '{}',
      category text,
      active boolean not null default true,
      created_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists routine_id text references ${quoteIdentifier(routinesTable)}(id) on delete set null`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_routine_idx`)} on ${quoteIdentifier(todosTable)} (user_id, routine_id, due_date)`);
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists user_id text not null default 'default'`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists user_id text not null default 'default'`);
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists starred boolean not null default false`);
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists title text not null default ''`);
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists sort_order double precision`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists due_date text`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists category text`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists note text`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists parent_id text references ${quoteIdentifier(todosTable)}(id) on delete cascade`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists sort_order double precision`);
  await pool.query(`
    with ranked as (
      select id, row_number() over (
        partition by user_id, scope, parent_id order by created_at asc
      ) - 1 as position
      from ${quoteIdentifier(todosTable)}
      where sort_order is null
    )
    update ${quoteIdentifier(todosTable)} todo
    set sort_order = ranked.position
    from ranked
    where todo.id = ranked.id
  `);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_due_date_idx`)} on ${quoteIdentifier(todosTable)} (user_id, due_date)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${memosTable}_user_created_idx`)} on ${quoteIdentifier(memosTable)} (user_id, created_at desc)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_user_created_idx`)} on ${quoteIdentifier(todosTable)} (user_id, created_at desc)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_tree_order_idx`)} on ${quoteIdentifier(todosTable)} (user_id, scope, parent_id, sort_order)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${sessionsTable}_user_started_idx`)} on ${quoteIdentifier(sessionsTable)} (user_id, started_at desc)`);
}

async function readPostgresData(userId) {
  await ensureSchema();
  const memos = await pool.query(
    `
      select id, title, body, tags, created_at, starred, sort_order
      from ${quoteIdentifier(memosTable)}
      where user_id = $1
      order by sort_order asc nulls last, created_at desc
    `,
    [userId],
  );
  const todos = await pool.query(
    `
      select id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order
      from ${quoteIdentifier(todosTable)}
      where user_id = $1
      order by scope, parent_id nulls first, sort_order asc nulls last, created_at asc
    `,
    [userId],
  );
  const routines = await pool.query(
    `
      select id, title, weekdays, category, active, created_at
      from ${quoteIdentifier(routinesTable)}
      where user_id = $1
      order by created_at asc
    `,
    [userId],
  );
  const sessions = await pool.query(
    `
      select id, label, started_at, ended_at
      from ${quoteIdentifier(sessionsTable)}
      where user_id = $1
      order by started_at desc
    `,
    [userId],
  );
  return {
    memos: memos.rows.map((memo) => ({
      id: memo.id,
      title: memo.title || "",
      body: memo.body,
      tags: memo.tags || [],
      createdAt: memo.created_at.toISOString(),
      starred: memo.starred,
      sortOrder: memo.sort_order === null ? undefined : Number(memo.sort_order),
    })),
    todos: todos.rows.map((todo) => ({
      id: todo.id,
      title: todo.title,
      scope: todo.scope,
      done: todo.done,
      createdAt: todo.created_at.toISOString(),
      completedAt: todo.completed_at ? todo.completed_at.toISOString() : undefined,
      sourceMemoId: todo.source_memo_id || undefined,
      dueDate: todo.due_date || undefined,
      category: todo.category || undefined,
      note: todo.note || undefined,
      parentId: todo.parent_id || undefined,
      routineId: todo.routine_id || undefined,
      sortOrder: todo.sort_order === null ? undefined : Number(todo.sort_order),
    })),
    sessions: sessions.rows.map((session) => ({
      id: session.id,
      label: session.label,
      startedAt: session.started_at.toISOString(),
      endedAt: session.ended_at.toISOString(),
    })),
    routines: routines.rows.map((routine) => ({
      id: routine.id,
      title: routine.title,
      weekdays: (routine.weekdays || []).map(Number),
      category: routine.category || null,
      active: routine.active,
      createdAt: routine.created_at.toISOString(),
    })),
  };
}

/** 루틴이 만든 할 일만 따로 넣는다(전체 재작성 없이). */
async function insertTodos(todos, userId) {
  if (!pool || todos.length === 0) return;
  for (const todo of todos.map(cleanTodo).filter((todo) => todo.id && todo.title)) {
    await pool.query(
      `
        insert into ${quoteIdentifier(todosTable)}
          (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
        on conflict (id) do nothing
      `,
      [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate, todo.category, todo.note, todo.parentId, todo.routineId, todo.sortOrder],
    );
  }
}

async function writePostgresData(value, userId) {
  await ensureSchema();
  const data = cleanData(value);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from ${quoteIdentifier(todosTable)} where user_id = $1`, [userId]);
    await client.query(`delete from ${quoteIdentifier(memosTable)} where user_id = $1`, [userId]);
    await client.query(`delete from ${quoteIdentifier(sessionsTable)} where user_id = $1`, [userId]);
    await client.query(`delete from ${quoteIdentifier(routinesTable)} where user_id = $1`, [userId]);
    for (const routine of data.routines.map(cleanRoutine).filter((routine) => routine.id && routine.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(routinesTable)} (id, user_id, title, weekdays, category, active, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, now())
        `,
        [routine.id, userId, routine.title, routine.weekdays, routine.category, routine.active, routine.createdAt],
      );
    }
    for (const memo of data.memos.map(cleanMemo).filter((memo) => memo.id && (memo.body || memo.title))) {
      await client.query(
        `
          insert into ${quoteIdentifier(memosTable)} (id, user_id, title, body, tags, created_at, starred, sort_order, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, now())
        `,
        [memo.id, userId, memo.title, memo.body, memo.tags, memo.createdAt, memo.starred, memo.sortOrder],
      );
    }
    for (const todo of data.todos.map(cleanTodo).filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
        `,
        [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate, todo.category, todo.note, todo.parentId, todo.routineId, todo.sortOrder],
      );
    }
    for (const session of data.sessions.map(cleanSession).filter((session) => session.id)) {
      await client.query(
        `
          insert into ${quoteIdentifier(sessionsTable)} (id, user_id, label, started_at, ended_at, updated_at)
          values ($1, $2, $3, $4, $5, now())
        `,
        [session.id, userId, session.label, session.startedAt, session.endedAt],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return data;
}

async function createMemoWithTodos(value, userId) {
  if (!pool) {
    const data = await readData(userId);
    const memo = cleanMemo(value.memo);
    if (memo.sortOrder === null) {
      memo.sortOrder = Math.min(0, ...data.memos.map((item) => (Number.isFinite(item.sortOrder) ? item.sortOrder : 0))) - 1;
    }
    const todos = Array.isArray(value.todos) ? value.todos.map(cleanTodo) : [];
    data.memos.unshift(memo);
    for (const todo of todos) {
      if (todo.sortOrder === null) {
        const siblings = data.todos.filter(
          (item) => item.scope === todo.scope && (item.parentId || null) === todo.parentId,
        );
        todo.sortOrder = Math.max(-1, ...siblings.map((item) => Number(item.sortOrder) || 0)) + 1;
      }
      data.todos.push(todo);
    }
    await writeData(data, userId);
    return { memo, todos };
  }

  await ensureSchema();
  const memo = cleanMemo(value.memo);
  const todos = Array.isArray(value.todos) ? value.todos.map(cleanTodo) : [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        insert into ${quoteIdentifier(memosTable)} (id, user_id, title, body, tags, created_at, starred, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7,
          coalesce($8::double precision,
            (select coalesce(min(sort_order), 0) - 1 from ${quoteIdentifier(memosTable)} where user_id = $2)),
          now())
        on conflict (id)
        do update set title = excluded.title, body = excluded.body, tags = excluded.tags, updated_at = now()
      `,
      [memo.id, userId, memo.title, memo.body, memo.tags, memo.createdAt, memo.starred, memo.sortOrder],
    );
    for (const todo of todos.filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            coalesce($13::double precision,
              (select coalesce(max(sort_order), -1) + 1 from ${quoteIdentifier(todosTable)} where user_id = $2 and scope = $4 and parent_id is not distinct from $12)),
            now())
          on conflict (id)
          do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
            completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id,
            due_date = excluded.due_date, category = excluded.category, note = excluded.note,
            parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now()
        `,
        [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate, todo.category, todo.note, todo.parentId, todo.sortOrder],
      );
    }
    await client.query("commit");
    return { memo, todos };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createTodo(value, userId) {
  const todo = cleanTodo(value);
  if (!pool) {
    const data = await readData(userId);
    if (todo.parentId) {
      const parent = data.todos.find((item) => item.id === todo.parentId && !item.parentId);
      if (!parent) throw new Error("Parent todo not found or already nested");
      todo.scope = parent.scope;
    }
    const siblings = data.todos.filter(
      (item) => item.scope === todo.scope && (item.parentId || null) === todo.parentId,
    );
    if (todo.sortOrder === null) {
      todo.sortOrder = Math.max(-1, ...siblings.map((item) => Number(item.sortOrder) || 0)) + 1;
    }
    data.todos.push(todo);
    if (todo.parentId && !todo.done) {
      data.todos = data.todos.map((item) =>
        item.id === todo.parentId ? { ...item, done: false, completedAt: null } : item,
      );
    }
    await writeData(data, userId);
    return todo;
  }

  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (todo.parentId) {
      const parentResult = await client.query(
        `select id, scope, parent_id from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2 for update`,
        [todo.parentId, userId],
      );
      const parent = parentResult.rows[0];
      if (!parent || parent.parent_id) throw new Error("Parent todo not found or already nested");
      todo.scope = parent.scope;
    }
    const result = await client.query(
      `
        insert into ${quoteIdentifier(todosTable)}
          (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          coalesce($13::double precision,
            (select coalesce(max(sort_order), -1) + 1 from ${quoteIdentifier(todosTable)} where user_id = $2 and scope = $4 and parent_id is not distinct from $12)),
          now())
        on conflict (id)
        do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
          completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id,
          due_date = excluded.due_date, category = excluded.category, note = excluded.note,
          parent_id = excluded.parent_id, sort_order = excluded.sort_order, updated_at = now()
        returning sort_order
      `,
      [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate, todo.category, todo.note, todo.parentId, todo.sortOrder],
    );
    if (todo.parentId && !todo.done) {
      await client.query(
        `update ${quoteIdentifier(todosTable)} set done = false, completed_at = null, updated_at = now() where id = $1 and user_id = $2`,
        [todo.parentId, userId],
      );
    }
    await client.query("commit");
    todo.sortOrder = Number(result.rows[0].sort_order);
    return todo;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function createSession(value, userId) {
  const session = cleanSession(value);
  if (!pool) {
    const data = await readData(userId);
    data.sessions.unshift(session);
    await writeData(data, userId);
    return session;
  }

  await ensureSchema();
  await pool.query(
    `
      insert into ${quoteIdentifier(sessionsTable)} (id, user_id, label, started_at, ended_at, updated_at)
      values ($1, $2, $3, $4, $5, now())
      on conflict (id)
      do update set label = excluded.label, started_at = excluded.started_at,
        ended_at = excluded.ended_at, updated_at = now()
    `,
    [session.id, userId, session.label, session.startedAt, session.endedAt],
  );
  return session;
}

async function deleteSessionById(id, userId) {
  if (!pool) {
    const data = await readData(userId);
    data.sessions = data.sessions.filter((session) => session.id !== id);
    await writeData(data, userId);
    return;
  }
  await ensureSchema();
  await pool.query(`delete from ${quoteIdentifier(sessionsTable)} where id = $1 and user_id = $2`, [id, userId]);
}

async function updateTodo(id, patch, userId) {
  if (!pool) {
    const data = await readData(userId);
    const current = data.todos.find((todo) => todo.id === id);
    if (!current) return null;
    const nextPatch = { ...patch };
    if (Object.hasOwn(patch, "dueDate")) nextPatch.dueDate = patch.dueDate || null;
    const updated = cleanTodo({ ...current, ...nextPatch });
    data.todos = data.todos.map((todo) => (todo.id === id ? updated : todo));
    if (current.parentId && typeof patch.done === "boolean") {
      const siblings = data.todos.filter((todo) => todo.parentId === current.parentId);
      const parentDone = siblings.length > 0 && siblings.every((todo) => todo.done);
      data.todos = data.todos.map((todo) =>
        todo.id === current.parentId
          ? { ...todo, done: parentDone, completedAt: parentDone ? new Date().toISOString() : null }
          : todo,
      );
    } else if (!current.parentId) {
      if (typeof patch.done === "boolean") {
        data.todos = data.todos.map((todo) =>
          todo.parentId === id
            ? { ...todo, done: patch.done, completedAt: patch.done ? patch.completedAt || new Date().toISOString() : null }
            : todo,
        );
      }
      if (["day", "week", "month"].includes(patch.scope)) {
        data.todos = data.todos.map((todo) => (todo.parentId === id ? { ...todo, scope: patch.scope } : todo));
      }
    }
    await writeData(data, userId);
    return data.todos.find((todo) => todo.id === id) || null;
  }

  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const currentResult = await client.query(
      `select id, parent_id from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2 for update`,
      [id, userId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("rollback");
      return null;
    }
    const hasDone = typeof patch.done === "boolean";
    const hasDueDate = Object.hasOwn(patch, "dueDate");
    const hasCategory = Object.hasOwn(patch, "category");
    const hasNote = Object.hasOwn(patch, "note");
    const nextScope = ["day", "week", "month"].includes(patch.scope) ? patch.scope : null;
    await client.query(
      `
        update ${quoteIdentifier(todosTable)}
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
        /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? patch.dueDate : null,
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
          `update ${quoteIdentifier(todosTable)} set done = $1, completed_at = $2, updated_at = now() where parent_id = $3 and user_id = $4`,
          [patch.done, patch.done ? patch.completedAt || new Date().toISOString() : null, id, userId],
        );
      }
      if (nextScope) {
        await client.query(
          `update ${quoteIdentifier(todosTable)} set scope = $1, updated_at = now() where parent_id = $2 and user_id = $3`,
          [nextScope, id, userId],
        );
      }
    } else if (hasDone) {
      await client.query(
        `
          update ${quoteIdentifier(todosTable)} parent
          set done = not exists (
              select 1 from ${quoteIdentifier(todosTable)} child
              where child.parent_id = parent.id and child.user_id = $2 and not child.done
            ),
            completed_at = case when not exists (
              select 1 from ${quoteIdentifier(todosTable)} child
              where child.parent_id = parent.id and child.user_id = $2 and not child.done
            ) then now() else null end,
            updated_at = now()
          where parent.id = $1 and parent.user_id = $2
        `,
        [current.parent_id, userId],
      );
    }
    const result = await client.query(
      `select id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2`,
      [id, userId],
    );
    await client.query("commit");
    const todo = result.rows[0];
    return {
      id: todo.id,
      title: todo.title,
      scope: todo.scope,
      done: todo.done,
      createdAt: todo.created_at.toISOString(),
      completedAt: todo.completed_at ? todo.completed_at.toISOString() : undefined,
      sourceMemoId: todo.source_memo_id || undefined,
      dueDate: todo.due_date || undefined,
      category: todo.category || undefined,
      note: todo.note || undefined,
      parentId: todo.parent_id || undefined,
      sortOrder: todo.sort_order === null ? undefined : Number(todo.sort_order),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function validateTodoTree(todos) {
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  for (const todo of todos) {
    if (!todo.parentId) continue;
    const parent = byId.get(todo.parentId);
    if (!parent) throw new Error(`Parent todo not found: ${todo.parentId}`);
    if (parent.parentId) throw new Error("Todo nesting is limited to 2 levels");
    if (parent.scope !== todo.scope) throw new Error("Parent and child must use the same scope");
  }
}

async function reorderTodos(items, userId) {
  const parsedItems = items.map((item, index) => ({
    id: String(item?.id || ""),
    parentId: typeof item?.parentId === "string" && item.parentId ? item.parentId : null,
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    scope: ["day", "week", "month"].includes(item?.scope) ? item.scope : null,
  }));
  if (!pool) {
    const data = await readData(userId);
    const changes = new Map(parsedItems.map((item) => [item.id, item]));
    data.todos = data.todos.map((todo) => {
      const change = changes.get(todo.id);
      return change
        ? { ...todo, parentId: change.parentId, sortOrder: change.sortOrder, scope: change.scope || todo.scope }
        : todo;
    });
    validateTodoTree(data.todos.map(cleanTodo));
    data.todos = data.todos.map((todo) => {
      if (todo.parentId) return todo;
      const children = data.todos.filter((child) => child.parentId === todo.id);
      if (!children.length) return todo;
      const done = children.every((child) => child.done);
      return { ...todo, done, completedAt: done ? todo.completedAt || new Date().toISOString() : null };
    });
    await writeData(data, userId);
    return;
  }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `select id, scope, parent_id from ${quoteIdentifier(todosTable)} where user_id = $1 for update`,
      [userId],
    );
    const ownedIds = new Set(result.rows.map((row) => row.id));
    if (parsedItems.some((item) => !ownedIds.has(item.id) || (item.parentId && !ownedIds.has(item.parentId)))) {
      throw new Error("Todo tree contains an unknown item");
    }
    const changes = new Map(parsedItems.map((item) => [item.id, item]));
    const todos = result.rows.map((row) => {
      const change = changes.get(row.id);
      return {
        id: row.id,
        scope: change?.scope || row.scope,
        parentId: change ? change.parentId : row.parent_id,
      };
    });
    validateTodoTree(todos);
    for (const item of parsedItems) {
      await client.query(
        `update ${quoteIdentifier(todosTable)} set parent_id = $1, sort_order = $2, scope = coalesce($3, scope), updated_at = now() where id = $4 and user_id = $5`,
        [item.parentId, item.sortOrder, item.scope, item.id, userId],
      );
    }
    await client.query(
      `
        update ${quoteIdentifier(todosTable)} parent
        set done = children.done,
          completed_at = case when children.done then coalesce(parent.completed_at, now()) else null end,
          updated_at = now()
        from (
          select parent_id, bool_and(done) as done
          from ${quoteIdentifier(todosTable)}
          where user_id = $1 and parent_id is not null
          group by parent_id
        ) children
        where parent.id = children.parent_id and parent.user_id = $1
      `,
      [userId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function updateMemo(id, patch, userId) {
  if (!pool) {
    const data = await readData(userId);
    data.memos = data.memos.map((memo) => (memo.id === id ? { ...memo, ...patch } : memo));
    await writeData(data, userId);
    return data.memos.find((memo) => memo.id === id) || null;
  }

  await ensureSchema();
  const result = await pool.query(
    `
      update ${quoteIdentifier(memosTable)}
      set starred = coalesce($2, starred),
        title = coalesce($4, title),
        body = coalesce($5, body),
        updated_at = now()
      where id = $1 and user_id = $3
      returning id, title, body, tags, created_at, starred, sort_order
    `,
    [
      id,
      typeof patch.starred === "boolean" ? patch.starred : null,
      userId,
      typeof patch.title === "string" ? patch.title.trim() : null,
      typeof patch.body === "string" ? patch.body.trim() : null,
    ],
  );
  if (!result.rowCount) return null;
  const memo = result.rows[0];
  return {
    id: memo.id,
    title: memo.title || "",
    body: memo.body,
    tags: memo.tags || [],
    createdAt: memo.created_at.toISOString(),
    starred: memo.starred,
    sortOrder: memo.sort_order === null ? undefined : Number(memo.sort_order),
  };
}

async function reorderMemosByIds(ids, userId) {
  if (!pool) {
    const data = await readData(userId);
    const orderById = new Map(ids.map((memoId, index) => [memoId, index]));
    data.memos = data.memos
      .map((memo) => (orderById.has(memo.id) ? { ...memo, sortOrder: orderById.get(memo.id) } : memo))
      .sort(
        (a, b) =>
          (Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER) -
          (Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER),
      );
    await writeData(data, userId);
    return;
  }

  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(
        `update ${quoteIdentifier(memosTable)} set sort_order = $1, updated_at = now() where id = $2 and user_id = $3`,
        [index, ids[index], userId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTodoById(id, userId) {
  if (!pool) {
    const data = await readData(userId);
    const target = data.todos.find((todo) => todo.id === id);
    data.todos = data.todos.filter((todo) => todo.id !== id && todo.parentId !== id);
    if (target?.parentId) {
      const siblings = data.todos.filter((todo) => todo.parentId === target.parentId);
      if (siblings.length) {
        const done = siblings.every((todo) => todo.done);
        data.todos = data.todos.map((todo) =>
          todo.id === target.parentId ? { ...todo, done, completedAt: done ? new Date().toISOString() : null } : todo,
        );
      }
    }
    await writeData(data, userId);
    return;
  }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const target = await client.query(
      `select parent_id from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2 for update`,
      [id, userId],
    );
    await client.query(`delete from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2`, [id, userId]);
    const parentId = target.rows[0]?.parent_id;
    if (parentId) {
      await client.query(
        `
          update ${quoteIdentifier(todosTable)} parent
          set done = not exists (
              select 1 from ${quoteIdentifier(todosTable)} child
              where child.parent_id = parent.id and child.user_id = $2 and not child.done
            ),
            completed_at = case when not exists (
              select 1 from ${quoteIdentifier(todosTable)} child
              where child.parent_id = parent.id and child.user_id = $2 and not child.done
            ) then now() else null end,
            updated_at = now()
          where parent.id = $1 and parent.user_id = $2
            and exists (select 1 from ${quoteIdentifier(todosTable)} child where child.parent_id = parent.id and child.user_id = $2)
        `,
        [parentId, userId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMemoById(id, userId) {
  if (!pool) {
    const data = await readData(userId);
    data.memos = data.memos.filter((memo) => memo.id !== id);
    await writeData(data, userId);
    return;
  }
  await ensureSchema();
  await pool.query(`delete from ${quoteIdentifier(memosTable)} where id = $1 and user_id = $2`, [id, userId]);
}

async function createRoutine(value, userId) {
  const routine = cleanRoutine({ ...value, id: value?.id || randomUUID(), createdAt: new Date().toISOString() });
  if (!routine.title) throw new Error("Routine title is required");

  if (pool) {
    await ensureSchema();
    await pool.query(
      `
        insert into ${quoteIdentifier(routinesTable)} (id, user_id, title, weekdays, category, active, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
      `,
      [routine.id, userId, routine.title, routine.weekdays, routine.category, routine.active, routine.createdAt],
    );
    return routine;
  }

  const data = await readData(userId);
  data.routines.push(routine);
  await writeData(data, userId);
  return routine;
}

async function updateRoutine(id, patch, userId) {
  const fields = {};
  if (typeof patch?.title === "string" && patch.title.trim()) fields.title = patch.title.trim();
  if (Array.isArray(patch?.weekdays)) fields.weekdays = cleanRoutine(patch).weekdays;
  if (patch?.category !== undefined) {
    fields.category = typeof patch.category === "string" && patch.category.trim() ? patch.category.trim() : null;
  }
  if (patch?.active !== undefined) fields.active = Boolean(patch.active);

  if (pool) {
    await ensureSchema();
    const existing = await pool.query(
      `select id, title, weekdays, category, active, created_at from ${quoteIdentifier(routinesTable)} where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (existing.rowCount === 0) return null;
    const current = existing.rows[0];
    const next = cleanRoutine({
      id,
      title: fields.title ?? current.title,
      weekdays: fields.weekdays ?? (current.weekdays || []).map(Number),
      category: fields.category !== undefined ? fields.category : current.category,
      active: fields.active !== undefined ? fields.active : current.active,
      createdAt: current.created_at.toISOString(),
    });
    await pool.query(
      `
        update ${quoteIdentifier(routinesTable)}
        set title = $3, weekdays = $4, category = $5, active = $6, updated_at = now()
        where id = $1 and user_id = $2
      `,
      [id, userId, next.title, next.weekdays, next.category, next.active],
    );
    return next;
  }

  const data = await readData(userId);
  const index = data.routines.findIndex((routine) => routine.id === id);
  if (index < 0) return null;
  data.routines[index] = cleanRoutine({ ...data.routines[index], ...fields });
  await writeData(data, userId);
  return data.routines[index];
}

/** 루틴을 지워도 이미 만들어진 할 일은 남긴다(지난 기록이므로). */
async function deleteRoutineById(id, userId) {
  if (pool) {
    await ensureSchema();
    await pool.query(`delete from ${quoteIdentifier(routinesTable)} where id = $1 and user_id = $2`, [id, userId]);
    return;
  }
  const data = await readData(userId);
  data.routines = data.routines.filter((routine) => routine.id !== id);
  data.todos = data.todos.map((todo) => (todo.routineId === id ? { ...todo, routineId: null } : todo));
  await writeData(data, userId);
}

/* ── 오래된 완료 할 일 보관: 완료된 지 N개월 지난 항목을 이메일로 보내고, 발송이 성공한 경우에만 삭제 ── */

function archiveCutoffIso() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - archiveAfterMonths);
  return cutoff.toISOString();
}

/** 보관 대상: 완료된 지 오래된 최상위 할 일 + 그 하위 목표 전부. 미완료 항목은 절대 건드리지 않는다. */
function collectArchivable(todos, cutoffIso) {
  const archived = [];
  for (const todo of todos) {
    if (todo.parentId) continue;
    if (!todo.done || !todo.completedAt || todo.completedAt >= cutoffIso) continue;
    const children = todos.filter((child) => child.parentId === todo.id);
    if (children.some((child) => !child.done)) continue;
    archived.push(todo, ...children);
  }
  return archived;
}

async function lookupArchiveEmail(userId) {
  if (userId === "default") return archiveFallbackEmail || null;
  if (!supabaseUrl || !supabaseServiceRoleKey) return archiveFallbackEmail || null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}` },
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.email || null;
  } catch {
    return null;
  }
}

function formatArchiveDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function sendArchiveEmail(to, todos) {
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const scopeNames = { day: "오늘", week: "이번 주", month: "이번 달" };
  const lines = todos
    .filter((todo) => !todo.parentId)
    .map((todo) => {
      const children = todos.filter((child) => child.parentId === todo.id);
      const childLines = children.map((child) => `    - ${child.title}`);
      const tags = [formatArchiveDate(todo.completedAt), scopeNames[todo.scope] || todo.scope, todo.category]
        .filter(Boolean)
        .join(" · ");
      return [`[${tags}] ${todo.title}${todo.note ? `\n    메모: ${todo.note}` : ""}`, ...childLines].join("\n");
    });
  const today = todayInAppZone().key;
  await transport.sendMail({
    from: `Todo <${smtpUser}>`,
    to,
    subject: `[Todo] 완료 ${archiveAfterMonths}개월 지난 할 일 ${lines.length}개 보관`,
    text: [
      `완료된 지 ${archiveAfterMonths}개월이 지난 할 일을 보관하고 목록에서 삭제했습니다.`,
      "",
      ...lines,
      "",
      "전체 데이터는 첨부된 JSON에 있습니다. 웹앱에 다시 넣고 싶으면 이 파일을 보관해 두세요.",
    ].join("\n"),
    attachments: [
      {
        filename: `todo-archive-${today}.json`,
        content: `${JSON.stringify(todos, null, 2)}\n`,
        contentType: "application/json",
      },
    ],
  });
}

async function deleteArchivedTodos(ids, userId) {
  if (!pool) {
    const data = await readData(userId);
    const removed = new Set(ids);
    data.todos = data.todos.filter((todo) => !removed.has(todo.id));
    await writeData(data, userId);
    return;
  }
  await pool.query(`delete from ${quoteIdentifier(todosTable)} where user_id = $1 and id = any($2::text[])`, [
    userId,
    ids,
  ]);
}

async function archiveUserIds(cutoffIso) {
  if (!pool) return ["default"];
  const result = await pool.query(
    `select distinct user_id from ${quoteIdentifier(todosTable)} where done and completed_at < $1`,
    [cutoffIso],
  );
  return result.rows.map((row) => row.user_id);
}

let archiveSweepRunning = false;

async function runArchiveSweep() {
  // 스윕이 겹치면 같은 항목이 두 번 메일로 나갈 수 있다.
  if (archiveSweepRunning) return;
  archiveSweepRunning = true;
  try {
    await archiveSweepOnce();
  } finally {
    archiveSweepRunning = false;
  }
}

async function archiveSweepOnce() {
  const cutoffIso = archiveCutoffIso();
  for (const userId of await archiveUserIds(cutoffIso)) {
    try {
      const data = await readData(userId);
      const archived = collectArchivable(data.todos, cutoffIso);
      if (archived.length === 0) continue;
      const email = await lookupArchiveEmail(userId);
      if (!email) {
        console.error(`archive: no email for user ${userId}, skipping ${archived.length} todos`);
        continue;
      }
      // 메일이 실제로 나간 뒤에만 지운다. 실패하면 다음 스윕에서 다시 시도한다.
      await sendArchiveEmail(email, archived);
      await deleteArchivedTodos(archived.map((todo) => todo.id), userId);
      console.log(`archive: exported ${archived.length} todos to ${email} (user ${userId})`);
    } catch (error) {
      console.error(`archive: sweep failed for user ${userId}: ${error.message}`);
    }
  }
}

if (archiveEnabled) {
  setTimeout(() => runArchiveSweep().catch((error) => console.error(`archive: ${error.message}`)), Math.min(30_000, archiveIntervalMs));
  setInterval(() => runArchiveSweep().catch((error) => console.error(`archive: ${error.message}`)), archiveIntervalMs);
  console.log(`archive: enabled (older than ${archiveAfterMonths} months, every ${Math.round(archiveIntervalMs / 60000)}m)`);
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) {
      throw new Error("Request body too large");
    }
  }
  return body;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    let database = "none";
    if (pool) {
      try {
        await pool.query("select 1");
        database = "ok";
      } catch (error) {
        database = `error: ${error.message}`;
      }
    }
    json(response, database.startsWith("error") ? 503 : 200, {
      ok: !database.startsWith("error"),
      storage: pool ? "postgres" : "file",
      database,
    });
    return;
  }

  if (pathname === "/api/session" && request.method === "GET") {
    json(response, 200, {
      authenticated: !googleAuthEnabled ? true : await isAuthorized(request),
      loginRequired: googleAuthEnabled,
      googleEnabled: googleAuthEnabled,
    });
    return;
  }

  if (!(await isAuthorized(request))) {
    json(response, 401, { error: "Unauthorized" });
    return;
  }
  const userId = await getRequestUserId(request);
  if (!userId) {
    json(response, 401, { error: "Unauthorized" });
    return;
  }

  if (pathname === "/api/memos" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createMemoWithTodos(JSON.parse(body || "{}"), userId));
    return;
  }

  if (pathname === "/api/todos" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createTodo(JSON.parse(body || "{}"), userId));
    return;
  }

  if (pathname === "/api/todos/order" && request.method === "PUT") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    await reorderTodos(items, userId);
    json(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/sessions" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createSession(JSON.parse(body || "{}"), userId));
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && request.method === "DELETE") {
    await deleteSessionById(decodeURIComponent(sessionMatch[1]), userId);
    json(response, 200, { ok: true });
    return;
  }

  const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "PATCH") {
    const body = await readRequestBody(request);
    const todo = await updateTodo(decodeURIComponent(todoMatch[1]), JSON.parse(body || "{}"), userId);
    if (!todo) {
      json(response, 404, { error: "Todo not found" });
      return;
    }
    json(response, 200, todo);
    return;
  }

  if (todoMatch && request.method === "DELETE") {
    await deleteTodoById(decodeURIComponent(todoMatch[1]), userId);
    json(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/memos/order" && request.method === "PUT") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const ids = Array.isArray(parsed.ids) ? parsed.ids.map(String).filter(Boolean) : [];
    await reorderMemosByIds(ids, userId);
    json(response, 200, { ok: true });
    return;
  }

  const memoMatch = pathname.match(/^\/api\/memos\/([^/]+)$/);
  if (memoMatch && request.method === "PATCH") {
    const body = await readRequestBody(request);
    const memo = await updateMemo(decodeURIComponent(memoMatch[1]), JSON.parse(body || "{}"), userId);
    if (!memo) {
      json(response, 404, { error: "Memo not found" });
      return;
    }
    json(response, 200, memo);
    return;
  }

  if (memoMatch && request.method === "DELETE") {
    await deleteMemoById(decodeURIComponent(memoMatch[1]), userId);
    json(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/routines" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createRoutine(JSON.parse(body || "{}"), userId));
    return;
  }

  const routineMatch = pathname.match(/^\/api\/routines\/([^/]+)$/);
  if (routineMatch && request.method === "PATCH") {
    const body = await readRequestBody(request);
    const routine = await updateRoutine(decodeURIComponent(routineMatch[1]), JSON.parse(body || "{}"), userId);
    if (!routine) {
      json(response, 404, { error: "Routine not found" });
      return;
    }
    json(response, 200, routine);
    return;
  }

  if (routineMatch && request.method === "DELETE") {
    await deleteRoutineById(decodeURIComponent(routineMatch[1]), userId);
    json(response, 200, { ok: true });
    return;
  }

  if (pathname !== "/api/data") {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (request.method === "GET") {
    json(response, 200, await readDataWithRoutines(userId));
    return;
  }

  if (request.method === "PUT") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    json(response, 200, await writeData(parsed, userId));
    return;
  }

  json(response, 405, { error: "Method not allowed" });
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    applyCors(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    json(response, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Todo listening on http://0.0.0.0:${port}`);
});
