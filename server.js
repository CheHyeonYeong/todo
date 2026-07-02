import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = __dirname;
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || join(__dirname, "data", "store.json");
const token = process.env.MEMO_TOKEN || "";
const maxBodyBytes = 1024 * 1024 * 2;
const databaseUrl = process.env.DATABASE_URL || "";
const stateId = process.env.MEMO_STATE_ID || "default";
const tableName = process.env.MEMO_TABLE || "memo_state";
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

function isAuthorized(request) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

function emptyData() {
  return {
    todos: [],
    memos: [],
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
}

async function readPostgresData() {
  await ensureSchema();
  const result = await pool.query(`select data from ${quoteIdentifier(tableName)} where id = $1 limit 1`, [stateId]);
  if (!result.rowCount) return emptyData();
  return cleanData(result.rows[0].data || emptyData());
}

async function writePostgresData(value) {
  await ensureSchema();
  const data = cleanData(value);
  await pool.query(
    `
      insert into ${quoteIdentifier(tableName)} (id, data, updated_at)
      values ($1, $2::jsonb, $3)
      on conflict (id)
      do update set data = excluded.data, updated_at = excluded.updated_at
    `,
    [stateId, JSON.stringify(data), data.updatedAt],
  );
  return data;
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

  if (pathname !== "/api/data") {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (!isAuthorized(request)) {
    json(response, 401, { error: "Unauthorized" });
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
