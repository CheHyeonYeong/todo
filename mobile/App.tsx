import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, supabase } from "./src/api";
import type { AppData, Scope, Todo } from "./src/types";

WebBrowser.maybeCompleteAuthSession();

const scopes: { value: Scope; label: string }[] = [
  { value: "day", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
];

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [scope, setScope] = useState<Scope>("day");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTodos = useCallback(async () => {
    try {
      const response = await apiFetch("/api/data");
      if (!response.ok) throw new Error(`목록을 불러오지 못했습니다 (${response.status})`);
      const data = (await response.json()) as AppData;
      setTodos(Array.isArray(data.todos) ? data.todos : []);
    } catch (error) {
      Alert.alert("동기화 오류", error instanceof Error ? error.message : "다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadTodos();
    else setTodos([]);
  }, [session, loadTodos]);

  const visibleTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.scope === scope && !todo.parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [todos, scope],
  );

  const login = async () => {
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("로그인 URL을 만들지 못했습니다.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") await sessionFromCallback(result.url);
    } catch (error) {
      Alert.alert("로그인 실패", error instanceof Error ? error.message : "다시 시도해 주세요.");
    }
  };

  const addTodo = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || saving) return;
    const siblings = todos.filter((todo) => todo.scope === scope && !todo.parentId);
    const todo: Todo = {
      id: uuid(),
      title: nextTitle,
      scope,
      done: false,
      createdAt: new Date().toISOString(),
      parentId: null,
      sortOrder: Math.max(-1, ...siblings.map((item) => item.sortOrder ?? 0)) + 1,
    };
    setSaving(true);
    setTodos((current) => [...current, todo]);
    setTitle("");
    try {
      const response = await apiFetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todo),
      });
      if (!response.ok) throw new Error(`추가하지 못했습니다 (${response.status})`);
    } catch (error) {
      setTodos((current) => current.filter((item) => item.id !== todo.id));
      setTitle(nextTitle);
      Alert.alert("저장 오류", error instanceof Error ? error.message : "다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    const done = !todo.done;
    const completedAt = done ? new Date().toISOString() : null;
    setTodos((current) =>
      current.map((item) => (item.id === todo.id ? { ...item, done, completedAt } : item)),
    );
    const response = await apiFetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done, completedAt }),
    });
    if (!response.ok) {
      setTodos((current) => current.map((item) => (item.id === todo.id ? todo : item)));
      Alert.alert("저장 오류", "완료 상태를 저장하지 못했습니다.");
    }
  };

  const deleteTodo = (todo: Todo) => {
    Alert.alert("할 일 삭제", `"${todo.title}"을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          setTodos((current) => current.filter((item) => item.id !== todo.id));
          const response = await apiFetch(`/api/todos/${encodeURIComponent(todo.id)}`, {
            method: "DELETE",
          });
          if (!response.ok) {
            setTodos((current) => [...current, todo]);
            Alert.alert("삭제 오류", "할 일을 삭제하지 못했습니다.");
          }
        },
      },
    ]);
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="auto" />
        <Text style={styles.logo}>Todo</Text>
        <Text style={styles.subtitle}>해야 할 일만, 한눈에.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void login()}>
          <Text style={styles.primaryButtonText}>Google로 계속하기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Todo</Text>
            <Text style={styles.email}>{session.user.email}</Text>
          </View>
          <Pressable onPress={() => void supabase.auth.signOut()}>
            <Text style={styles.logout}>로그아웃</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {scopes.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.tab, scope === item.value && styles.activeTab]}
              onPress={() => setScope(item.value)}
            >
              <Text style={[styles.tabText, scope === item.value && styles.activeTabText]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={() => void addTodo()}
            placeholder="할 일 추가"
            returnKeyType="done"
            style={styles.input}
          />
          <Pressable
            style={[styles.addButton, (!title.trim() || saving) && styles.disabled]}
            disabled={!title.trim() || saving}
            onPress={() => void addTodo()}
          >
            <Text style={styles.addButtonText}>추가</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#16734a" />
        ) : (
          <FlatList
            data={visibleTodos}
            keyExtractor={(item) => item.id}
            contentContainerStyle={visibleTodos.length ? styles.list : styles.emptyList}
            refreshing={loading}
            onRefresh={() => {
              setLoading(true);
              void loadTodos();
            }}
            ListEmptyComponent={<Text style={styles.empty}>아직 할 일이 없어요.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.todo}
                onPress={() => void toggleTodo(item)}
                onLongPress={() => deleteTodo(item)}
              >
                <View style={[styles.checkbox, item.done && styles.checked]}>
                  {item.done && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.todoTextWrap}>
                  <Text style={[styles.todoText, item.done && styles.done]}>{item.title}</Text>
                  {!!item.category && <Text style={styles.category}>{item.category}</Text>}
                </View>
              </Pressable>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f5" },
  container: { flex: 1, paddingHorizontal: 20 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
    backgroundColor: "#f7f8f5",
  },
  logo: { fontSize: 42, fontWeight: "800", color: "#15251d" },
  subtitle: { marginBottom: 24, fontSize: 16, color: "#6c776f" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 22,
    paddingBottom: 18,
  },
  title: { fontSize: 32, fontWeight: "800", color: "#15251d" },
  email: { marginTop: 2, fontSize: 12, color: "#7b857f" },
  logout: { fontSize: 13, fontWeight: "600", color: "#6c776f" },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#e8ebe7",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  activeTab: { backgroundColor: "#ffffff" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#768079" },
  activeTabText: { color: "#196b48" },
  inputRow: { flexDirection: "row", gap: 10, paddingVertical: 16 },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#dce1dc",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    fontSize: 16,
    color: "#15251d",
  },
  addButton: {
    justifyContent: "center",
    paddingHorizontal: 19,
    borderRadius: 14,
    backgroundColor: "#196b48",
  },
  disabled: { opacity: 0.4 },
  addButtonText: { fontWeight: "700", color: "#ffffff" },
  list: { gap: 9, paddingBottom: 28 },
  emptyList: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  todo: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e1e5e0",
    borderRadius: 15,
    backgroundColor: "#ffffff",
  },
  checkbox: {
    width: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#9eaaa2",
    borderRadius: 8,
  },
  checked: { borderColor: "#196b48", backgroundColor: "#196b48" },
  checkmark: { fontSize: 14, fontWeight: "900", color: "#ffffff" },
  todoTextWrap: { flex: 1 },
  todoText: { fontSize: 16, color: "#24332b" },
  done: { color: "#9ca49f", textDecorationLine: "line-through" },
  category: { marginTop: 3, fontSize: 11, color: "#6f7d75" },
  loader: { flex: 1 },
  empty: { color: "#8a948e" },
  primaryButton: {
    minWidth: 230,
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: "#196b48",
  },
  primaryButtonText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
});
