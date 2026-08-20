import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, Text } from "react-native";
import type { AuthSession } from "../hooks/useAuthSession";
import { styles } from "./styles";

export function AuthGate({
  auth,
  children,
}: {
  auth: AuthSession;
  children: (session: Session) => ReactNode;
}) {
  const handleLogin = async () => {
    try {
      await auth.login();
    } catch (reason) {
      Alert.alert("로그인 실패", reason instanceof Error ? reason.message : "다시 시도해주세요.");
    }
  };

  if (auth.checking)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#176b47" />
        <Text style={styles.muted}>로그인 상태 확인 중…</Text>
      </SafeAreaView>
    );

  if (!auth.session)
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.logo}>Todo</Text>
        <Text style={styles.tagline}>해야 할 일과 생각, 집중 시간을 한곳에.</Text>
        <Pressable style={styles.loginButton} onPress={() => void handleLogin()}>
          <Text style={styles.loginText}>Google로 계속하기</Text>
        </Pressable>
      </SafeAreaView>
    );

  return children(auth.session);
}
