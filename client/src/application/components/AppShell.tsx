import type { Session } from "@supabase/supabase-js";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MemoScreen } from "../../notes/components/MemoScreen";
import { TimeScreen } from "../../time/components/TimeScreen";
import { TodoScreen } from "../../todo/components/TodoScreen";
import type { useAppData } from "../../useAppData";
import { styles } from "./AppShell.styles";

type Store = ReturnType<typeof useAppData>;
type Workspace = "todo" | "memo" | "time";

const tabs: { key: Workspace; label: string; icon: string }[] = [
  { key: "todo", label: "할 일", icon: "✓" },
  { key: "memo", label: "메모", icon: "✎" },
  { key: "time", label: "시간", icon: "◷" },
];

export function AppShell({
  session,
  store,
  onLogout,
}: {
  session: Session;
  store: Store;
  onLogout: () => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<Workspace>("todo");
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1100;
  const selectedTab = tabs.find((tab) => tab.key === workspace);
  const selectWorkspace = (next: Workspace) => setWorkspace(next);
  const reloadWorkspace = () => void store.reload();
  const memoActions = {
    memos: store.data.memos,
    addMemo: store.addMemo,
    patchMemo: store.patchMemo,
    deleteMemo: store.deleteMemo,
  };
  const todoActions = {
    todos: store.data.todos,
    addTodo: store.addTodo,
    addTodoWithDefaultDueDate: store.addTodoWithDefaultDueDate,
    patchTodo: store.patchTodo,
    deleteTodo: store.deleteTodo,
    toggleTodo: store.toggleTodo,
  };
  const routineActions = {
    routines: store.data.routines,
    addRoutine: store.addRoutine,
    patchRoutine: store.patchRoutine,
    deleteRoutine: store.deleteRoutine,
  };
  const timeActions = {
    sessions: store.data.sessions,
    activeSession: store.activeSession,
    timerMinutes: store.timerMinutes,
    updateTimerMinutes: store.updateTimerMinutes,
    startSession: store.startSession,
    stopSession: store.stopSession,
    recordTimedSession: store.recordTimedSession,
    recordMomentNote: store.recordMomentNote,
    deleteSession: store.deleteSession,
  };

  const navigation = (
    <View style={desktop ? styles.desktopNav : styles.nav}>
      {desktop && (
        <View style={styles.desktopNavHeader}>
          <Text style={styles.desktopLogo}>Todo</Text>
          <Text style={styles.desktopCaption}>나의 워크스페이스</Text>
        </View>
      )}
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={[
            desktop ? styles.desktopNavItem : styles.navItem,
            desktop && workspace === tab.key && styles.desktopNavSelected,
          ]}
          onPress={() => selectWorkspace(tab.key)}
        >
          <Text style={[styles.navIcon, workspace === tab.key && styles.navActive]}>{tab.icon}</Text>
          <Text
            style={[
              desktop ? styles.desktopNavLabel : styles.navLabel,
              workspace === tab.key && styles.navActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
      {desktop && (
        <View style={styles.desktopAccount}>
          <Text style={styles.desktopEmail} numberOfLines={1}>
            {session.user.email}
          </Text>
          <Pressable onPress={() => void onLogout()}>
            <Text style={styles.logout}>로그아웃</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const content = store.loading ? (
    <ActivityIndicator style={styles.loader} color="#176b47" />
  ) : desktop ? (
    <View style={styles.dashboard}>
      <View style={styles.dashboardPrimary}>
        <View style={[styles.dashboardPanel, styles.todoPanel]}>
          <TodoScreen todoActions={todoActions} routineActions={routineActions} />
        </View>
        <View style={[styles.dashboardPanel, styles.memoPanel]}>
          <MemoScreen memoActions={memoActions} />
        </View>
      </View>
      <View style={[styles.dashboardPanel, styles.timePanel]}>
        <TimeScreen time={timeActions} />
      </View>
    </View>
  ) : workspace === "todo" ? (
    <TodoScreen todoActions={todoActions} routineActions={routineActions} />
  ) : workspace === "memo" ? (
    <MemoScreen memoActions={memoActions} />
  ) : (
    <TimeScreen time={timeActions} />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={desktop ? styles.desktopShell : styles.mobileShell}>
        {desktop && navigation}
        <View style={styles.mainColumn}>
          <View style={[styles.topbar, desktop && styles.desktopTopbar]}>
            <View>
              <Text style={styles.brand}>{desktop ? "Todo Workspace" : selectedTab?.label}</Text>
              <Text style={styles.email}>
                {desktop
                  ? `${session.user.email} · 할 일, 메모, 시간을 한 화면에서 관리하세요.`
                  : session.user.email}
              </Text>
            </View>
            <View style={styles.topActions}>
              <Pressable style={desktop && styles.topActionButton} onPress={reloadWorkspace}>
                <Text style={styles.refresh}>↻ 새로고침</Text>
              </Pressable>
              <Pressable onPress={() => void onLogout()}>
                <Text style={styles.logout}>로그아웃</Text>
              </Pressable>
            </View>
          </View>
          {store.error && (
            <Pressable style={styles.errorBar} onPress={reloadWorkspace}>
              <Text style={styles.errorText}>{store.error} · 다시 시도</Text>
            </Pressable>
          )}
          <View style={[styles.content, desktop && styles.desktopContent]}>{content}</View>
          {!desktop && navigation}
        </View>
      </View>
    </SafeAreaView>
  );
}
