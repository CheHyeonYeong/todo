import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { supabase } from "../../api";

WebBrowser.maybeCompleteAuthSession();

async function sessionFromCallback(url: string) {
  const params = new URLSearchParams(url.split("#")[1] || url.split("?")[1] || "");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) throw new Error("로그인 응답에 토큰이 없습니다.");
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

export function useAuthSession() {
  const e2e = process.env.EXPO_PUBLIC_E2E === "true";
  const testSession = e2e ? ({ user: { email: "e2e@example.com" } } as Session) : null;
  const [session, setSession] = useState<Session | null>(testSession);
  const [checking, setChecking] = useState(!e2e);

  useEffect(() => {
    if (e2e) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, [e2e]);

  const login = async () => {
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error("로그인 URL을 만들지 못했습니다.");
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") await sessionFromCallback(result.url);
  };

  return { session, checking, login, logout: () => supabase.auth.signOut() };
}

export type AuthSession = ReturnType<typeof useAuthSession>;
