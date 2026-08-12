import { Memo } from "../../notes/domain/memo.js";
import { Todo } from "../../planning/domain/todo.js";
import { TodoTree } from "../../planning/domain/todo-tree.js";
import { Routine } from "../../routines/domain/routine.js";
import { TimeSession } from "../../time-tracking/domain/time-session.js";

/**
 * 애그리게이트 루트: 한 사용자의 워크스페이스 전체 스냅샷.
 *
 * 개별 유스케이스(할 일 추가, 메모 수정 …)는 각 컨텍스트가 자기 애그리게이트로 처리한다.
 * 이 스냅샷은 전체를 통째로 읽고 쓰는 경계(/api/data, 파일 저장)에서만 쓰이며,
 * 그때 지켜져야 할 불변식 — 트리 규칙과 형제 순서 — 을 소유한다.
 */
export class WorkspaceSnapshot {
  constructor(value = {}, { now = () => new Date() } = {}) {
    this.now = now;
    this.todos = Array.isArray(value.todos) ? value.todos.map((item) => Todo.from(item, now)) : [];
    this.memos = Array.isArray(value.memos) ? value.memos.map((item) => Memo.from(item, now)) : [];
    this.sessions = Array.isArray(value.sessions) ? value.sessions.map((item) => TimeSession.from(item, now)) : [];
    this.routines = Array.isArray(value.routines)
      ? value.routines.map((item) => Routine.from(item, now)).filter((item) => item.isComplete)
      : [];
    TodoTree.validate(this.todos);
    this.normalizeOrder();
  }

  normalizeOrder() {
    for (const scope of ["day", "week", "month"]) {
      const parentIds = new Set([null, ...this.todos.filter((todo) => todo.scope === scope).map((todo) => todo.parentId)]);
      for (const parentId of parentIds) {
        this.todos
          .filter((todo) => todo.scope === scope && todo.parentId === parentId)
          .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
            || a.createdAt.localeCompare(b.createdAt))
          .forEach((todo, index) => { todo.sortOrder = index; });
      }
    }
  }

  toJSON() {
    return {
      todos: this.todos.map((item) => item.toJSON()), memos: this.memos.map((item) => item.toJSON()),
      sessions: this.sessions.map((item) => item.toJSON()), routines: this.routines.map((item) => item.toJSON()),
      updatedAt: this.now().toISOString(),
    };
  }

  static from(value, options) { return new WorkspaceSnapshot(value, options); }
}
