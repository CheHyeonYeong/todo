import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = __dirname;
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || join(__dirname, "data", "store.json");
const token = process.env.MEMO_TOKEN || "";
const sessionSecret = process.env.SESSION_SECRET || token || randomBytes(32).toString("hex");
const maxBodyBytes = 1024 * 1024 * 2;
const databaseUrl = process.env.DATABASE_URL || "";
const stateId = process.env.MEMO_STATE_ID || "default";
const tableName = process.env.MEMO_TABLE || "memo_state";
const todosTable = process.env.TODOS_TABLE || "todos";
const memosTable = process.env.MEMOS_TABLE || "memos";
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

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function signSession(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionCookie() {
  const issuedAt = Date.now().toString();
  const session = `${issuedAt}.${signSession(issuedAt)}`;
  return `memo_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`;
}

function clearSessionCookie() {
  return "memo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function hasValidSession(request) {
  const session = parseCookies(request).memo_session;
  if (!session) return false;
  const [issuedAt, signature] = session.split(".");
  if (!issuedAt || !signature) return false;

  const expected = signSession(issuedAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function isAuthorized(request) {
  if (!token) return true;
  return hasValidSession(request) || request.headers.authorization === `Bearer ${token}`;
}

function emptyData() {
  return {
    todos: [],
    memos: [],
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
  };
}

function cleanMemo(memo) {
  return {
    id: String(memo?.id || ""),
    body: String(memo?.body || "").trim(),
    createdAt: memo?.createdAt || new Date().toISOString(),
    tags: Array.isArray(memo?.tags) ? memo.tags.map(String) : [],
  };
}

function cleanData(value) {
  return {
    todos: Array.isArray(value?.todos) ? value.todos : [],
    memos: Array.isArray(value?.memos) ? value.memos : [],
    updatedAt: new Date().toISOString(),
  };
}

async function readData() {
  if (pool) return readPostgresData();

  try {
    const raw = await readFile(dataFile, "utf8");
    return cleanData(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return emptyData();
    throw error;
  }
}

async function writeData(value) {
  if (pool) return writePostgresData(value);

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
    create table if not exists ${quoteIdentifier(tableName)} (
      id text primary key,
      data jsonb not null default '{"todos":[],"memos":[]}'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${quoteIdentifier(memosTable)} (
      id text primary key,
      body text not null,
      tags text[] not null default '{}',
      created_at timestamptz not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${quoteIdentifier(todosTable)} (
      id text primary key,
      title text not null,
      scope text not null check (scope in ('day', 'week', 'month')),
      done boolean not null default false,
      created_at timestamptz not null,
      completed_at timestamptz,
      source_memo_id text references ${quoteIdentifier(memosTable)}(id) on delete set null,
      updated_at timestamptz not null default now()
    )
  `);
}

async function readPostgresData() {
  await ensureSchema();
  const memos = await pool.query(
    `
      select id, body, tags, created_at
      from ${quoteIdentifier(memosTable)}
      order by created_at desc
    `,
  );
  const todos = await pool.query(
    `
      select id, title, scope, done, created_at, completed_at, source_memo_id
      from ${quoteIdentifier(todosTable)}
      order by created_at desc
    `,
  );
  if (memos.rowCount || todos.rowCount) {
    return {
      memos: memos.rows.map((memo) => ({
        id: memo.id,
        body: memo.body,
        tags: memo.tags || [],
        createdAt: memo.created_at.toISOString(),
      })),
      todos: todos.rows.map((todo) => ({
        id: todo.id,
        title: todo.title,
        scope: todo.scope,
        done: todo.done,
        createdAt: todo.created_at.toISOString(),
        completedAt: todo.completed_at ? todo.completed_at.toISOString() : undefined,
        sourceMemoId: todo.source_memo_id || undefined,
      })),
    };
  }

  const result = await pool.query(`select data from ${quoteIdentifier(tableName)} where id = $1 limit 1`, [stateId]);
  if (!result.rowCount) return emptyData();
  return cleanData(result.rows[0].data || emptyData());
}

async function writePostgresData(value) {
  await ensureSchema();
  const data = cleanData(value);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from ${quoteIdentifier(todosTable)}`);
    await client.query(`delete from ${quoteIdentifier(memosTable)}`);
    for (const memo of data.memos.map(cleanMemo).filter((memo) => memo.id && memo.body)) {
      await client.query(
        `
          insert into ${quoteIdentifier(memosTable)} (id, body, tags, created_at, updated_at)
          values ($1, $2, $3, $4, now())
        `,
        [memo.id, memo.body, memo.tags, memo.createdAt],
      );
    }
    for (const todo of data.todos.map(cleanTodo).filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, title, scope, done, created_at, completed_at, source_memo_id, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, now())
        `,
        [todo.id, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId],
      );
    }
    await client.query(
      `
        insert into ${quoteIdentifier(tableName)} (id, data, updated_at)
        values ($1, $2::jsonb, $3)
        on conflict (id)
        do update set data = excluded.data, updated_at = excluded.updated_at
      `,
      [stateId, JSON.stringify(data), data.updatedAt],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return data;
}

async function createMemoWithTodos(value) {
  if (!pool) {
    const data = await readData();
    const memo = cleanMemo(value.memo);
    const todos = Array.isArray(value.todos) ? value.todos.map(cleanTodo) : [];
    data.memos.unshift(memo);
    data.todos.unshift(...todos);
    await writeData(data);
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
        insert into ${quoteIdentifier(memosTable)} (id, body, tags, created_at, updated_at)
        values ($1, $2, $3, $4, now())
        on conflict (id)
        do update set body = excluded.body, tags = excluded.tags, updated_at = now()
      `,
      [memo.id, memo.body, memo.tags, memo.createdAt],
    );
    for (const todo of todos.filter((todo) => todo.id && todo.title)) {
      await client.query(
        `
          insert into ${quoteIdentifier(todosTable)}
            (id, title, scope, done, created_at, completed_at, source_memo_id, updated_at)
          values ($1, $2, $3, $4, $5, $6, $7, now())
          on conflict (id)
          do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
            completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id, updated_at = now()
        `,
        [todo.id, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId],
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

async function createTodo(value) {
  const todo = cleanTodo(value);
  if (!pool) {
    const data = await readData();
    data.todos.unshift(todo);
    await writeData(data);
    return todo;
  }

  await ensureSchema();
  await pool.query(
    `
      insert into ${quoteIdentifier(todosTable)}
        (id, title, scope, done, created_at, completed_at, source_memo_id, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (id)
      do update set title = excluded.title, scope = excluded.scope, done = excluded.done,
        completed_at = excluded.completed_at, source_memo_id = excluded.source_memo_id, updated_at = now()
    `,
    [todo.id, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt, todo.sourceMemoId],
  );
  return todo;
}

async function updateTodo(id, patch) {
  if (!pool) {
    const data = await readData();
    data.todos = data.todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo));
    await writeData(data);
    return data.todos.find((todo) => todo.id === id) || null;
  }

  await ensureSchema();
  const result = await pool.query(
    `
      update ${quoteIdentifier(todosTable)}
      set done = coalesce($2, done),
        completed_at = $3,
        updated_at = now()
      where id = $1
      returning id, title, scope, done, created_at, completed_at, source_memo_id
    `,
    [id, typeof patch.done === "boolean" ? patch.done : null, patch.completedAt || null],
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
  };
}

async function deleteTodoById(id) {
  if (!pool) {
    const data = await readData();
    data.todos = data.todos.filter((todo) => todo.id !== id);
    await writeData(data);
    return;
  }
  await ensureSchema();
  await pool.query(`delete from ${quoteIdentifier(todosTable)} where id = $1`, [id]);
}

async function deleteMemoById(id) {
  if (!pool) {
    const data = await readData();
    data.memos = data.memos.filter((memo) => memo.id !== id);
    await writeData(data);
    return;
  }
  await ensureSchema();
  await pool.query(`delete from ${quoteIdentifier(memosTable)} where id = $1`, [id]);
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
      authenticated: !token || isAuthorized(request),
      loginRequired: Boolean(token),
    });
    return;
  }

  if (pathname === "/api/login" && request.method === "POST") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    if (!token || parsed.password === token) {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": createSessionCookie(),
      });
      response.end(JSON.stringify({ ok: true, authToken: token || "" }));
      return;
    }
    json(response, 401, { error: "Invalid password" });
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!isAuthorized(request)) {
    json(response, 401, { error: "Unauthorized" });
    return;
  }

  if (pathname === "/api/memos" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createMemoWithTodos(JSON.parse(body || "{}")));
    return;
  }

  if (pathname === "/api/todos" && request.method === "POST") {
    const body = await readRequestBody(request);
    json(response, 201, await createTodo(JSON.parse(body || "{}")));
    return;
  }

  const todoMatch = pathname.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "PATCH") {
    const body = await readRequestBody(request);
    const todo = await updateTodo(decodeURIComponent(todoMatch[1]), JSON.parse(body || "{}"));
    if (!todo) {
      json(response, 404, { error: "Todo not found" });
      return;
    }
    json(response, 200, todo);
    return;
  }

  if (todoMatch && request.method === "DELETE") {
    await deleteTodoById(decodeURIComponent(todoMatch[1]));
    json(response, 200, { ok: true });
    return;
  }

  const memoMatch = pathname.match(/^\/api\/memos\/([^/]+)$/);
  if (memoMatch && request.method === "DELETE") {
    await deleteMemoById(decodeURIComponent(memoMatch[1]));
    json(response, 200, { ok: true });
    return;
  }

  if (pathname !== "/api/data") {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (request.method === "GET") {
    json(response, 200, await readData());
    return;
  }

  if (request.method === "PUT") {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    json(response, 200, await writeData(parsed));
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
