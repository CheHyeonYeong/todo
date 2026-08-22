import { describe, expect, test } from "vitest";
import type { Todo } from "../../src/todo/model/types";
import { applyTodoPatch, bySortOrder, completionPatch, nextSortOrder } from "../../src/todo/model/todoRules";

const now = new Date(2026, 7, 18, 10, 0);

function todo(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    title: id,
    scope: "day",
    done: false,
    createdAt: new Date(2026, 7, 1).toISOString(),
    parentId: null,
    ...overrides,
  };
}

describe("nextSortOrder", () => {
  test("형제가 없으면 0에서 시작한다", () => {
    expect(nextSortOrder([], "day", null)).toBe(0);
  });

  test("같은 칸의 맨 뒤로 보낸다", () => {
    const todos = [todo("a", { sortOrder: 0 }), todo("b", { sortOrder: 3 })];
    expect(nextSortOrder(todos, "day", null)).toBe(4);
  });

  test("다른 스코프의 형제는 세지 않는다", () => {
    const todos = [todo("a", { scope: "week", sortOrder: 9 })];
    expect(nextSortOrder(todos, "day", null)).toBe(0);
  });

  test("부모가 다르면 별도로 센다", () => {
    const todos = [todo("root", { sortOrder: 5 }), todo("child", { parentId: "root", sortOrder: 1 })];
    expect(nextSortOrder(todos, "day", "root")).toBe(2);
    expect(nextSortOrder(todos, "day", null)).toBe(6);
  });

  test("sortOrder가 없는 항목은 0으로 친다", () => {
    expect(nextSortOrder([todo("a")], "day", null)).toBe(1);
  });
});

describe("bySortOrder", () => {
  const ids = (todos: Todo[]) => todos.map((item) => item.id);

  test("오름차순으로 늘어놓는다", () => {
    const todos = [todo("c", { sortOrder: 2 }), todo("a", { sortOrder: 0 }), todo("b", { sortOrder: 1 })];
    expect(ids([...todos].sort(bySortOrder))).toEqual(["a", "b", "c"]);
  });

  test("sortOrder가 없는 항목은 0으로 쳐서 앞에 온다", () => {
    const todos = [todo("first", { sortOrder: 5 }), todo("none")];
    expect(ids([...todos].sort(bySortOrder))).toEqual(["none", "first"]);
  });

  test("sortOrder가 같으면 들어온 순서를 지킨다", () => {
    // 메모에서 뽑은 할 일이 기존 할 일과 값이 겹칠 수 있다. 서버가 createdAt으로 다시 매길 때까지
    // 화면은 배열 순서를 그대로 유지해야 항목이 튀지 않는다.
    const todos = [todo("x", { sortOrder: 1 }), todo("y", { sortOrder: 1 }), todo("z", { sortOrder: 1 })];
    expect(ids([...todos].sort(bySortOrder))).toEqual(["x", "y", "z"]);
  });
});

describe("completionPatch", () => {
  test("완료하면 시각을 남긴다", () => {
    expect(completionPatch(true, now)).toEqual({ done: true, completedAt: now.toISOString() });
  });

  test("되돌리면 시각을 지운다", () => {
    expect(completionPatch(false, now)).toEqual({ done: false, completedAt: null });
  });
});

describe("applyTodoPatch", () => {
  const tree = () => [
    todo("parent"),
    todo("child1", { parentId: "parent" }),
    todo("child2", { parentId: "parent" }),
  ];

  test("지목한 항목만 바꾼다", () => {
    const next = applyTodoPatch(tree(), "child1", { title: "새 제목" }, now);
    expect(next.find((item) => item.id === "child1")?.title).toBe("새 제목");
    expect(next.find((item) => item.id === "child2")?.title).toBe("child2");
  });

  test("하위 목표가 전부 끝나면 부모도 끝난다", () => {
    let todos = applyTodoPatch(tree(), "child1", { done: true }, now);
    expect(todos.find((item) => item.id === "parent")?.done).toBe(false);

    todos = applyTodoPatch(todos, "child2", { done: true }, now);
    const parent = todos.find((item) => item.id === "parent");
    expect(parent?.done).toBe(true);
    expect(parent?.completedAt).toBe(now.toISOString());
  });

  test("하나라도 되돌리면 부모도 되돌아간다", () => {
    let todos = applyTodoPatch(tree(), "child1", { done: true }, now);
    todos = applyTodoPatch(todos, "child2", { done: true }, now);
    todos = applyTodoPatch(todos, "child2", { done: false }, now);

    const parent = todos.find((item) => item.id === "parent");
    expect(parent?.done).toBe(false);
    expect(parent?.completedAt).toBe(null);
  });

  test("최상위 항목을 바꿀 때는 부모를 찾지 않는다", () => {
    const next = applyTodoPatch(tree(), "parent", { done: true }, now);
    expect(next.find((item) => item.id === "parent")?.done).toBe(true);
    // 현재 동작: 부모를 완료해도 하위 목표는 따라가지 않는다 (서버가 정리한다)
    expect(next.find((item) => item.id === "child1")?.done).toBe(false);
  });

  test("done이 아닌 패치는 부모 상태를 건드리지 않는다", () => {
    let todos = applyTodoPatch(tree(), "child1", { done: true }, now);
    todos = applyTodoPatch(todos, "child2", { done: true }, now);
    expect(todos.find((item) => item.id === "parent")?.done).toBe(true);

    const renamed = applyTodoPatch(todos, "child1", { title: "이름만 변경" }, now);
    expect(renamed.find((item) => item.id === "parent")?.done).toBe(true);
  });

  test("없는 id면 아무것도 바뀌지 않는다", () => {
    const before = tree();
    expect(applyTodoPatch(before, "없음", { done: true }, now)).toEqual(before);
  });

  test("입력 배열을 바꾸지 않는다", () => {
    const before = tree();
    applyTodoPatch(before, "child1", { done: true }, now);
    expect(before.find((item) => item.id === "child1")?.done).toBe(false);
  });
});
