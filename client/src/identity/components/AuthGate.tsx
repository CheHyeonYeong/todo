import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, SafeAreaView, Text } from "react-native";
import { styles } from "./AuthGate.styles";

export function AuthGate({
  isCheckingSession,
  onSignIn,
}: {
  isCheckingSession: boolean;
  onSignIn: () => Promise<void>;
}) {
  if (isCheckingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#176b47" />
        <Text style={styles.muted}>로그인 상태 확인 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.center}>
      <StatusBar style="dark" />
      <Text style={styles.logo}>Todo</Text>
      <Text style={styles.tagline}>해야 할 일과 생각, 집중 시간을 한곳에.</Text>
      <Pressable style={styles.loginButton} onPress={() => void onSignIn()}>
        <Text style={styles.loginText}>Google로 계속하기</Text>
      </Pressable>
    </SafeAreaView>
  );
}
