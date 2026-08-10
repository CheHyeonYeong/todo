export class TodoApplicationService {
  constructor(gateway, authGateway = gateway) { this.gateway = gateway; this.authGateway = authGateway; }
  health() { return this.gateway.health(); }
  session(request) { return this.authGateway.session(request); }
  authorize(request) { return this.authGateway.authorize(request); }
  userId(request) { return this.authGateway.userId(request); }
  getData(userId) { return this.gateway.getData(userId); }
  replaceData(value, userId) { return this.gateway.replaceData(value, userId); }
  createMemo(value, userId) { return this.gateway.createMemo(value, userId); }
  updateMemo(id, value, userId) { return this.gateway.updateMemo(id, value, userId); }
  deleteMemo(id, userId) { return this.gateway.deleteMemo(id, userId); }
  reorderMemos(ids, userId) { return this.gateway.reorderMemos(ids, userId); }
  createTodo(value, userId) { return this.gateway.createTodo(value, userId); }
  updateTodo(id, value, userId) { return this.gateway.updateTodo(id, value, userId); }
  deleteTodo(id, userId) { return this.gateway.deleteTodo(id, userId); }
  reorderTodos(items, userId) { return this.gateway.reorderTodos(items, userId); }
  createSession(value, userId) { return this.gateway.createSession(value, userId); }
  deleteSession(id, userId) { return this.gateway.deleteSession(id, userId); }
  createRoutine(value, userId) { return this.gateway.createRoutine(value, userId); }
  updateRoutine(id, value, userId) { return this.gateway.updateRoutine(id, value, userId); }
  deleteRoutine(id, userId) { return this.gateway.deleteRoutine(id, userId); }
}
