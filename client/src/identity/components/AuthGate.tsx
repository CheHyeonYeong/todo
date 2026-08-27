import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";

export function AuthGate({ checking, onLogin }: { checking: boolean; onLogin: () => Promise<void> }) {
  if (checking) {
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
      <Pressable style={styles.loginButton} onPress={() => void onLogin()}>
        <Text style={styles.loginText}>Google로 계속하기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 28,
    backgroundColor: "#f5f7f4",
  },
  logo: { fontSize: 48, fontWeight: "900", color: "#173829" },
  tagline: {
    maxWidth: 300,
    marginBottom: 18,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    color: "#6d7a72",
  },
  muted: { color: "#78837c" },
  loginButton: {
    minWidth: 240,
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 15,
    backgroundColor: "#176b47",
  },
  loginText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
