import test from "node:test";
import assert from "node:assert/strict";
import { ArchivePolicy } from "./archive-policy.js";
import { ArchiveWindow } from "./archive-window.js";

test("archive policy only exports completed aggregate trees", () => {
  const policy = new ArchivePolicy({ afterMonths: 6 });
  const old = "2025-01-01T00:00:00.000Z";
  const parent = { id: "p", done: true, completedAt: old, parentId: null };
  const child = { id: "c", done: true, completedAt: old, parentId: "p" };
  assert.deepEqual(policy.archivableTodos([parent, child], "2026-01-01T00:00:00.000Z"), [parent, child]);
  assert.deepEqual(policy.archivableTodos([parent, { ...child, done: false }], "2026-01-01T00:00:00.000Z"), []);
});

test("archive window computes the cutoff instant", () => {
  const window = new ArchiveWindow(6);
  assert.equal(window.cutoff(new Date("2026-08-10T00:00:00.000Z")), "2026-02-10T00:00:00.000Z");
  assert.equal(window.equals(new ArchiveWindow(6)), true);
});
