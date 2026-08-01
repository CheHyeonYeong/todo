import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";
import { API_BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function apiFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}
