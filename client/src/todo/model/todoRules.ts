import type { Todo } from "../../types";

export function completionPatch(done: boolean, now: Date): Partial<Todo> {
  return { done, completedAt: done ? now.toISOString() : null };
}
