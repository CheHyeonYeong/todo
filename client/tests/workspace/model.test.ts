import { describe, expect, it } from "vitest";
import type { WorkspaceDto } from "../../src/workspace/api/workspaceDto";
import { toWorkspaceData } from "../../src/workspace/model/types";

describe("toWorkspaceData", () => {
  it("maps wire DTOs into independent frontend models", () => {
    const dto: WorkspaceDto = {
      todos: [
        {
          id: "todo-1",
          title: "할 일",
          scope: "day",
          done: false,
          createdAt: "2026-01-01T00:00:00Z",
          sourceMemoId: "memo-1",
        },
      ],
      memos: [{ id: "memo-1", body: "본문", createdAt: "2026-01-01T00:00:00Z", tags: ["태그"] }],
      sessions: [
        {
          id: "session-1",
          label: "집중",
          startedAt: "2026-01-01T00:00:00Z",
          endedAt: "2026-01-01T01:00:00Z",
        },
      ],
      routines: [
        {
          id: "routine-1",
          title: "루틴",
          weekdays: [1, 3],
          active: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    };

    const model = toWorkspaceData(dto);

    expect(model.todos[0]).not.toHaveProperty("sourceMemoId");
    expect(model.routines[0]).not.toHaveProperty("createdAt");
    expect(model.sessions[0]).toEqual(dto.sessions[0]);
    dto.memos[0].tags.push("변경");
    dto.routines[0].weekdays.push(5);
    expect(model.memos[0].tags).toEqual(["태그"]);
    expect(model.routines[0].weekdays).toEqual([1, 3]);
  });

  it("uses empty collections for missing snapshot fields", () => {
    expect(toWorkspaceData({})).toEqual({ todos: [], memos: [], sessions: [], routines: [] });
  });
});
