/**
 * 통합 컨텍스트의 유스케이스: 클라이언트가 한 번에 받아 가는 워크스페이스 전체.
 *
 * 목록을 내려주기 전에 오늘 몫의 루틴 할 일을 만들어 저장한다.
 * "언제 루틴이 오늘 할 일이 되는가"는 루틴 컨텍스트의 도메인 서비스가 정하고,
 * 여기서는 그 결정을 저장소에 반영하는 순서만 조율한다.
 */
export class WorkspaceService {
  constructor({ workspaces, materializer, clock }) {
    this.workspaces = workspaces;
    this.materializer = materializer;
    this.clock = clock;
  }

  async getData(userId) {
    const data = await this.workspaces.load(userId);
    const day = this.clock.today();

    const staleIds = this.materializer.staleOccurrenceIds(data.todos, day);
    if (staleIds.length) {
      const stale = new Set(staleIds);
      data.todos = data.todos.filter((todo) => !stale.has(todo.id) && !stale.has(todo.parentId));
    }
    const created = this.materializer.pendingOccurrences({ routines: data.routines, todos: data.todos, day });
    data.todos.push(...created);

    if (!staleIds.length && !created.length) return data;
    return this.workspaces.applyRoutineOccurrences(data, { removedTodoIds: staleIds, createdTodos: created }, userId);
  }

  replaceData(value, userId) {
    return this.workspaces.replace(value, userId);
  }
}
