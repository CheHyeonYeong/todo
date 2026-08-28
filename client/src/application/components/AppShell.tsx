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
import { MemoScreen, TimeScreen } from "../../Screens";
import { TodoScreen } from "../../todo/components/TodoScreen";
import type { useAppData } from "../../useAppData";
import { styles } from "./AppShell.styles";

type WorkspaceData = ReturnType<typeof useAppData>;
type Workspace = "todo" | "memo" | "time";

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

  const content = workspaceData.loading ? (
    <ActivityIndicator style={styles.loader} color="#176b47" />
  ) : desktop ? (
    <View style={styles.dashboard}>
      <View style={styles.dashboardPrimary}>
        <View style={[styles.dashboardPanel, styles.todoPanel]}>
          <TodoScreen store={workspaceData} />
        </View>
        <View style={[styles.dashboardPanel, styles.memoPanel]}>
          <MemoScreen store={workspaceData} />
        </View>
      </View>
      <View style={[styles.dashboardPanel, styles.timePanel]}>
        <TimeScreen store={workspaceData} />
      </View>
    </View>
  ) : workspace === "todo" ? (
    <TodoScreen store={workspaceData} />
  ) : workspace === "memo" ? (
    <MemoScreen store={workspaceData} />
  ) : (
    <TimeScreen store={workspaceData} />
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
          <View style={[styles.content, desktop && styles.desktopContent]}>{content}</View>
          {!desktop && navigation}
        </View>
      </View>
    </SafeAreaView>
  );
}
