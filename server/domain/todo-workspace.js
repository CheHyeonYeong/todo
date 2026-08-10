import { Memo, Routine, TimeSession, Todo } from "./entities.js";
import { TodoTree } from "./todo-tree.js";

export class TodoWorkspace {
  constructor(value = {}, { now = () => new Date() } = {}) {
    this.now = now;
    this.todos = Array.isArray(value.todos) ? value.todos.map((item) => Todo.from(item, now)) : [];
    this.memos = Array.isArray(value.memos) ? value.memos.map((item) => Memo.from(item, now)) : [];
    this.sessions = Array.isArray(value.sessions) ? value.sessions.map((item) => TimeSession.from(item, now)) : [];
    this.routines = Array.isArray(value.routines)
      ? value.routines.map((item) => Routine.from(item, now)).filter((item) => item.id && item.title)
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

  removeStaleRoutineTodos(today) {
    const staleIds = this.todos.filter((todo) => todo.routineId && todo.dueDate !== today).map((todo) => todo.id);
    const stale = new Set(staleIds);
    this.todos = this.todos.filter((todo) => !stale.has(todo.id) && !stale.has(todo.parentId));
    return staleIds;
  }

  materializeRoutines({ today, weekday, idFactory }) {
    const created = [];
    for (const routine of this.routines) {
      if (!routine.occursOn(weekday)) continue;
      if (this.todos.some((todo) => todo.routineId === routine.id && todo.dueDate === today)) continue;
      const siblings = this.todos.filter((todo) => todo.scope === "day" && !todo.parentId);
      const todo = new Todo({
        id: idFactory(), title: routine.title, scope: "day", dueDate: today,
        category: routine.category, routineId: routine.id,
        sortOrder: Math.max(-1, ...siblings.map((item) => Number(item.sortOrder) || 0)) + 1 + created.length,
      }, this.now);
      created.push(todo);
    }
    this.todos.push(...created);
    return created.map((todo) => todo.toJSON());
  }

  toJSON() {
    return {
      todos: this.todos.map((item) => item.toJSON()), memos: this.memos.map((item) => item.toJSON()),
      sessions: this.sessions.map((item) => item.toJSON()), routines: this.routines.map((item) => item.toJSON()),
      updatedAt: this.now().toISOString(),
    };
  }

  static from(value, options) { return new TodoWorkspace(value, options); }
}
