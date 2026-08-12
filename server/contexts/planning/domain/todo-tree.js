/**
 * 도메인 서비스: 할 일 트리의 불변식을 지킨다.
 * "하위 목표는 한 단계까지만, 부모와 같은 범위에만 붙는다"는 규칙은
 * 저장소나 HTTP가 아니라 도메인이 소유한다.
 */
export class TodoTree {
  static validate(todos) {
    const byId = new Map(todos.map((todo) => [todo.id, todo]));
    for (const todo of todos) {
      if (!todo.parentId) continue;
      const parent = byId.get(todo.parentId);
      if (!parent) throw new Error("Parent todo not found");
      if (parent.parentId) throw new Error("Todos can only be nested one level");
      if (parent.scope !== todo.scope) throw new Error("Parent and child scopes must match");
    }
  }

  /** 하위 목표가 모두 끝났는지에 따라 부모의 완료 상태를 다시 계산한다. */
  static parentCompletion(children, completedAt = new Date().toISOString()) {
    const done = children.length > 0 && children.every((child) => child.done);
    return { done, completedAt: done ? completedAt : null };
  }

  static childrenOf(todos, parentId) {
    return todos.filter((todo) => todo.parentId === parentId);
  }

  /** 같은 범위·같은 부모를 가진 형제 중 마지막 다음 자리를 계산한다. */
  static nextSortOrder(todos, { scope, parentId }) {
    const siblings = todos.filter((todo) => todo.scope === scope && (todo.parentId || null) === parentId);
    return Math.max(-1, ...siblings.map((todo) => Number(todo.sortOrder) || 0)) + 1;
  }
}
