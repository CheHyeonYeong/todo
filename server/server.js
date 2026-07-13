import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = process.env.PUBLIC_DIR || join(__dirname, "../client");
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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
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
  };
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
  };
}

function cleanMemo(memo) {
  return {
    id: String(memo?.id || ""),
    body: String(memo?.body || "").trim(),
    createdAt: memo?.createdAt || new Date().toISOString(),
    tags: Array.isArray(memo?.tags) ? memo.tags.map(String) : [],
    starred: Boolean(memo?.starred),
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
  return {
    todos: Array.isArray(value?.todos) ? value.todos : [],
    memos: Array.isArray(value?.memos) ? value.memos : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
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

async function writeData(value, userId) {
  if (pool) return writePostgresData(value, userId);

  const data = cleanData(value);
  const tempFile = `${dataFile}.tmp`;
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
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists user_id text not null default 'default'`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists user_id text not null default 'default'`);
  await pool.query(`alter table ${quoteIdentifier(memosTable)} add column if not exists starred boolean not null default false`);
  await pool.query(`alter table ${quoteIdentifier(todosTable)} add column if not exists due_date text`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_due_date_idx`)} on ${quoteIdentifier(todosTable)} (user_id, due_date)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${memosTable}_user_created_idx`)} on ${quoteIdentifier(memosTable)} (user_id, created_at desc)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${todosTable}_user_created_idx`)} on ${quoteIdentifier(todosTable)} (user_id, created_at desc)`);
  await pool.query(`create index if not exists ${quoteIdentifier(`${sessionsTable}_user_started_idx`)} on ${quoteIdentifier(sessionsTable)} (user_id, started_at desc)`);
}

async function readPostgresData(userId) {
  await ensureSchema();
  const memos = await pool.query(
    `
      select id, body, tags, created_at, starred
      from ${quoteIdentifier(memosTable)}
      where user_id = $1
      order by created_at desc
    `,
    [userId],
  );
  const todos = await pool.query(
    `
      select id, title, scope, done, created_at, completed_at, source_memo_id, due_date
      from ${quoteIdentifier(todosTable)}
      where user_id = $1
      order by created_at desc
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
      body: memo.body,
      tags: memo.tags || [],
      createdAt: memo.created_at.toISOString(),
      starred: memo.starred,
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
    })),
    sessions: sessions.rows.map((session) => ({
      id: session.id,
      label: session.label,
      startedAt: session.started_at.toISOString(),
      endedAt: session.ended_at.toISOString(),
    })),
  };
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
    for (const memo of data.memos.map(cleanMemo).filter((memo) => memo.id && memo.body)) {
      await client.query(
        `
          insert into ${quoteIdentifier(memosTable)} (id, user_id, body, tags, created_at, starred, updated_at)
          values ($1, $2, $3, $4, $5, $6, now())
        `,
        [memo.id, userId, memo.body, memo.tags, memo.createdAt, memo.starred],
      );
    }
    for (const todo of data.todos.map(cleanTodo).filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        `,
        [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate],
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
    const todos = Array.isArray(value.todos) ? value.todos.map(cleanTodo) : [];
    data.memos.unshift(memo);
    data.todos.unshift(...todos);
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
        insert into ${quoteIdentifier(memosTable)} (id, user_id, body, tags, created_at, starred, updated_at)
        values ($1, $2, $3, $4, $5, $6, now())
        on conflict (id)
        do update set body = excluded.body, tags = excluded.tags, updated_at = now()
      `,
      [memo.id, userId, memo.body, memo.tags, memo.createdAt, memo.starred],
    );
    for (const todo of todos.filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          on conflict (id)
          do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
            completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id,
            due_date = excluded.due_date, updated_at = now()
        `,
        [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate],
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
    data.todos.unshift(todo);
    await writeData(data, userId);
    return todo;
  }

  await ensureSchema();
  await pool.query(
    `
      insert into ${quoteIdentifier(todosTable)}
        (id, user_id, title, scope, done, created_at, completed_at, source_memo_id, due_date, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      on conflict (id)
      do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
        completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id,
        due_date = excluded.due_date, updated_at = now()
    `,
    [todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId, todo.dueDate],
  );
  return todo;
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
    data.todos = data.todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo));
    await writeData(data, userId);
    return data.todos.find((todo) => todo.id === id) || null;
  }

  await ensureSchema();
  const result = await pool.query(
    `
      update ${quoteIdentifier(todosTable)}
      set done = coalesce($2, done),
        completed_at = case when $2::boolean is null then completed_at else $3 end,
        due_date = coalesce($5, due_date),
        title = coalesce($6, title),
        updated_at = now()
      where id = $1 and user_id = $4
      returning id, title, scope, done, created_at, completed_at, source_memo_id, due_date
    `,
    [
      id,
      typeof patch.done === "boolean" ? patch.done : null,
      patch.completedAt || null,
      userId,
      /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? patch.dueDate : null,
      typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : null,
    ],
  );
  if (!result.rowCount) return null;
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
  };
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
        updated_at = now()
      where id = $1 and user_id = $3
      returning id, body, tags, created_at, starred
    `,
    [id, typeof patch.starred === "boolean" ? patch.starred : null, userId],
  );
  if (!result.rowCount) return null;
  const memo = result.rows[0];
  return {
    id: memo.id,
    body: memo.body,
    tags: memo.tags || [],
    createdAt: memo.created_at.toISOString(),
    starred: memo.starred,
  };
}

async function deleteTodoById(id, userId) {
  if (!pool) {
    const data = await readData(userId);
    data.todos = data.todos.filter((todo) => todo.id !== id);
    await writeData(data, userId);
    return;
  }
  await ensureSchema();
  await pool.query(`delete from ${quoteIdentifier(todosTable)} where id = $1 and user_id = $2`, [id, userId]);
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
    json(response, 200, {
      ok: true,
      storage: pool ? "postgres" : "file",
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

  if (pathname !== "/api/data") {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (request.method === "GET") {
    json(response, 200, await readData(userId));
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
  console.log(`Free ADHD Memo listening on http://0.0.0.0:${port}`);
});
