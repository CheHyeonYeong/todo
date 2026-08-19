import { describe, expect, test } from "vitest";
import type { Todo } from "../../../types";
import { applyTodoPatch, completionPatch, nextSortOrder } from "./todo";

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
