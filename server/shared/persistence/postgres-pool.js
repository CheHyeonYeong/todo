import pg from "pg";

export function createPool(databaseUrl) {
  if (!databaseUrl) return null;
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    max: 3,
    idleTimeoutMillis: 30_000,
  });
}

export function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

/** 설정에 담긴 테이블 이름을 검증된 인용 식별자로 한 번에 바꿔 둔다. */
export function quoteTableNames(tables) {
  return Object.fromEntries(
    Object.entries(tables).map(([key, name]) => [key, { raw: name, sql: quoteIdentifier(name) }]),
  );
}
