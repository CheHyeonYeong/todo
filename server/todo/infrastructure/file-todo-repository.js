import { TodoRepository } from "../application/ports.js";
import { Todo } from "../domain/todo.js";
import { TodoTree } from "../domain/todo-tree.js";

/** 파일 모드 어댑터: 진행 중인 스냅샷을 제자리에서 고친다. 저장은 작업 단위가 끝날 때 한 번. */
export class FileTodoRepository extends TodoRepository {
  add(todo, { snapshot }) {
    if (todo.parentId) {
      const parent = snapshot.todos.find((item) => item.id === todo.parentId && !item.parentId);
      if (!parent) throw new Error("Parent todo not found or already nested");
      todo.scope = parent.scope;
    }
    if (todo.sortOrder === null) {
      todo.sortOrder = TodoTree.nextSortOrder(snapshot.todos, { scope: todo.scope, parentId: todo.parentId });
    }
    snapshot.todos.push(todo);
    if (todo.parentId && !todo.done) {
      snapshot.todos = snapshot.todos.map((item) =>
        item.id === todo.parentId ? { ...item, done: false, completedAt: null } : item,
      );
    }
    return todo;
  }

  update(id, patch, { snapshot }) {
    const current = snapshot.todos.find((todo) => todo.id === id);
    if (!current) return null;
    const nextPatch = { ...patch };
    if (Object.hasOwn(patch, "dueDate")) nextPatch.dueDate = patch.dueDate || null;
    const updated = Todo.from({ ...current, ...nextPatch }).toJSON();
    snapshot.todos = snapshot.todos.map((todo) => (todo.id === id ? updated : todo));

    if (current.parentId && typeof patch.done === "boolean") {
      const siblings = TodoTree.childrenOf(snapshot.todos, current.parentId);
      const completion = TodoTree.parentCompletion(siblings);
      snapshot.todos = snapshot.todos.map((todo) => (todo.id === current.parentId ? { ...todo, ...completion } : todo));
    } else if (!current.parentId) {
      if (typeof patch.done === "boolean") {
        snapshot.todos = snapshot.todos.map((todo) =>
          todo.parentId === id
            ? { ...todo, done: patch.done, completedAt: patch.done ? patch.completedAt || new Date().toISOString() : null }
            : todo,
        );
      }
      if (["day", "week", "month"].includes(patch.scope)) {
        snapshot.todos = snapshot.todos.map((todo) => (todo.parentId === id ? { ...todo, scope: patch.scope } : todo));
      }
    }
    return snapshot.todos.find((todo) => todo.id === id) || null;
  }

  remove(id, { snapshot }) {
    const target = snapshot.todos.find((todo) => todo.id === id);
    snapshot.todos = snapshot.todos.filter((todo) => todo.id !== id && todo.parentId !== id);
    if (!target?.parentId) return;
    const siblings = TodoTree.childrenOf(snapshot.todos, target.parentId);
    if (!siblings.length) return;
    const completion = TodoTree.parentCompletion(siblings);
    snapshot.todos = snapshot.todos.map((todo) => (todo.id === target.parentId ? { ...todo, ...completion } : todo));
  }

  removeMany(ids, { snapshot }) {
    const removed = new Set(ids);
    snapshot.todos = snapshot.todos.filter((todo) => !removed.has(todo.id) && !removed.has(todo.parentId));
  }

  reorder(placements, { snapshot }) {
    const changes = new Map(placements.map((placement) => [placement.id, placement]));
    snapshot.todos = snapshot.todos.map((todo) => {
      const change = changes.get(todo.id);
      return change
        ? { ...todo, parentId: change.parentId, sortOrder: change.sortOrder, scope: change.scope || todo.scope }
        : todo;
    });
    TodoTree.validate(snapshot.todos.map((todo) => Todo.from(todo).toJSON()));
    snapshot.todos = snapshot.todos.map((todo) => {
      if (todo.parentId) return todo;
      const children = TodoTree.childrenOf(snapshot.todos, todo.id);
      if (!children.length) return todo;
      const done = children.every((child) => child.done);
      return { ...todo, done, completedAt: done ? todo.completedAt || new Date().toISOString() : null };
    });
  }

  captureMany(todos, { snapshot }) {
    for (const todo of todos) {
      if (todo.sortOrder === null) {
        todo.sortOrder = TodoTree.nextSortOrder(snapshot.todos, { scope: todo.scope, parentId: todo.parentId });
      }
      snapshot.todos.push(todo);
    }
    return todos;
  }

  appendOccurrences(todos, { snapshot }) {
    snapshot.todos.push(...todos);
    return todos;
  }

  detachRoutine(routineId, { snapshot }) {
    snapshot.todos = snapshot.todos.map((todo) => (todo.routineId === routineId ? { ...todo, routineId: null } : todo));
  }
}
