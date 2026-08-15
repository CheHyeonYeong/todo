import test from "node:test";
import assert from "node:assert/strict";
import { AccessToken } from "../domain/access-token.js";
import { SupabaseAuthAdapter } from "./supabase-auth-adapter.js";

test("access token is parsed at the edge, not inside the adapter", () => {
  assert.equal(AccessToken.fromAuthorizationHeader("Bearer abc").value, "abc");
  assert.equal(AccessToken.fromAuthorizationHeader("bearer abc").value, "abc");
  assert.equal(AccessToken.fromAuthorizationHeader("Basic abc").isPresent, false);
  assert.equal(AccessToken.fromAuthorizationHeader(undefined).isPresent, false);
});

test("auth adapter permits default user when Supabase is disabled", async () => {
  const auth = new SupabaseAuthAdapter();
  assert.equal(await auth.authorize(AccessToken.none()), true);
  assert.equal(await auth.userId(AccessToken.none()), "default");
});

test("auth adapter validates bearer tokens through Supabase", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer token");
    return { ok: true, json: async () => ({ id: "user-1" }) };
  };
  const auth = new SupabaseAuthAdapter({ url: "https://project.test/", anonKey: "anon", fetchImpl });
  assert.equal(await auth.userId(new AccessToken("token")), "user-1");
  assert.equal(await auth.authorize(AccessToken.none()), false);
});
