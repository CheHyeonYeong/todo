import test from "node:test";
import assert from "node:assert/strict";
import { ArchivePolicy } from "./archive-policy.js";

test("archive policy only exports completed aggregate trees", () => {
  const policy = new ArchivePolicy({ afterMonths: 6 });
  const old = "2025-01-01T00:00:00.000Z";
  const parent = { id: "p", done: true, completedAt: old, parentId: null };
  const child = { id: "c", done: true, completedAt: old, parentId: "p" };
  assert.deepEqual(policy.archivableTodos([parent, child], "2026-01-01T00:00:00.000Z"), [parent, child]);
  assert.deepEqual(policy.archivableTodos([parent, { ...child, done: false }], "2026-01-01T00:00:00.000Z"), []);
});
