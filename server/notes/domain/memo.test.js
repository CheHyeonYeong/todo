import test from "node:test";
import assert from "node:assert/strict";
import { Memo } from "./memo.js";

test("Memo normalizes collection values", () => {
  assert.deepEqual(new Memo({ tags: [1, "two"] }).tags, ["1", "two"]);
  assert.equal(new Memo({ title: "  note  " }).title, "note");
  assert.equal(new Memo({}).hasContent, false);
  assert.equal(new Memo({ body: "text" }).hasContent, true);
});
