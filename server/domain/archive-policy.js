export class ArchivePolicy {
  constructor({ afterMonths }) { this.afterMonths = afterMonths; }

  cutoff(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - this.afterMonths);
    return cutoff.toISOString();
  }

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

  archivableSessions(sessions, cutoffIso) {
    return (sessions || []).filter((session) => session.endedAt && session.endedAt < cutoffIso);
  }
}
