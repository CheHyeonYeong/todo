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
}
