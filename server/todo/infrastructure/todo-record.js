/** 테이블 행 ↔ API 표현 사이의 번역. 도메인 언어와 SQL 컬럼 이름이 만나는 유일한 곳이다. */

export const TODO_COLUMNS =
  "id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, routine_id, sort_order";

/** 하위 호환: PATCH 응답은 예전부터 routine_id를 담지 않는다. */
export const TODO_COLUMNS_WITHOUT_ROUTINE =
  "id, title, scope, done, created_at, completed_at, source_memo_id, due_date, category, note, parent_id, sort_order";

export function todoFromRow(row) {
  const todo = {
    id: row.id,
    title: row.title,
    scope: row.scope,
    done: row.done,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
    sourceMemoId: row.source_memo_id || undefined,
    dueDate: row.due_date || undefined,
    category: row.category || undefined,
    note: row.note || undefined,
    parentId: row.parent_id || undefined,
  };
  if (Object.hasOwn(row, "routine_id")) todo.routineId = row.routine_id || undefined;
  todo.sortOrder = row.sort_order === null ? undefined : Number(row.sort_order);
  return todo;
}

export function todoValues(todo, userId) {
  return [
    todo.id, userId, todo.title, todo.scope, todo.done, todo.createdAt, todo.completedAt,
    todo.sourceMemoId, todo.dueDate, todo.category, todo.note, todo.parentId, todo.sortOrder,
  ];
}
