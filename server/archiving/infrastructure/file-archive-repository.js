import { ArchiveRepository } from "../application/ports.js";

export class FileArchiveRepository extends ArchiveRepository {
  constructor(store, workspaces) { super(); this.store = store; this.workspaces = workspaces; }

  candidateUserIds() { return ["default"]; }
  load(userId) { return this.workspaces.load(userId); }

  async purge({ todoIds, sessionIds }, userId) {
    const data = await this.store.read(userId);
    const removedTodos = new Set(todoIds);
    const removedSessions = new Set(sessionIds);
    data.todos = data.todos.filter((todo) => !removedTodos.has(todo.id));
    data.sessions = data.sessions.filter((session) => !removedSessions.has(session.id));
    await this.store.write(data, userId);
  }
}
