import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { supabase } from "./src/api";
import { MemoScreen, TimeScreen, TodoScreen } from "./src/Screens";
import { useAppData } from "./src/useAppData";

WebBrowser.maybeCompleteAuthSession();
type Workspace = "todo" | "memo" | "time";
const tabs: { key: Workspace; label: string; icon: string }[] = [
  { key: "todo", label: "할 일", icon: "✓" }, { key: "memo", label: "메모", icon: "✎" },
  { key: "time", label: "시간", icon: "◷" },
];

async function sessionFromCallback(url: string) {
  const params = new URLSearchParams(url.split("#")[1] || url.split("?")[1] || "");
  const accessToken = params.get("access_token"); const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) throw new Error("로그인 응답에 토큰이 없습니다.");
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace>("todo");
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 960;
  const store = useAppData(Boolean(session));
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setChecking(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  const login = async () => {
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (!data.url) throw new Error("로그인 URL을 만들지 못했습니다.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") await sessionFromCallback(result.url);
    } catch (reason) { Alert.alert("로그인 실패", reason instanceof Error ? reason.message : "다시 시도해주세요."); }
  };
  if (checking) return <SafeAreaView style={styles.center}><ActivityIndicator color="#176b47" /><Text style={styles.muted}>로그인 상태 확인 중…</Text></SafeAreaView>;
  if (!session) return <SafeAreaView style={styles.center}><StatusBar style="dark" /><Text style={styles.logo}>Todo</Text><Text style={styles.tagline}>해야 할 일과 생각, 집중 시간을 한곳에.</Text><Pressable style={styles.loginButton} onPress={() => void login()}><Text style={styles.loginText}>Google로 계속하기</Text></Pressable></SafeAreaView>;
  const navigation = <View style={desktop ? styles.desktopNav : styles.nav}>{desktop && <View style={styles.desktopNavHeader}><Text style={styles.desktopLogo}>Todo</Text><Text style={styles.desktopCaption}>나의 워크스페이스</Text></View>}{tabs.map((tab) => <Pressable key={tab.key} style={[desktop ? styles.desktopNavItem : styles.navItem, desktop && workspace === tab.key && styles.desktopNavSelected]} onPress={() => setWorkspace(tab.key)}><Text style={[styles.navIcon, workspace === tab.key && styles.navActive]}>{tab.icon}</Text><Text style={[desktop ? styles.desktopNavLabel : styles.navLabel, workspace === tab.key && styles.navActive]}>{tab.label}</Text></Pressable>)}{desktop && <View style={styles.desktopAccount}><Text style={styles.desktopEmail} numberOfLines={1}>{session.user.email}</Text><Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.logout}>로그아웃</Text></Pressable></View>}</View>;
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" />
    <View style={desktop ? styles.desktopShell : styles.mobileShell}>
      {desktop && navigation}
      <View style={styles.mainColumn}>
        <View style={[styles.topbar, desktop && styles.desktopTopbar]}><View><Text style={styles.brand}>{tabs.find((tab) => tab.key === workspace)?.label}</Text><Text style={styles.email}>{desktop ? "오늘도 가볍게 시작해보세요." : session.user.email}</Text></View><View style={styles.topActions}><Pressable style={desktop && styles.topActionButton} onPress={() => void store.reload()}><Text style={styles.refresh}>↻ 새로고침</Text></Pressable>{!desktop && <Pressable onPress={() => void supabase.auth.signOut()}><Text style={styles.logout}>로그아웃</Text></Pressable>}</View></View>
        {store.error && <Pressable style={styles.errorBar} onPress={() => void store.reload()}><Text style={styles.errorText}>{store.error} · 다시 시도</Text></Pressable>}
        <View style={[styles.content, desktop && styles.desktopContent]}>{store.loading ? <ActivityIndicator style={styles.loader} color="#176b47" /> : workspace === "todo" ? <TodoScreen store={store} /> : workspace === "memo" ? <MemoScreen store={store} /> : <TimeScreen store={store} />}</View>
        {!desktop && navigation}
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7f4" }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28, backgroundColor: "#f5f7f4" }, logo: { fontSize: 48, fontWeight: "900", color: "#173829" }, tagline: { maxWidth: 300, marginBottom: 18, textAlign: "center", fontSize: 16, lineHeight: 24, color: "#6d7a72" }, muted: { color: "#78837c" }, loginButton: { minWidth: 240, alignItems: "center", paddingVertical: 16, borderRadius: 15, backgroundColor: "#176b47" }, loginText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  mobileShell: { flex: 1 }, desktopShell: { flex: 1, flexDirection: "row" }, mainColumn: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#dfe5df", backgroundColor: "#fff" }, desktopTopbar: { minHeight: 82, paddingHorizontal: 34, backgroundColor: "#f8faf7" }, brand: { fontSize: 24, fontWeight: "800", color: "#173829" }, email: { marginTop: 3, fontSize: 12, color: "#7c8780" }, topActions: { flexDirection: "row", gap: 16 }, topActionButton: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: "#d6e1d9", borderRadius: 10, backgroundColor: "#fff" }, refresh: { fontSize: 12, fontWeight: "600", color: "#176b47" }, logout: { fontSize: 12, fontWeight: "600", color: "#7a5b56" }, errorBar: { alignItems: "center", padding: 8, backgroundColor: "#fff0ed" }, errorText: { fontSize: 12, color: "#a23c32" }, content: { flex: 1 }, desktopContent: { backgroundColor: "#f8faf7" }, loader: { flex: 1 },
  desktopNav: { width: 236, padding: 18, gap: 6, borderRightWidth: 1, borderRightColor: "#dce4dd", backgroundColor: "#fff" }, desktopNavHeader: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 24 }, desktopLogo: { fontSize: 28, fontWeight: "900", color: "#173829" }, desktopCaption: { marginTop: 3, fontSize: 11, color: "#89938d" }, desktopNavItem: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14, borderRadius: 12 }, desktopNavSelected: { backgroundColor: "#eaf4ed" }, desktopNavLabel: { fontSize: 14, fontWeight: "600", color: "#68756d" }, desktopAccount: { marginTop: "auto", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: "#e6ebe7" }, desktopEmail: { fontSize: 11, color: "#77837b" },
  nav: { flexDirection: "row", paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 4 : 8, borderTopWidth: 1, borderTopColor: "#dce3dd", backgroundColor: "#fff" }, navItem: { flex: 1, alignItems: "center", gap: 2 }, navIcon: { fontSize: 20, color: "#89938d" }, navLabel: { fontSize: 11, fontWeight: "600", color: "#89938d" }, navActive: { color: "#176b47" },
});
