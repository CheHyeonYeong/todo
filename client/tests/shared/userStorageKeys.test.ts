import { describe, expect, it } from "vitest";
import { activeSessionKey, workspaceCacheKey } from "../../src/shared/storage/userStorageKeys";

describe("user storage keys", () => {
  it("isolates workspace caches by user", () => {
    expect(workspaceCacheKey("user-a")).not.toBe(workspaceCacheKey("user-b"));
  });

  it("isolates active sessions by user", () => {
    expect(activeSessionKey("user-a")).not.toBe(activeSessionKey("user-b"));
  });
});
