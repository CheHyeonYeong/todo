import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { supabase } from "../../api";
import { LOCAL_DEV_AUTH } from "../../config";

WebBrowser.maybeCompleteAuthSession();

const localDevSession = {
  access_token: "local-dev",
  refresh_token: "local-dev",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "local-dev",
    aud: "authenticated",
    role: "authenticated",
    email: "local-dev@todo.local",
    app_metadata: {},
    user_metadata: {},
    created_at: "1970-01-01T00:00:00.000Z",
  },
} as Session;

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
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    if (LOCAL_DEV_AUTH) {
      setSession(localDevSession);
      setIsCheckingSession(false);
      return;
    }

    if (Platform.OS === "web" && typeof window !== "undefined") {
      void sessionFromCallback(window.location.href)
        .then(() => {
          window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
        })
        .catch(() => undefined);
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsCheckingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsCheckingSession(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (LOCAL_DEV_AUTH) {
      setSession(localDevSession);
      return;
    }

    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("로그인 URL을 만들지 못했습니다.");

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.assign(data.url);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") await sessionFromCallback(result.url);
    } catch (reason) {
      Alert.alert("로그인 실패", reason instanceof Error ? reason.message : "다시 시도해주세요.");
    }
  };

  const signOut = () => {
    if (LOCAL_DEV_AUTH) {
      setSession(null);
      return Promise.resolve();
    }
    return supabase.auth.signOut();
  };

  return { session, isCheckingSession, signInWithGoogle, signOut };
}
