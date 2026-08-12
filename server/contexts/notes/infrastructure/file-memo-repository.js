import { MemoRepository } from "../application/ports.js";

export class FileMemoRepository extends MemoRepository {
  capture(memo, { snapshot }) {
    if (memo.sortOrder === null) {
      // 새 메모는 항상 목록 맨 위로 간다.
      memo.sortOrder = Math.min(0, ...snapshot.memos.map((item) => (Number.isFinite(item.sortOrder) ? item.sortOrder : 0))) - 1;
    }
    snapshot.memos.unshift(memo);
    return memo;
  }

  update(id, patch, { snapshot }) {
    snapshot.memos = snapshot.memos.map((memo) => (memo.id === id ? { ...memo, ...patch } : memo));
    return snapshot.memos.find((memo) => memo.id === id) || null;
  }

  remove(id, { snapshot }) {
    snapshot.memos = snapshot.memos.filter((memo) => memo.id !== id);
  }

  reorder(ids, { snapshot }) {
    const orderById = new Map(ids.map((memoId, index) => [memoId, index]));
    snapshot.memos = snapshot.memos
      .map((memo) => (orderById.has(memo.id) ? { ...memo, sortOrder: orderById.get(memo.id) } : memo))
      .sort(
        (a, b) =>
          (Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER) -
          (Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER),
      );
  }
}
