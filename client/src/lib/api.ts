import { createClient } from "@supabase/supabase-js";
import { API_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config";

const AUTH_TOKEN_KEY = "free-adhd-memo:auth-token";

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          // refresh token은 localStorage에 남아 탭을 닫아도 유지되고, access token은 알아서 갱신된다.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

/* access token은 1시간이면 만료된다. 복사해 둔 값을 쓰면 낡으므로 요청 때마다
   Supabase에서 현재 세션을 받아온다. getSession()은 만료가 임박하면 알아서 갱신한다. */
async function currentAuthToken() {
  if (!supabase) return localStorage.getItem(AUTH_TOKEN_KEY);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    setAuthToken(token);
    return token;
  } catch {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }
}

/* 401을 받았을 때 마지막으로 한 번 더 갱신을 시도한다. 실패하면 null. */
export async function refreshAuthToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.refreshSession();
    const token = data.session?.access_token ?? null;
    setAuthToken(token);
    return token;
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const authToken = await currentAuthToken();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}
