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
import { TimeScreen } from "../../time/components/TimeScreen";
import { MemoScreen } from "../../notes/components/MemoScreen";
import { TodoScreen } from "../../todo/components/TodoScreen";
import { WeeklyCalendarScreen } from "../../todo/components/WeeklyCalendarScreen";
import type { useAppData } from "../../useAppData";
import { styles } from "./AppShell.styles";

type WorkspaceData = ReturnType<typeof useAppData>;
type Workspace = "todo" | "memo" | "time";
type DesktopView = "today" | "weekly" | "monthly" | "memo" | "time";

const tabs: { key: Workspace; label: string; icon: string }[] = [
  { key: "todo", label: "할 일", icon: "✓" },
  { key: "memo", label: "메모", icon: "✎" },
  { key: "time", label: "시간", icon: "◷" },
];

export function AppShell({
  session,
  workspaceData,
  onSignOut,
}: {
  session: Session;
  workspaceData: WorkspaceData;
  onSignOut: () => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<Workspace>("todo");
  const [desktopView, setDesktopView] = useState<DesktopView>("weekly");
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 1100;
  const selectedTab = tabs.find((tab) => tab.key === workspace);
  const selectWorkspace = (next: Workspace) => setWorkspace(next);
  const reloadWorkspace = () => void workspaceData.reload();

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
          <Pressable onPress={() => void onSignOut()}>
            <Text style={styles.logout}>로그아웃</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const desktopContent = workspaceData.loading ? (
    <ActivityIndicator style={styles.loader} color="#176b47" />
  ) : desktopView === "weekly" ? (
    <WeeklyCalendarScreen
      todos={workspaceData.data.todos}
      sessions={workspaceData.data.sessions}
      today={workspaceData.today}
      nowMs={workspaceData.nowMs}
      onAddTodo={workspaceData.addTodo}
      onToggleTodo={workspaceData.toggleTodo}
      onDeleteTodo={workspaceData.deleteTodo}
      onRecordMomentNote={workspaceData.recordMomentNote}
      onDeleteSession={workspaceData.deleteSession}
    />
  ) : desktopView === "today" || desktopView === "monthly" ? (
    <TodoScreen
      key={desktopView}
      initialView={desktopView === "monthly" ? "calendar" : "list"}
      todos={workspaceData.data.todos}
      today={workspaceData.today}
      routines={workspaceData.data.routines}
      onAddTodo={workspaceData.addTodo}
      onAddTodoWithDefaultDueDate={workspaceData.addTodoWithDefaultDueDate}
      onPatchTodo={workspaceData.patchTodo}
      onDeleteTodo={workspaceData.deleteTodo}
      onToggleTodo={workspaceData.toggleTodo}
      onAddRoutine={workspaceData.addRoutine}
      onPatchRoutine={workspaceData.patchRoutine}
      onDeleteRoutine={workspaceData.deleteRoutine}
    />
  ) : desktopView === "memo" ? (
    <MemoScreen
      memos={workspaceData.data.memos}
      onAddMemo={workspaceData.addMemo}
      onPatchMemo={workspaceData.patchMemo}
      onDeleteMemo={workspaceData.deleteMemo}
    />
  ) : (
    <TimeScreen
      sessions={workspaceData.data.sessions}
      activeSession={workspaceData.activeSession}
      today={workspaceData.today}
      nowMs={workspaceData.nowMs}
      timerMinutes={workspaceData.timerMinutes}
      onUpdateTimerMinutes={workspaceData.updateTimerMinutes}
      onStartSession={workspaceData.startSession}
      onStopSession={workspaceData.stopSession}
      onRecordTimedSession={workspaceData.recordTimedSession}
      onRecordMomentNote={workspaceData.recordMomentNote}
      onDeleteSession={workspaceData.deleteSession}
    />
  );

  const mobileContent = workspaceData.loading ? (
    <ActivityIndicator style={styles.loader} color="#176b47" />
  ) : workspace === "todo" ? (
    <TodoScreen
      todos={workspaceData.data.todos}
      today={workspaceData.today}
      routines={workspaceData.data.routines}
      onAddTodo={workspaceData.addTodo}
      onAddTodoWithDefaultDueDate={workspaceData.addTodoWithDefaultDueDate}
      onPatchTodo={workspaceData.patchTodo}
      onDeleteTodo={workspaceData.deleteTodo}
      onToggleTodo={workspaceData.toggleTodo}
      onAddRoutine={workspaceData.addRoutine}
      onPatchRoutine={workspaceData.patchRoutine}
      onDeleteRoutine={workspaceData.deleteRoutine}
    />
  ) : workspace === "memo" ? (
    <MemoScreen
      memos={workspaceData.data.memos}
      onAddMemo={workspaceData.addMemo}
      onPatchMemo={workspaceData.patchMemo}
      onDeleteMemo={workspaceData.deleteMemo}
    />
  ) : (
    <TimeScreen
      sessions={workspaceData.data.sessions}
      activeSession={workspaceData.activeSession}
      today={workspaceData.today}
      nowMs={workspaceData.nowMs}
      timerMinutes={workspaceData.timerMinutes}
      onUpdateTimerMinutes={workspaceData.updateTimerMinutes}
      onStartSession={workspaceData.startSession}
      onStopSession={workspaceData.stopSession}
      onRecordTimedSession={workspaceData.recordTimedSession}
      onRecordMomentNote={workspaceData.recordMomentNote}
      onDeleteSession={workspaceData.deleteSession}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {desktop ? (
        <View style={styles.desktopCalendarShell}>
          <View style={styles.calendarTopbar}>
            <View style={styles.calendarBrandGroup}>
              <Text style={styles.calendarBrand}>BlankDay</Text>
              <View style={styles.calendarNavigation}>
                {(["today", "weekly", "monthly"] as DesktopView[]).map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.calendarNavItem, desktopView === item && styles.calendarNavActive]}
                    onPress={() => setDesktopView(item)}
                  >
                    <Text
                      style={[styles.calendarNavText, desktopView === item && styles.calendarNavTextActive]}
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.calendarActions}>
              <Pressable
                accessibilityLabel="메모"
                style={styles.calendarIconButton}
                onPress={() => setDesktopView("memo")}
              >
                <Text style={styles.calendarIcon}>✎</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="타이머"
                style={styles.calendarIconButton}
                onPress={() => setDesktopView("time")}
              >
                <Text style={styles.calendarIcon}>◷</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="새로고침"
                style={styles.calendarIconButton}
                onPress={reloadWorkspace}
              >
                <Text style={styles.calendarIcon}>↻</Text>
              </Pressable>
              <View style={styles.accountDivider} />
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{session.user.email?.slice(0, 2).toUpperCase() || "ME"}</Text>
              </View>
              <Pressable onPress={() => void onSignOut()}>
                <Text style={styles.calendarEmail} numberOfLines={1}>
                  {session.user.email}
                </Text>
              </Pressable>
            </View>
          </View>
          {workspaceData.error && (
            <Pressable style={styles.errorBar} onPress={reloadWorkspace}>
              <Text style={styles.errorText}>{workspaceData.error} · 다시 시도</Text>
            </Pressable>
          )}
          <View style={styles.desktopCalendarContent}>{desktopContent}</View>
        </View>
      ) : (
        <View style={styles.mobileShell}>
          <View style={styles.mainColumn}>
            <View style={styles.topbar}>
              <View>
                <Text style={styles.brand}>{selectedTab?.label}</Text>
                <Text style={styles.email}>{session.user.email}</Text>
              </View>
              <View style={styles.topActions}>
                <Pressable onPress={reloadWorkspace}>
                  <Text style={styles.refresh}>↻ 새로고침</Text>
                </Pressable>
                <Pressable onPress={() => void onSignOut()}>
                  <Text style={styles.logout}>로그아웃</Text>
                </Pressable>
              </View>
            </View>
            {workspaceData.error && (
              <Pressable style={styles.errorBar} onPress={reloadWorkspace}>
                <Text style={styles.errorText}>{workspaceData.error} · 다시 시도</Text>
              </Pressable>
            )}
            <View style={styles.content}>{mobileContent}</View>
            {navigation}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
