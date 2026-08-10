import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseAuthAdapter } from "./supabase-auth-adapter.js";

test("auth adapter permits default user when Supabase is disabled", async () => {
  const auth = new SupabaseAuthAdapter();
  assert.equal(await auth.authorize({ headers: {} }), true);
  assert.equal(await auth.userId({ headers: {} }), "default");
});

test("auth adapter validates bearer tokens through Supabase", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer token");
    return { ok: true, json: async () => ({ id: "user-1" }) };
  };
  const auth = new SupabaseAuthAdapter({ url: "https://project.test/", anonKey: "anon", fetchImpl });
  assert.equal(await auth.userId({ headers: { authorization: "Bearer token" } }), "user-1");
  assert.equal(await auth.authorize({ headers: {} }), false);
});
