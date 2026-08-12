export const MEMO_COLUMNS = "id, title, body, tags, created_at, starred, sort_order";

export function memoFromRow(row) {
  return {
    id: row.id,
    title: row.title || "",
    body: row.body,
    tags: row.tags || [],
    createdAt: row.created_at.toISOString(),
    starred: row.starred,
    sortOrder: row.sort_order === null ? undefined : Number(row.sort_order),
  };
}
