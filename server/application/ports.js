export class HealthGateway {
  health() { throw new Error("Not implemented"); }
}

export class AuthGateway {
  session(_request) { throw new Error("Not implemented"); }
  authorize(_request) { throw new Error("Not implemented"); }
  userId(_request) { throw new Error("Not implemented"); }
}

export class TodoGateway extends HealthGateway {
  getData(_userId) { throw new Error("Not implemented"); }
  replaceData(_value, _userId) { throw new Error("Not implemented"); }
  createMemo(_value, _userId) { throw new Error("Not implemented"); }
  updateMemo(_id, _value, _userId) { throw new Error("Not implemented"); }
  deleteMemo(_id, _userId) { throw new Error("Not implemented"); }
  reorderMemos(_ids, _userId) { throw new Error("Not implemented"); }
  createTodo(_value, _userId) { throw new Error("Not implemented"); }
  updateTodo(_id, _value, _userId) { throw new Error("Not implemented"); }
  deleteTodo(_id, _userId) { throw new Error("Not implemented"); }
  reorderTodos(_items, _userId) { throw new Error("Not implemented"); }
  createSession(_value, _userId) { throw new Error("Not implemented"); }
  deleteSession(_id, _userId) { throw new Error("Not implemented"); }
  createRoutine(_value, _userId) { throw new Error("Not implemented"); }
  updateRoutine(_id, _value, _userId) { throw new Error("Not implemented"); }
  deleteRoutine(_id, _userId) { throw new Error("Not implemented"); }
}
