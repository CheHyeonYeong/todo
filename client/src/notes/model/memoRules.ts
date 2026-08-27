import type { Memo } from "../../types";

export function visibleMemos(memos: Memo[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return [...memos]
    .filter((memo) => {
      if (!normalizedQuery) return true;
      return [memo.title, memo.body, ...memo.tags].some((value) =>
        value?.toLowerCase().includes(normalizedQuery),
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
