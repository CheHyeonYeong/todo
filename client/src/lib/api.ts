import { createClient } from "@supabase/supabase-js";
import { API_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config";

const AUTH_TOKEN_KEY = "free-adhd-memo:auth-token";

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}
