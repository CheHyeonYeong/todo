import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { ScheduleStore } from "../../workspace/model/store";
import { Card } from "../../shared/ui/Card";
import { showRequestError } from "../../shared/ui/showRequestError";
import { styles } from "./styles";

type Store = ScheduleStore;
const handleRequestError = showRequestError;

export function ScheduleScreen({ store }: { store: Store }) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof store.data.sessions>();
    for (const session of store.data.sessions) {
      const day = session.startedAt.slice(0, 10);
      map.set(day, [...(map.get(day) || []), session]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [store.data.sessions]);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View>
        <Text style={styles.heading}>타임테이블</Text>
        <Text style={styles.muted}>기록한 시간을 날짜별로 돌아보세요.</Text>
      </View>
      {!grouped.length && <Text style={styles.empty}>아직 기록된 작업이 없어요.</Text>}
      {grouped.map(([day, sessions]) => {
        const total = sessions.reduce(
          (sum, session) =>
            sum + Math.max(0, new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()),
          0,
        );
        return (
          <Card key={day}>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>{day}</Text>
              <Text style={styles.chip}>총 {Math.round(total / 60000)}분</Text>
            </View>
            {sessions
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((session) => (
                <View key={session.id} style={styles.listRow}>
                  <View style={styles.flex}>
                    <Text style={styles.todoTitle}>{session.label || "이름 없는 작업"}</Text>
                    <Text style={styles.meta}>
                      {new Date(session.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {new Date(session.endedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {Math.max(
                        1,
                        Math.round(
                          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) /
                            60000,
                        ),
                      )}
                      분
                    </Text>
                  </View>
                  <Pressable onPress={() => void store.deleteSession(session.id).catch(handleRequestError)}>
                    <Text style={styles.danger}>삭제</Text>
                  </Pressable>
                </View>
              ))}
          </Card>
        );
      })}
    </ScrollView>
  );
}
