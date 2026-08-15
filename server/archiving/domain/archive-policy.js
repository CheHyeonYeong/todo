import { ArchiveWindow } from "./archive-window.js";

/**
 * 무엇을 보관해도 되는지 정하는 정책.
 * 보관 대상: 완료된 지 오래된 최상위 할 일 + 그 하위 목표 전부.
 * 미완료 항목은 절대 건드리지 않는다.
 */
export class ArchivePolicy {
  constructor({ afterMonths }) { this.window = new ArchiveWindow(afterMonths); }

  get afterMonths() { return this.window.afterMonths; }
  cutoff(now = new Date()) { return this.window.cutoff(now); }

  archivableTodos(todos, cutoffIso) {
    const archived = [];
    for (const todo of todos) {
      if (todo.parentId || !todo.done || !todo.completedAt || todo.completedAt >= cutoffIso) continue;
      const children = todos.filter((child) => child.parentId === todo.id);
      if (children.some((child) => !child.done)) continue;
      archived.push(todo, ...children);
    }
    return archived;
  }

  /** 보관 대상 시간 기록: 끝난 지 오래된 것 전부 */
  archivableSessions(sessions, cutoffIso) {
    return (sessions || []).filter((session) => session.endedAt && session.endedAt < cutoffIso);
  }
}
